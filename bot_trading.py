#!/usr/bin/env python3
"""Bot de trading — le deuxième bot du dépôt.

Il ne traite que cinq marchés, et rien d'autre :

    📈 S&P 500   retour à la moyenne, bougies 15 min
    📈 NASDAQ    retour à la moyenne, bougies 15 min
    ₿  Bitcoin   cassure en momentum, bougies 1 h
    🥇 Or        suivi de tendance lent, bougies 4 h
    🛢 Pétrole   suivi de tendance lent, bougies 4 h

Trois garde-fous, appliqués à *chaque* trade, sans exception :

    1. un stop de perte dur à 1 % du prix d'entrée ;
    2. une taille de position ajustée à la volatilité du marché ;
    3. un filtre de corrélation : jamais deux positions de même sens dans
       un même groupe — le S&P 500 et le NASDAQ montent ensemble, être
       long des deux, c'est le même pari pris deux fois.

⚠️ Le bot ne passe **aucun ordre réel**. Il lit des bougies, décide, et
tient un portefeuille simulé. Brancher un courtier demanderait un
adaptateur d'exécution que ce fichier n'a volontairement pas.

Exemples :
    python3 bot_trading.py --demo                     # backtest sur données de démo
    python3 bot_trading.py --demo --rapport matin     # le message du matin
    python3 bot_trading.py --demo --rapport soir      # le message du soir
    python3 bot_trading.py --marches marches --format markdown --sortie bot.md
"""

from __future__ import annotations

import argparse
import csv
import math
import os
import random
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from html import escape
from pathlib import Path
from zoneinfo import ZoneInfo

FUSEAU = ZoneInfo("Europe/Paris")
UTC = ZoneInfo("UTC")

# --------------------------------------------------------------------------
# Les cinq marchés — et rien d'autre
# --------------------------------------------------------------------------

RETOUR_MOYENNE = "retour_moyenne"
CASSURE = "cassure"
TENDANCE = "tendance"

LONG = "long"
COURT = "court"


@dataclass(frozen=True)
class Marche:
    """Un marché traité par le bot, avec la stratégie qui lui est attachée."""

    code: str
    nom: str
    pastille: str
    strategie: str
    unite: str          # durée d'une bougie, pour l'affichage
    minutes: int        # la même durée, en minutes
    groupe: str         # groupe de corrélation

    @property
    def intitule(self) -> str:
        return f"{self.pastille} {self.nom}"


MARCHES: tuple[Marche, ...] = (
    Marche("SP500", "S&P 500", "📈", RETOUR_MOYENNE, "15 min", 15, "actions"),
    Marche("NASDAQ", "NASDAQ", "📈", RETOUR_MOYENNE, "15 min", 15, "actions"),
    Marche("BITCOIN", "Bitcoin", "₿", CASSURE, "1 h", 60, "crypto"),
    # L'or et le pétrole sont tous deux des matières premières, mais ils ne
    # montent pas ensemble — valeur refuge d'un côté, demande industrielle de
    # l'autre. Chacun son groupe : le filtre ne doit pas bloquer des paris
    # qui sont bel et bien distincts.
    Marche("OR", "Or", "🥇", TENDANCE, "4 h", 240, "or"),
    Marche("PETROLE", "Pétrole", "🛢", TENDANCE, "4 h", 240, "petrole"),
)

PAR_CODE = {marche.code: marche for marche in MARCHES}

LIBELLES_STRATEGIE = {
    RETOUR_MOYENNE: "retour à la moyenne",
    CASSURE: "cassure en momentum",
    TENDANCE: "suivi de tendance lent",
}

COLONNES_BOUGIES = ("horodatage", "ouverture", "haut", "bas", "cloture", "volume")

JOURS = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")

MOIS = (
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
)

ANSI_VERT = "\033[32m"
ANSI_ROUGE = "\033[31m"
ANSI_GRAS = "\033[1m"
ANSI_FIN = "\033[0m"


class ErreurMarche(Exception):
    """Les bougies sont absentes, mal formées ou incohérentes."""


# --------------------------------------------------------------------------
# Les bougies
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Chandelle:
    horodatage: datetime
    ouverture: float
    haut: float
    bas: float
    cloture: float
    volume: float


def lire_bougies(chemin: Path) -> list[Chandelle]:
    """Charge un CSV de bougies en vérifiant sa cohérence.

    Colonnes attendues : horodatage,ouverture,haut,bas,cloture,volume
    L'horodatage est une date ISO 8601 ; sans fuseau, il est lu en UTC.
    """
    try:
        contenu = chemin.read_text(encoding="utf-8-sig")
    except FileNotFoundError as erreur:
        raise ErreurMarche(f"bougies introuvables : {chemin}") from erreur

    lecteur = csv.DictReader(contenu.splitlines())
    entetes = lecteur.fieldnames or []
    manquantes = [c for c in COLONNES_BOUGIES if c not in entetes]
    if manquantes:
        raise ErreurMarche(
            f"{chemin.name} : colonnes manquantes — " + ", ".join(manquantes)
        )

    bougies: list[Chandelle] = []
    for numero, ligne in enumerate(lecteur, start=2):  # ligne 1 = en-têtes
        if not (ligne.get("horodatage") or "").strip():
            continue  # ligne vide ou séparateur : on l'ignore
        try:
            moment = datetime.fromisoformat(ligne["horodatage"].strip())
            valeurs = {
                colonne: float(ligne[colonne])
                for colonne in ("ouverture", "haut", "bas", "cloture", "volume")
            }
        except (TypeError, ValueError) as erreur:
            raise ErreurMarche(
                f"{chemin.name} ligne {numero} : bougie illisible ({erreur})."
            ) from erreur

        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=UTC)
        if valeurs["haut"] < valeurs["bas"]:
            raise ErreurMarche(
                f"{chemin.name} ligne {numero} : le haut est sous le bas."
            )
        if bougies and moment <= bougies[-1].horodatage:
            raise ErreurMarche(
                f"{chemin.name} ligne {numero} : les bougies ne sont pas dans "
                "l'ordre chronologique."
            )
        bougies.append(Chandelle(horodatage=moment, **valeurs))

    if not bougies:
        raise ErreurMarche(f"aucune bougie dans {chemin}.")
    return bougies


def charger_marches(dossier: Path) -> dict[str, list[Chandelle]]:
    """Lit un fichier CSV par marché : marches/SP500.csv, marches/OR.csv…

    Un marché sans fichier est simplement absent : le bot travaille avec
    ceux qu'il a, plutôt que de refuser de démarrer.
    """
    if not dossier.is_dir():
        raise ErreurMarche(f"dossier de marchés introuvable : {dossier}")

    series: dict[str, list[Chandelle]] = {}
    for marche in MARCHES:
        chemin = dossier / f"{marche.code}.csv"
        if chemin.exists():
            series[marche.code] = lire_bougies(chemin)

    if not series:
        raise ErreurMarche(
            f"aucun fichier de marché dans {dossier} — attendu par exemple "
            f"{dossier}/SP500.csv. Essayer --demo pour des données de test."
        )
    return series


# --------------------------------------------------------------------------
# Indicateurs
# --------------------------------------------------------------------------


def moyenne(valeurs: list[float]) -> float:
    return sum(valeurs) / len(valeurs)


def ecart_type(valeurs: list[float]) -> float:
    """Écart-type de population — c'est un lot de bougies, pas un échantillon."""
    centre = moyenne(valeurs)
    return math.sqrt(sum((v - centre) ** 2 for v in valeurs) / len(valeurs))


def moyenne_mobile(bougies: list[Chandelle], periode: int) -> float | None:
    if len(bougies) < periode:
        return None
    return moyenne([b.cloture for b in bougies[-periode:]])


def ecart_normalise(bougies: list[Chandelle], periode: int) -> float | None:
    """De combien d'écarts-types la clôture s'éloigne de sa moyenne mobile.

    C'est le « trop loin dans une direction » du retour à la moyenne :
    −2 veut dire que le prix est deux écarts-types sous sa moyenne.
    """
    if len(bougies) < periode:
        return None
    clotures = [b.cloture for b in bougies[-periode:]]
    dispersion = ecart_type(clotures)
    if dispersion == 0:
        return 0.0
    return (bougies[-1].cloture - moyenne(clotures)) / dispersion


def atr(bougies: list[Chandelle], periode: int) -> float | None:
    """Amplitude vraie moyenne : la volatilité qui dimensionne les positions."""
    if len(bougies) < periode + 1:
        return None
    amplitudes = []
    for precedente, courante in zip(bougies[-periode - 1:-1], bougies[-periode:]):
        amplitudes.append(
            max(
                courante.haut - courante.bas,
                abs(courante.haut - precedente.cloture),
                abs(courante.bas - precedente.cloture),
            )
        )
    return moyenne(amplitudes)


def plus_haut(bougies: list[Chandelle], periode: int) -> float | None:
    """Le sommet des `periode` bougies *précédentes* — le niveau à casser."""
    if len(bougies) < periode + 1:
        return None
    return max(b.haut for b in bougies[-periode - 1:-1])


def plus_bas(bougies: list[Chandelle], periode: int) -> float | None:
    if len(bougies) < periode + 1:
        return None
    return min(b.bas for b in bougies[-periode - 1:-1])


def volume_moyen(bougies: list[Chandelle], periode: int) -> float | None:
    if len(bougies) < periode + 1:
        return None
    return moyenne([b.volume for b in bougies[-periode - 1:-1]])


# --------------------------------------------------------------------------
# Stratégies
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Reglages:
    """Les paramètres des trois stratégies, tous au même endroit."""

    # Retour à la moyenne (S&P 500, NASDAQ — 15 min)
    periode_moyenne: int = 20
    seuil_entree: float = 2.0        # écarts-types avant d'entrer
    seuil_sortie: float = 0.3        # écarts-types : on est revenu à la moyenne
    periode_tendance: int = 50
    tendance_max: float = 0.004      # au-delà, le marché tend : on s'abstient

    # Cassure en momentum (Bitcoin — 1 h)
    periode_canal: int = 20
    facteur_volume: float = 1.5      # volume exigé, en multiple du volume moyen
    periode_suivi: int = 10          # moyenne qui sert de sortie

    # Suivi de tendance (Or, Pétrole — 4 h). Volontairement lent : les
    # matières premières avancent par vagues plus propres que les indices,
    # et une entrée qui réagit vite ne ferait qu'attraper le bruit.
    moyenne_rapide: int = 20
    moyenne_lente: int = 80
    periode_confirmation: int = 30
    separation_min: float = 0.5      # écart entre les moyennes, en ATR
    marge_cassure: float = 0.25      # dépassement exigé de l'extrême, en ATR

    # Volatilité
    periode_atr: int = 14


@dataclass(frozen=True)
class Signal:
    sens: str
    motif: str


def signal_retour_moyenne(bougies: list[Chandelle], r: Reglages) -> Signal | None:
    """Le prix est allé trop loin : on prend le retour vers la moyenne.

    Ne se déclenche qu'en marché sans direction — c'est là que les petites
    occasions se répètent. Dès que la moyenne courte décroche de la longue,
    le marché tend et le retour à la moyenne se fait écraser.
    """
    ecart = ecart_normalise(bougies, r.periode_moyenne)
    courte = moyenne_mobile(bougies, r.periode_moyenne)
    longue = moyenne_mobile(bougies, r.periode_tendance)
    if ecart is None or courte is None or longue is None or longue == 0:
        return None

    if abs(courte - longue) / longue > r.tendance_max:
        return None  # marché en tendance : pas notre terrain

    if ecart <= -r.seuil_entree:
        return Signal(LONG, f"prix à {nombre(ecart)}σ sous sa moyenne")
    if ecart >= r.seuil_entree:
        return Signal(COURT, f"prix à {nombre(ecart)}σ au-dessus de sa moyenne")
    return None


def signal_cassure(bougies: list[Chandelle], r: Reglages) -> Signal | None:
    """Le prix traverse un niveau clé avec du volume derrière.

    Sans le volume, une sortie de canal est le plus souvent un faux signal :
    la condition de volume est ce qui distingue la vraie cassure.
    """
    sommet = plus_haut(bougies, r.periode_canal)
    creux = plus_bas(bougies, r.periode_canal)
    reference = volume_moyen(bougies, r.periode_canal)
    if sommet is None or creux is None or reference is None or reference == 0:
        return None

    derniere = bougies[-1]
    rapport = derniere.volume / reference
    if rapport < r.facteur_volume:
        return None  # ça casse, mais sans conviction : on laisse passer

    if derniere.cloture > sommet:
        return Signal(LONG, f"cassure du sommet ({nombre(rapport, signe_=False)}× le volume moyen)")
    if derniere.cloture < creux:
        return Signal(COURT, f"cassure du creux ({nombre(rapport, signe_=False)}× le volume moyen)")
    return None


def signal_tendance(bougies: list[Chandelle], r: Reglages) -> Signal | None:
    """On suit la vague, lentement, sans se laisser entrer par le bruit.

    Les matières premières avancent par vagues plus propres que les indices :
    la stratégie est délibérément lente, et refuse toute entrée marginale.
    Deux filtres pour ça, tous deux mesurés en ATR, donc à l'échelle du
    marché plutôt qu'en pourcentage arbitraire :

    - les deux moyennes doivent être franchement séparées — un croisement
      de justesse va et vient au gré du bruit, ce n'est pas une tendance ;
    - la clôture doit dépasser l'extrême précédent d'une vraie marge, pas
      l'effleurer.

    La sortie, elle, reste sur le simple croisement inverse : lent à entrer,
    prompt à partir.
    """
    rapide = moyenne_mobile(bougies, r.moyenne_rapide)
    lente = moyenne_mobile(bougies, r.moyenne_lente)
    sommet = plus_haut(bougies, r.periode_confirmation)
    creux = plus_bas(bougies, r.periode_confirmation)
    volatilite = atr(bougies, r.periode_atr)
    if rapide is None or lente is None or sommet is None or creux is None:
        return None
    if not volatilite:
        return None

    separation = (rapide - lente) / volatilite
    marge = volatilite * r.marge_cassure
    derniere = bougies[-1]

    if separation >= r.separation_min and derniere.cloture > sommet + marge:
        return Signal(LONG, "vague haussière installée, sommet franchi net")
    if separation <= -r.separation_min and derniere.cloture < creux - marge:
        return Signal(COURT, "vague baissière installée, creux enfoncé net")
    return None


STRATEGIES = {
    RETOUR_MOYENNE: signal_retour_moyenne,
    CASSURE: signal_cassure,
    TENDANCE: signal_tendance,
}


def signal_entree(marche: Marche, bougies: list[Chandelle], r: Reglages) -> Signal | None:
    return STRATEGIES[marche.strategie](bougies, r)


def motif_sortie(
    marche: Marche, sens: str, bougies: list[Chandelle], r: Reglages
) -> str | None:
    """Sortie normale, hors stop : chaque stratégie a la sienne."""
    if marche.strategie == RETOUR_MOYENNE:
        ecart = ecart_normalise(bougies, r.periode_moyenne)
        if ecart is not None and abs(ecart) <= r.seuil_sortie:
            return "retour à la moyenne fait"
        return None

    if marche.strategie == CASSURE:
        suivi = moyenne_mobile(bougies, r.periode_suivi)
        if suivi is None:
            return None
        cloture = bougies[-1].cloture
        if (sens == LONG and cloture < suivi) or (sens == COURT and cloture > suivi):
            return "le momentum s'est éteint"
        return None

    rapide = moyenne_mobile(bougies, r.moyenne_rapide)
    lente = moyenne_mobile(bougies, r.moyenne_lente)
    if rapide is None or lente is None:
        return None
    if (sens == LONG and rapide < lente) or (sens == COURT and rapide > lente):
        return "la tendance s'est retournée"
    return None


# --------------------------------------------------------------------------
# Gestion du risque
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Risque:
    """Ce qui empêche le bot de faire sauter le compte."""

    stop_perte: float = 0.01           # 1 % du prix d'entrée, dur, sans exception
    risque_par_trade: float = 0.0025   # 0,25 % du capital perdus si le stop tombe
    volatilite_cible: float = 0.01     # ATR/prix visé ; au-delà, on réduit
    exposition_max: float = 0.25       # part du capital dans une seule position
    positions_max: int = 3

    # Un stop à 1 % veut dire qu'il faut 25 % du capital en position pour
    # risquer 0,25 % : les deux chiffres se rejoignent pile sur le plafond
    # d'exposition. C'est voulu — l'ajustement à la volatilité ne fait donc
    # que réduire la taille, et le plafond reste une sécurité, pas la règle
    # qui décide à sa place.


def prix_stop(sens: str, prix: float, risque: Risque) -> float:
    """Le stop dur : 1 % sous l'entrée en long, 1 % au-dessus en court."""
    if sens == LONG:
        return prix * (1 - risque.stop_perte)
    return prix * (1 + risque.stop_perte)


def taille_position(
    capital: float, prix: float, volatilite: float | None, risque: Risque
) -> float:
    """Combien d'unités acheter, une fois le stop et la volatilité pris en compte.

    Le stop étant à 1 %, la quantité qui met exactement `risque_par_trade`
    du capital en jeu est immédiate. On la réduit ensuite quand le marché
    bouge plus que la volatilité cible : deux fois plus agité, deux fois
    plus petit.
    """
    if capital <= 0 or prix <= 0:
        return 0.0

    distance = prix * risque.stop_perte
    quantite = (capital * risque.risque_par_trade) / distance

    if volatilite:
        agitation = volatilite / prix
        if agitation > risque.volatilite_cible:
            quantite *= risque.volatilite_cible / agitation

    plafond = (capital * risque.exposition_max) / prix
    return min(quantite, plafond)


def refus_correlation(
    marche: Marche, sens: str, positions: dict[str, "Position"]
) -> str | None:
    """Interdit une deuxième position de même sens dans un groupe corrélé.

    Sans ce filtre, un long S&P 500 et un long NASDAQ ne font qu'un seul
    pari, pris deux fois — et le stop de 1 % se paie deux fois aussi.
    """
    for position in positions.values():
        autre = PAR_CODE[position.marche]
        if autre.groupe == marche.groupe and position.sens == sens:
            return f"{autre.nom} est déjà {'long' if sens == LONG else 'court'}"
    return None


# --------------------------------------------------------------------------
# Portefeuille simulé
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Position:
    marche: str
    sens: str
    prix_entree: float
    quantite: float
    stop: float
    entree_le: datetime
    motif: str

    def gain_latent(self, prix: float) -> float:
        ecart = prix - self.prix_entree
        return ecart * self.quantite if self.sens == LONG else -ecart * self.quantite


@dataclass(frozen=True)
class Trade:
    """Une position refermée — la ligne du journal."""

    marche: str
    sens: str
    prix_entree: float
    prix_sortie: float
    quantite: float
    entree_le: datetime
    sortie_le: datetime
    motif_entree: str
    motif_sortie: str
    gain: float

    @property
    def gagnant(self) -> bool:
        return self.gain > 0

    @property
    def rendement(self) -> float:
        """Le gain rapporté à la mise, en pourcentage."""
        mise = self.prix_entree * self.quantite
        return 0.0 if mise == 0 else self.gain / mise


@dataclass
class Portefeuille:
    capital_initial: float
    capital: float = 0.0
    positions: dict[str, Position] = field(default_factory=dict)
    journal: list[Trade] = field(default_factory=list)
    refuses: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.capital:
            self.capital = self.capital_initial

    def ouvrir(self, position: Position) -> None:
        self.positions[position.marche] = position

    def fermer(
        self, code: str, prix: float, moment: datetime, motif: str
    ) -> Trade:
        position = self.positions.pop(code)
        gain = position.gain_latent(prix)
        self.capital += gain
        trade = Trade(
            marche=code,
            sens=position.sens,
            prix_entree=position.prix_entree,
            prix_sortie=prix,
            quantite=position.quantite,
            entree_le=position.entree_le,
            sortie_le=moment,
            motif_entree=position.motif,
            motif_sortie=motif,
            gain=gain,
        )
        self.journal.append(trade)
        return trade

    def valeur(self, derniers_prix: dict[str, float]) -> float:
        """Capital réalisé plus le latent des positions encore ouvertes."""
        latent = sum(
            position.gain_latent(derniers_prix[code])
            for code, position in self.positions.items()
            if code in derniers_prix
        )
        return self.capital + latent

    @property
    def rendement(self) -> float:
        if not self.capital_initial:
            return 0.0
        return (self.capital - self.capital_initial) / self.capital_initial


def stop_touche(position: Position, bougie: Chandelle) -> bool:
    """Le stop se juge sur la mèche, pas sur la clôture."""
    if position.sens == LONG:
        return bougie.bas <= position.stop
    return bougie.haut >= position.stop


# --------------------------------------------------------------------------
# Le moteur
# --------------------------------------------------------------------------


def chronologie(series: dict[str, list[Chandelle]]) -> list[tuple[datetime, str, int]]:
    """Range toutes les bougies de tous les marchés dans l'ordre du temps.

    Les cinq marchés n'ont pas la même unité de temps — 15 min, 1 h, 4 h —
    mais partagent un seul capital et un seul filtre de corrélation : il
    faut donc les rejouer sur une seule ligne de temps.
    """
    evenements = [
        (bougie.horodatage, code, indice)
        for code, bougies in series.items()
        for indice, bougie in enumerate(bougies)
    ]
    evenements.sort(key=lambda e: (e[0], e[1]))
    return evenements


def rejouer(
    series: dict[str, list[Chandelle]],
    capital: float = 10_000.0,
    reglages: Reglages | None = None,
    risque: Risque | None = None,
) -> Portefeuille:
    """Rejoue l'historique bougie par bougie et renvoie le portefeuille obtenu.

    Sur chaque bougie, dans cet ordre : le stop d'abord (il ne se discute
    pas), puis la sortie de stratégie, puis seulement une éventuelle
    entrée. Une entrée n'est jamais décidée sur une bougie future : la
    stratégie ne voit que l'historique jusqu'à la bougie en cours.
    """
    reglages = reglages or Reglages()
    risque = risque or Risque()
    portefeuille = Portefeuille(capital_initial=capital)

    for moment, code, indice in chronologie(series):
        marche = PAR_CODE[code]
        historique = series[code][: indice + 1]
        bougie = historique[-1]

        position = portefeuille.positions.get(code)
        if position is not None:
            if stop_touche(position, bougie):
                portefeuille.fermer(code, position.stop, moment, "stop à 1 % touché")
                continue
            motif = motif_sortie(marche, position.sens, historique, reglages)
            if motif:
                portefeuille.fermer(code, bougie.cloture, moment, motif)
            continue  # une seule position par marché à la fois

        if len(portefeuille.positions) >= risque.positions_max:
            continue

        signal = signal_entree(marche, historique, reglages)
        if signal is None:
            continue

        refus = refus_correlation(marche, signal.sens, portefeuille.positions)
        if refus:
            portefeuille.refuses.append(f"{marche.nom} — {refus}")
            continue

        volatilite = atr(historique, reglages.periode_atr)
        quantite = taille_position(
            portefeuille.capital, bougie.cloture, volatilite, risque
        )
        if quantite <= 0:
            continue

        portefeuille.ouvrir(
            Position(
                marche=code,
                sens=signal.sens,
                prix_entree=bougie.cloture,
                quantite=quantite,
                stop=prix_stop(signal.sens, bougie.cloture, risque),
                entree_le=moment,
                motif=signal.motif,
            )
        )

    return portefeuille


# --------------------------------------------------------------------------
# Statistiques
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Bilan:
    trades: int
    gagnants: int
    gain_total: float
    gain_moyen: float
    perte_moyenne: float
    plus_fort_recul: float

    @property
    def taux_reussite(self) -> float:
        return 0.0 if not self.trades else self.gagnants / self.trades


def plus_fort_recul(journal: list[Trade], capital_initial: float) -> float:
    """La pire descente depuis un sommet, en part du capital.

    Mesurée sur le capital réalisé, trade après trade : c'est ce que la
    gérante verrait sur son relevé, pas une courbe intra-position.
    """
    capital = sommet = capital_initial
    recul = 0.0
    for trade in journal:
        capital += trade.gain
        sommet = max(sommet, capital)
        if sommet > 0:
            recul = max(recul, (sommet - capital) / sommet)
    return recul


def bilan(journal: list[Trade], capital_initial: float) -> Bilan:
    gains = [t.gain for t in journal if t.gagnant]
    pertes = [t.gain for t in journal if not t.gagnant]
    return Bilan(
        trades=len(journal),
        gagnants=len(gains),
        gain_total=sum(t.gain for t in journal),
        gain_moyen=moyenne(gains) if gains else 0.0,
        perte_moyenne=moyenne(pertes) if pertes else 0.0,
        plus_fort_recul=plus_fort_recul(journal, capital_initial),
    )


def bilan_par_marche(journal: list[Trade], capital_initial: float) -> dict[str, Bilan]:
    """Un bilan par marché, dans l'ordre fixe des cinq marchés."""
    resultats: dict[str, Bilan] = {}
    for marche in MARCHES:
        trades = [t for t in journal if t.marche == marche.code]
        if trades:
            resultats[marche.code] = bilan(trades, capital_initial)
    return resultats


@dataclass(frozen=True)
class Etat:
    """Ce que le bot voit d'un marché à l'instant présent."""

    marche: Marche
    prix: float
    moment: datetime
    lecture: str
    signal: Signal | None


def etat_du_marche(
    marche: Marche, bougies: list[Chandelle], reglages: Reglages
) -> Etat:
    """La phrase du matin pour un marché : où en est-il, et qu'attend le bot."""
    derniere = bougies[-1]

    if marche.strategie == RETOUR_MOYENNE:
        ecart = ecart_normalise(bougies, reglages.periode_moyenne)
        lecture = (
            "pas encore assez de bougies"
            if ecart is None
            else f"à {nombre(ecart)}σ de sa moyenne"
        )
    elif marche.strategie == CASSURE:
        sommet = plus_haut(bougies, reglages.periode_canal)
        reference = volume_moyen(bougies, reglages.periode_canal)
        if sommet is None or not reference:
            lecture = "pas encore assez de bougies"
        else:
            distance = (sommet - derniere.cloture) / derniere.cloture * 100
            lecture = (
                f"sommet du canal à {nombre(distance)} %, "
                f"volume {nombre(derniere.volume / reference, signe_=False)}× la moyenne"
            )
    else:
        rapide = moyenne_mobile(bougies, reglages.moyenne_rapide)
        lente = moyenne_mobile(bougies, reglages.moyenne_lente)
        volatilite = atr(bougies, reglages.periode_atr)
        if rapide is None or lente is None or not volatilite:
            lecture = "pas encore assez de bougies"
        else:
            # L'écart en ATR est ce qui décide : le dire, plutôt que de
            # trancher « haussière » sur un croisement qui ne tient à rien.
            separation = (rapide - lente) / volatilite
            if abs(separation) < reglages.separation_min:
                lecture = f"pas de vague nette ({nombre(separation)} ATR d'écart)"
            else:
                sens = "haussière" if separation > 0 else "baissière"
                lecture = f"vague {sens} ({nombre(separation)} ATR d'écart)"

    return Etat(
        marche=marche,
        prix=derniere.cloture,
        moment=derniere.horodatage,
        lecture=lecture,
        signal=signal_entree(marche, bougies, reglages),
    )


def etats(
    series: dict[str, list[Chandelle]], reglages: Reglages
) -> list[Etat]:
    return [
        etat_du_marche(marche, series[marche.code], reglages)
        for marche in MARCHES
        if marche.code in series
    ]


# --------------------------------------------------------------------------
# Mise en forme
# --------------------------------------------------------------------------


def date_lisible(moment: datetime) -> str:
    moment = moment.astimezone(FUSEAU)
    return (
        f"{JOURS[moment.weekday()]} {moment.day} {MOIS[moment.month - 1]} "
        f"{moment.year}, {moment:%Hh%M}"
    )


# Espace fine insécable : le séparateur de milliers français. Nommée plutôt
# qu'écrite en clair, où elle serait indiscernable d'une espace ordinaire.
ESPACE_FINE = "\u202f"


def somme(montant: float) -> str:
    """12 345,60 € — espace fine pour les milliers, virgule décimale."""
    texte = f"{montant:,.2f}".replace(",", ESPACE_FINE).replace(".", ",")
    return f"{texte} €"


def signe(montant: float) -> str:
    return f"{'+' if montant >= 0 else '−'}{somme(abs(montant))}"


def pourcentage(part: float) -> str:
    """+4,37 % — signé, virgule décimale, vrai signe moins."""
    return f"{part * 100:+.2f} %".replace(".", ",").replace("-", "−")


def taux(part: float, decimales: int = 0) -> str:
    """24 % — sans signe : un taux de réussite, un recul."""
    return f"{part * 100:.{decimales}f} %".replace(".", ",")


def nombre(valeur: float, decimales: int = 1, signe_: bool = True) -> str:
    """−2,6 — un écart en σ ou en ATR, à la française."""
    format_ = f"{{:{'+' if signe_ else ''}.{decimales}f}}"
    return format_.format(valeur).replace(".", ",").replace("-", "−")


def _peindre(texte: str, montant: float, couleur: bool) -> str:
    if not couleur:
        return texte
    teinte = ANSI_VERT if montant >= 0 else ANSI_ROUGE
    return f"{teinte}{ANSI_GRAS}{texte}{ANSI_FIN}"


def ligne_position(position: Position, prix: float | None = None) -> str:
    marche = PAR_CODE[position.marche]
    sens = "long" if position.sens == LONG else "court"
    texte = (
        f"  • {marche.intitule} — {sens} depuis {somme(position.prix_entree)}, "
        f"stop {somme(position.stop)}"
    )
    if prix is not None:
        texte += f" — latent {signe(position.gain_latent(prix))}"
    return texte


# --------------------------------------------------------------------------
# Les deux messages du jour, et le rapport de backtest
# --------------------------------------------------------------------------


def message_matin(
    portefeuille: Portefeuille,
    liste_etats: list[Etat],
    derniers_prix: dict[str, float],
    moment: datetime,
) -> str:
    """« Voilà ce qui se passe sur les marchés en ouvrant la journée. »"""
    lignes = [
        "=" * 68,
        f"☀️  LES MARCHÉS — {date_lisible(moment)}",
        "=" * 68,
        "",
    ]
    for etat in liste_etats:
        marche = etat.marche
        lignes.append(
            f"{marche.intitule} — {somme(etat.prix)}  "
            f"[{LIBELLES_STRATEGIE[marche.strategie]}, {marche.unite}]"
        )
        lignes.append(f"    {etat.lecture}")
        if etat.signal:
            sens = "d'achat" if etat.signal.sens == LONG else "de vente"
            lignes.append(f"    → signal {sens} : {etat.signal.motif}")

    lignes += ["", "-" * 68]
    if portefeuille.positions:
        lignes.append(f"Positions ouvertes ({len(portefeuille.positions)}) :")
        for position in portefeuille.positions.values():
            lignes.append(ligne_position(position, derniers_prix.get(position.marche)))
    else:
        lignes.append("Aucune position ouverte — le bot attend son signal.")

    lignes += [
        "",
        f"Capital : {somme(portefeuille.valeur(derniers_prix))}",
        "",
    ]
    return "\n".join(lignes)


def message_soir(
    portefeuille: Portefeuille,
    derniers_prix: dict[str, float],
    moment: datetime,
    couleur: bool = False,
) -> str:
    """« Voilà exactement où en est le portefeuille ce soir. »"""
    valeur = portefeuille.valeur(derniers_prix)
    variation = valeur - portefeuille.capital_initial
    resultat = bilan(portefeuille.journal, portefeuille.capital_initial)

    lignes = [
        "=" * 68,
        f"🌙 LE PORTEFEUILLE — {date_lisible(moment)}",
        "=" * 68,
        "",
        f"Capital : {somme(valeur)}   "
        + _peindre(
            f"{signe(variation)} ({pourcentage(variation / portefeuille.capital_initial)})",
            variation,
            couleur,
        ),
        f"Trades refermés : {resultat.trades}   "
        f"Gagnants : {resultat.gagnants} ({taux(resultat.taux_reussite)})",
        f"Gain moyen : {signe(resultat.gain_moyen)}   "
        f"Perte moyenne : {signe(resultat.perte_moyenne)}",
        f"Plus fort recul : −{taux(resultat.plus_fort_recul, 1)}",
        "",
        "-" * 68,
    ]

    if portefeuille.positions:
        lignes.append(f"Positions ouvertes ({len(portefeuille.positions)}) :")
        for position in portefeuille.positions.values():
            lignes.append(ligne_position(position, derniers_prix.get(position.marche)))
    else:
        lignes.append("Aucune position ouverte cette nuit.")

    derniers = portefeuille.journal[-5:]
    if derniers:
        lignes += ["", "Les derniers trades :"]
        for trade in derniers:
            marche = PAR_CODE[trade.marche]
            lignes.append(
                f"  • {marche.intitule} {'long' if trade.sens == LONG else 'court'} — "
                + _peindre(signe(trade.gain), trade.gain, couleur)
                + f" ({pourcentage(trade.rendement)}) — {trade.motif_sortie}"
            )

    lignes.append("")
    return "\n".join(lignes)


def rendu_texte(
    portefeuille: Portefeuille,
    liste_etats: list[Etat],
    derniers_prix: dict[str, float],
    moment: datetime,
    couleur: bool,
) -> str:
    """Le rapport complet : le backtest, marché par marché."""
    resultat = bilan(portefeuille.journal, portefeuille.capital_initial)
    valeur = portefeuille.valeur(derniers_prix)
    variation = valeur - portefeuille.capital_initial

    lignes = [
        "=" * 68,
        f"BOT DE TRADING — {date_lisible(moment)}",
        "=" * 68,
        "",
        f"Capital de départ : {somme(portefeuille.capital_initial)}",
        f"Capital final     : {somme(valeur)}   "
        + _peindre(
            f"{signe(variation)} ({pourcentage(variation / portefeuille.capital_initial)})",
            variation,
            couleur,
        ),
        f"Trades            : {resultat.trades} "
        f"({resultat.gagnants} gagnants, {taux(resultat.taux_reussite)})",
        f"Gain moyen        : {signe(resultat.gain_moyen)}",
        f"Perte moyenne     : {signe(resultat.perte_moyenne)}",
        f"Plus fort recul   : −{taux(resultat.plus_fort_recul, 1)}",
        "",
        "PAR MARCHÉ",
        "-" * 68,
    ]

    detail = bilan_par_marche(portefeuille.journal, portefeuille.capital_initial)
    for marche in MARCHES:
        part = detail.get(marche.code)
        if part is None:
            lignes.append(f"  {marche.intitule} — aucun trade")
            continue
        lignes.append(
            f"  {marche.intitule} — {part.trades} trade"
            f"{'s' if part.trades > 1 else ''}, "
            f"{taux(part.taux_reussite)} gagnants, "
            + _peindre(signe(part.gain_total), part.gain_total, couleur)
            + f"  [{LIBELLES_STRATEGIE[marche.strategie]}, {marche.unite}]"
        )

    if portefeuille.refuses:
        nombre = len(portefeuille.refuses)
        lignes += [
            "",
            f"FILTRE DE CORRÉLATION — {nombre} entrée"
            f"{'s' if nombre > 1 else ''} refusée{'s' if nombre > 1 else ''}",
            "-" * 68,
        ]
        for refus in portefeuille.refuses[:5]:
            lignes.append(f"  • {refus}")
        if len(portefeuille.refuses) > 5:
            lignes.append(f"  … et {len(portefeuille.refuses) - 5} autres")

    if portefeuille.positions:
        lignes += ["", "POSITIONS OUVERTES", "-" * 68]
        for position in portefeuille.positions.values():
            lignes.append(ligne_position(position, derniers_prix.get(position.marche)))

    lignes += ["", "Portefeuille simulé : aucun ordre réel n'a été passé.", ""]
    return "\n".join(lignes)


def rendu_markdown(
    portefeuille: Portefeuille,
    liste_etats: list[Etat],
    derniers_prix: dict[str, float],
    moment: datetime,
) -> str:
    resultat = bilan(portefeuille.journal, portefeuille.capital_initial)
    valeur = portefeuille.valeur(derniers_prix)
    variation = valeur - portefeuille.capital_initial
    detail = bilan_par_marche(portefeuille.journal, portefeuille.capital_initial)

    lignes = [
        f"# Bot de trading — {date_lisible(moment)}",
        "",
        f"**{somme(valeur)}** — {signe(variation)} "
        f"({pourcentage(variation / portefeuille.capital_initial)}) "
        f"sur {resultat.trades} trades.",
        "",
        "| | |",
        "| --- | --- |",
        f"| Capital de départ | {somme(portefeuille.capital_initial)} |",
        f"| Capital final | {somme(valeur)} |",
        f"| Trades | {resultat.trades} |",
        f"| Gagnants | {resultat.gagnants} ({taux(resultat.taux_reussite)}) |",
        f"| Gain moyen | {signe(resultat.gain_moyen)} |",
        f"| Perte moyenne | {signe(resultat.perte_moyenne)} |",
        f"| Plus fort recul | −{taux(resultat.plus_fort_recul, 1)} |",
        "",
        "## Par marché",
        "",
        "| Marché | Stratégie | Unité | Trades | Gagnants | Résultat |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for marche in MARCHES:
        part = detail.get(marche.code)
        chiffres = (
            f"| {part.trades} | {taux(part.taux_reussite)} | "
            f"{signe(part.gain_total)} |"
            if part
            else "| 0 | — | — |"
        )
        lignes.append(
            f"| {marche.intitule} | {LIBELLES_STRATEGIE[marche.strategie]} | "
            f"{marche.unite} {chiffres}"
        )

    if portefeuille.positions:
        lignes += [
            "",
            "## Positions ouvertes",
            "",
            "| Marché | Sens | Entrée | Stop | Latent |",
            "| --- | --- | --- | --- | --- |",
        ]
        for position in portefeuille.positions.values():
            prix = derniers_prix.get(position.marche, position.prix_entree)
            lignes.append(
                f"| {PAR_CODE[position.marche].intitule} "
                f"| {'long' if position.sens == LONG else 'court'} "
                f"| {somme(position.prix_entree)} | {somme(position.stop)} "
                f"| {signe(position.gain_latent(prix))} |"
            )

    lignes += [
        "",
        "> Portefeuille simulé : aucun ordre réel n'a été passé.",
        "",
    ]
    return "\n".join(lignes)


STYLE = """
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
         margin: 2rem auto; max-width: 48rem; color: #1a1a1a; }
  h1 { font-size: 1.6rem; margin-bottom: .2rem; }
  p.chapeau { color: #555; margin-top: 0; }
  section { padding: .8rem 1rem; margin: 1.2rem 0; border-radius: 6px;
            border-left: 8px solid #1a1a1a; background: #fafafa; }
  h2 { font-size: 1.1rem; margin: .2rem 0 .6rem; }
  table { border-collapse: collapse; width: 100%; font-size: .95rem; }
  th, td { text-align: left; padding: .35rem .5rem;
           border-bottom: 1px solid rgba(0,0,0,.12); }
  th { font-weight: 600; }
  td.gain { font-variant-numeric: tabular-nums; }
  .hausse { color: #1b6b3a; font-weight: 600; }
  .baisse { color: #b3261e; font-weight: 600; }
  footer { margin-top: 2rem; font-weight: 600; white-space: pre-line; }
  @media print { body { margin: 0; } section { break-inside: avoid; } }
"""


# La page HTML est un document complet : l'avertissement des données de démo
# ne peut pas être collé devant, il doit entrer dans le corps. Le marqueur
# lui réserve sa place, et main() le remplace — par du vide en usage normal.
MARQUEUR_AVERTISSEMENT = "<!--AVERTISSEMENT-->"


def _teinte(montant: float) -> str:
    return "hausse" if montant >= 0 else "baisse"


def rendu_html(
    portefeuille: Portefeuille,
    liste_etats: list[Etat],
    derniers_prix: dict[str, float],
    moment: datetime,
) -> str:
    resultat = bilan(portefeuille.journal, portefeuille.capital_initial)
    valeur = portefeuille.valeur(derniers_prix)
    variation = valeur - portefeuille.capital_initial
    detail = bilan_par_marche(portefeuille.journal, portefeuille.capital_initial)

    rangs_marches = "\n".join(
        "<tr>"
        f"<td>{escape(marche.intitule)}</td>"
        f"<td>{escape(LIBELLES_STRATEGIE[marche.strategie])}</td>"
        f"<td>{escape(marche.unite)}</td>"
        f"<td>{detail[marche.code].trades if marche.code in detail else 0}</td>"
        + (
            f'<td class="gain {_teinte(detail[marche.code].gain_total)}">'
            f"{escape(signe(detail[marche.code].gain_total))}</td>"
            if marche.code in detail
            else "<td>—</td>"
        )
        + "</tr>"
        for marche in MARCHES
    )

    rangs_etats = "\n".join(
        "<tr>"
        f"<td>{escape(etat.marche.intitule)}</td>"
        f"<td>{escape(somme(etat.prix))}</td>"
        f"<td>{escape(etat.lecture)}</td>"
        f"<td>{escape(etat.signal.motif if etat.signal else '—')}</td>"
        "</tr>"
        for etat in liste_etats
    )

    return f"""<!doctype html>
<html lang="fr">
<meta charset="utf-8">
<title>Bot de trading</title>
<style>{STYLE}</style>
<h1>Bot de trading</h1>
<p class="chapeau">{escape(date_lisible(moment))} — S&amp;P 500, NASDAQ,
Bitcoin, Or, Pétrole.</p>
{MARQUEUR_AVERTISSEMENT}
<section>
  <h2>Résultat</h2>
  <table>
    <tr><th>Capital de départ</th><td>{escape(somme(portefeuille.capital_initial))}</td></tr>
    <tr><th>Capital final</th>
        <td class="gain {_teinte(variation)}">{escape(somme(valeur))}
        ({escape(pourcentage(variation / portefeuille.capital_initial))})</td></tr>
    <tr><th>Trades</th><td>{resultat.trades}
        ({resultat.gagnants} gagnants, {taux(resultat.taux_reussite)})</td></tr>
    <tr><th>Gain moyen</th><td>{escape(signe(resultat.gain_moyen))}</td></tr>
    <tr><th>Perte moyenne</th><td>{escape(signe(resultat.perte_moyenne))}</td></tr>
    <tr><th>Plus fort recul</th><td>−{taux(resultat.plus_fort_recul, 1)}</td></tr>
  </table>
</section>

<section>
  <h2>Par marché</h2>
  <table>
    <thead><tr><th>Marché</th><th>Stratégie</th><th>Unité</th><th>Trades</th>
    <th>Résultat</th></tr></thead>
    <tbody>
{rangs_marches}
    </tbody>
  </table>
</section>

<section>
  <h2>Où en sont les marchés</h2>
  <table>
    <thead><tr><th>Marché</th><th>Prix</th><th>Lecture</th><th>Signal</th></tr></thead>
    <tbody>
{rangs_etats}
    </tbody>
  </table>
</section>

<footer>Portefeuille simulé : aucun ordre réel n'a été passé.</footer>
</html>
"""


def ecrire_journal(chemin: Path, journal: list[Trade]) -> None:
    """Exporte les trades en CSV, pour les relire dans un tableur."""
    with chemin.open("w", encoding="utf-8", newline="") as fichier:
        redacteur = csv.writer(fichier)
        redacteur.writerow(
            (
                "marche", "sens", "entree_le", "prix_entree", "sortie_le",
                "prix_sortie", "quantite", "gain", "motif_entree", "motif_sortie",
            )
        )
        for trade in journal:
            redacteur.writerow(
                [
                    trade.marche,
                    trade.sens,
                    trade.entree_le.isoformat(),
                    f"{trade.prix_entree:.4f}",
                    trade.sortie_le.isoformat(),
                    f"{trade.prix_sortie:.4f}",
                    f"{trade.quantite:.6f}",
                    f"{trade.gain:.2f}",
                    trade.motif_entree,
                    trade.motif_sortie,
                ]
            )


# --------------------------------------------------------------------------
# Données de démonstration
# --------------------------------------------------------------------------

# Prix de départ plausibles, pour que les montants affichés aient une allure
# familière. Ce ne sont pas des cotations : voir l'avertissement du README.
AVERTISSEMENT_DEMO = (
    "Données de démonstration : ces bougies sont tirées au sort, ce ne sont "
    "pas des cotations. Les chiffres ci-dessous montrent que le moteur "
    "tourne — ils ne disent rien de la rentabilité des stratégies."
)

DEPARTS = {
    "SP500": 5_600.0,
    "NASDAQ": 19_800.0,
    "BITCOIN": 62_000.0,
    "OR": 2_400.0,
    "PETROLE": 78.0,
}


def bougies_demo(
    code: str, nombre: int = 400, graine: int = 20260831
) -> list[Chandelle]:
    """Fabrique une série de bougies reproductible pour faire tourner le bot.

    ⚠️ Ce sont des nombres tirés au sort, pas des cotations. Elles servent à
    vérifier que le moteur, les stops et les filtres fonctionnent — jamais à
    juger si une stratégie est rentable.
    """
    marche = PAR_CODE[code]
    tirage = random.Random(f"{graine}-{code}")
    prix = DEPARTS.get(code, 100.0)
    pas = timedelta(minutes=marche.minutes)
    moment = datetime(2026, 1, 1, tzinfo=UTC)

    # Le Bitcoin bouge plus qu'un indice, le pétrole plus que l'or.
    agitation = {"BITCOIN": 0.012, "PETROLE": 0.008}.get(code, 0.004)

    bougies: list[Chandelle] = []
    derive = 0.0
    for _ in range(nombre):
        # Marche au hasard, avec juste ce qu'il faut d'inertie pour que les
        # bougies ne soient pas du bruit pur. Volontairement faible : une
        # série trop bien orientée ferait passer le suivi de tendance pour
        # une machine à gagner, ce qu'aucune donnée tirée au sort ne prouve.
        derive = derive * 0.7 + tirage.gauss(0, agitation / 10)
        ouverture = prix
        cloture = max(0.01, ouverture * (1 + derive + tirage.gauss(0, agitation)))
        mecheu = abs(tirage.gauss(0, agitation)) * ouverture
        bougies.append(
            Chandelle(
                horodatage=moment,
                ouverture=ouverture,
                haut=max(ouverture, cloture) + mecheu,
                bas=min(ouverture, cloture) - mecheu,
                cloture=cloture,
                volume=round(abs(tirage.gauss(1_000, 400)) + 100, 2),
            )
        )
        prix = cloture
        moment += pas

    return bougies


def series_demo(nombre: int = 400) -> dict[str, list[Chandelle]]:
    return {marche.code: bougies_demo(marche.code, nombre) for marche in MARCHES}


# --------------------------------------------------------------------------


def entete_demo(format_: str) -> str:
    """L'avertissement des données de démo, mis à la forme du rapport."""
    if format_ == "markdown":
        return f"> ⚠️ **{AVERTISSEMENT_DEMO}**\n\n"
    if format_ == "html":
        return (
            '<p style="background:#fff4e0;border-left:8px solid #a15c00;'
            f'padding:.8rem 1rem;border-radius:6px">⚠️ {escape(AVERTISSEMENT_DEMO)}</p>\n'
        )
    return f"⚠️  {AVERTISSEMENT_DEMO}\n\n"


def _couleurs_actives(flux) -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    return hasattr(flux, "isatty") and flux.isatty()


def construire_parseur() -> argparse.ArgumentParser:
    parseur = argparse.ArgumentParser(
        description=(
            "Bot de trading : S&P 500, NASDAQ, Bitcoin, Or et Pétrole, "
            "et rien d'autre. Portefeuille simulé, aucun ordre réel."
        ),
    )
    parseur.add_argument(
        "--marches",
        type=Path,
        default=Path(__file__).with_name("marches"),
        help=(
            "dossier contenant un CSV de bougies par marché "
            "(défaut : marches/ à côté du script)"
        ),
    )
    parseur.add_argument(
        "--demo",
        action="store_true",
        help="travailler sur des bougies tirées au sort au lieu de lire --marches",
    )
    parseur.add_argument(
        "--capital",
        type=float,
        default=10_000.0,
        help="capital de départ du portefeuille simulé (défaut : 10 000)",
    )
    parseur.add_argument(
        "--rapport",
        choices=("backtest", "matin", "soir"),
        default="backtest",
        help=(
            "« backtest » détaille l'historique rejoué ; « matin » et « soir » "
            "produisent les deux messages du jour (défaut : backtest)"
        ),
    )
    parseur.add_argument(
        "--format",
        choices=("texte", "markdown", "html"),
        default="texte",
        help="rapport en texte, markdown ou html (défaut : texte)",
    )
    parseur.add_argument(
        "--sortie",
        type=Path,
        help="écrire le rapport dans ce fichier au lieu de la sortie standard",
    )
    parseur.add_argument(
        "--journal",
        type=Path,
        help="exporter les trades dans ce fichier CSV",
    )
    parseur.add_argument(
        "--code-sortie",
        action="store_true",
        help="renvoyer 1 si le portefeuille est en perte, 0 sinon",
    )
    return parseur


def main(argv: list[str] | None = None) -> int:
    arguments = construire_parseur().parse_args(argv)

    try:
        series = (
            series_demo() if arguments.demo else charger_marches(arguments.marches)
        )
    except ErreurMarche as erreur:
        print(f"Erreur : {erreur}", file=sys.stderr)
        return 3

    reglages = Reglages()
    portefeuille = rejouer(series, capital=arguments.capital, reglages=reglages)
    derniers_prix = {code: bougies[-1].cloture for code, bougies in series.items()}
    liste_etats = etats(series, reglages)
    moment = max(bougies[-1].horodatage for bougies in series.values())

    couleur = arguments.sortie is None and _couleurs_actives(sys.stdout)

    if arguments.rapport == "matin":
        rapport = message_matin(portefeuille, liste_etats, derniers_prix, moment)
    elif arguments.rapport == "soir":
        rapport = message_soir(portefeuille, derniers_prix, moment, couleur)
    elif arguments.format == "markdown":
        rapport = rendu_markdown(portefeuille, liste_etats, derniers_prix, moment)
    elif arguments.format == "html":
        rapport = rendu_html(portefeuille, liste_etats, derniers_prix, moment)
    else:
        rapport = rendu_texte(
            portefeuille, liste_etats, derniers_prix, moment, couleur
        )

    # Les chiffres tirés au sort ne doivent jamais être lus comme un résultat.
    # Les messages du matin et du soir sont toujours en texte, quel que soit
    # --format : l'avertissement suit la même règle.
    en_page = arguments.format if arguments.rapport == "backtest" else "texte"
    avertissement = entete_demo(en_page) if arguments.demo else ""
    if en_page == "html":
        rapport = rapport.replace(MARQUEUR_AVERTISSEMENT, avertissement)
    else:
        rapport = avertissement + rapport

    if arguments.journal:
        arguments.journal.parent.mkdir(parents=True, exist_ok=True)
        ecrire_journal(arguments.journal, portefeuille.journal)
        print(f"{len(portefeuille.journal)} trades écrits dans {arguments.journal}")

    if arguments.sortie:
        arguments.sortie.parent.mkdir(parents=True, exist_ok=True)
        arguments.sortie.write_text(rapport, encoding="utf-8")
        print(f"Rapport écrit dans {arguments.sortie}")
    else:
        print(rapport)

    if arguments.code_sortie:
        return 1 if portefeuille.valeur(derniers_prix) < arguments.capital else 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
