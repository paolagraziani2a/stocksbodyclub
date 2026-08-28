#!/usr/bin/env python3
"""Alerte de stock hebdomadaire — THE BODY CLUB.

L'employé passe en revue les produits et choisit un niveau pour chacun :

    🔴 ROUGE   commande urgente
    🟠 ORANGE  stock bas
    🟢 VERT    stock suffisant

Un produit pas encore passé en revue reste ⚪ : il n'est jamais annoncé
comme vert par défaut.

Exemples :
    python3 alerte_stock.py --saisie                  # l'employé coche
    python3 alerte_stock.py                           # le rapport à l'écran
    python3 alerte_stock.py --format feuille --sortie feuille.html
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from dataclasses import dataclass, replace
from datetime import datetime
from html import escape
from pathlib import Path
from zoneinfo import ZoneInfo

FUSEAU = ZoneInfo("Europe/Paris")

ROUGE = "rouge"
ORANGE = "orange"
VERT = "vert"
INCONNU = ""  # cellule vide : produit pas encore passé en revue

# Niveaux que l'employé peut choisir, du plus urgent au moins urgent.
NIVEAUX_STOCK = (ROUGE, ORANGE, VERT)
# Ordre d'affichage des sections du rapport.
NIVEAUX = NIVEAUX_STOCK + (INCONNU,)

LIBELLES = {
    ROUGE: "Commande urgente",
    ORANGE: "Stock bas",
    VERT: "Stock suffisant",
    INCONNU: "Pas encore vérifié",
}

PASTILLES = {ROUGE: "🔴", ORANGE: "🟠", VERT: "🟢", INCONNU: "⚪"}

ANSI = {ROUGE: "\033[31m", ORANGE: "\033[33m", VERT: "\033[32m", INCONNU: "\033[90m"}
ANSI_GRAS = "\033[1m"
ANSI_FIN = "\033[0m"

# Ce que l'employé peut taper ou écrire dans la colonne « niveau ».
SYNONYMES = {
    "r": ROUGE, "rouge": ROUGE, "🔴": ROUGE,
    "o": ORANGE, "orange": ORANGE, "🟠": ORANGE,
    "v": VERT, "vert": VERT, "verte": VERT, "🟢": VERT,
}

COLONNES = ("produit", "categorie", "niveau", "remarque")

JOURS = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")

MOIS = (
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
)


class ErreurInventaire(Exception):
    """L'inventaire est absent, mal formé ou incohérent."""


@dataclass(frozen=True)
class Produit:
    nom: str
    categorie: str
    niveau: str
    remarque: str = ""

    @property
    def intitule(self) -> str:
        """« Sirops Monin › Framboise » — lève l'ambiguïté entre catégories.

        Plusieurs noms se répètent d'une catégorie à l'autre (Framboise en
        sirop et en sauce sucrée, Vanille, Matcha, Coco…) : c'est le couple
        catégorie + produit qui identifie une référence.
        """
        return f"{self.categorie} › {self.nom}"


def normaliser_niveau(valeur: str | None) -> str:
    """« R », « rouge », « 🔴 » -> ROUGE ; cellule vide -> INCONNU."""
    texte = (valeur or "").strip().casefold()
    if not texte:
        return INCONNU
    if texte not in SYNONYMES:
        raise ValueError(valeur)
    return SYNONYMES[texte]


def date_lisible(moment: datetime) -> str:
    return (
        f"{JOURS[moment.weekday()]} {moment.day} {MOIS[moment.month - 1]} "
        f"{moment.year}, {moment:%Hh%M}"
    )


def lire_inventaire(chemin: Path) -> list[Produit]:
    """Charge le CSV d'inventaire en vérifiant sa cohérence."""
    try:
        contenu = chemin.read_text(encoding="utf-8-sig")
    except FileNotFoundError as erreur:
        raise ErreurInventaire(f"inventaire introuvable : {chemin}") from erreur

    lecteur = csv.DictReader(contenu.splitlines())
    entetes = lecteur.fieldnames or []
    manquantes = [colonne for colonne in COLONNES if colonne not in entetes]
    if manquantes:
        raise ErreurInventaire(
            "colonnes manquantes dans l'inventaire : " + ", ".join(manquantes)
        )

    produits: list[Produit] = []
    vus: dict[tuple[str, str], int] = {}
    for numero, ligne in enumerate(lecteur, start=2):  # ligne 1 = en-têtes
        nom = (ligne.get("produit") or "").strip()
        if not nom:
            continue  # ligne vide ou séparateur : on l'ignore
        categorie = (ligne.get("categorie") or "").strip() or "Divers"

        cle = (categorie.casefold(), nom.casefold())
        if cle in vus:
            raise ErreurInventaire(
                f"ligne {numero} : « {nom} » est déjà présent dans la catégorie "
                f"« {categorie} » (ligne {vus[cle]})."
            )
        vus[cle] = numero

        try:
            niveau = normaliser_niveau(ligne["niveau"])
        except ValueError as erreur:
            raise ErreurInventaire(
                f"ligne {numero} ({nom}) : « {ligne['niveau']} » n'est pas un "
                "niveau. Écrire vert, orange, rouge — ou laisser vide."
            ) from erreur

        produits.append(
            Produit(
                nom=nom,
                categorie=categorie,
                niveau=niveau,
                remarque=(ligne.get("remarque") or "").strip(),
            )
        )

    if not produits:
        raise ErreurInventaire(f"aucun produit trouvé dans {chemin}.")
    return produits


def ecrire_inventaire(chemin: Path, produits: list[Produit]) -> None:
    with chemin.open("w", encoding="utf-8", newline="") as fichier:
        redacteur = csv.writer(fichier)
        redacteur.writerow(COLONNES)
        for produit in produits:
            redacteur.writerow(
                [produit.nom, produit.categorie, produit.niveau, produit.remarque]
            )


def grouper(produits: list[Produit]) -> dict[str, list[Produit]]:
    """Range les produits par niveau, par catégorie puis par nom."""
    groupes: dict[str, list[Produit]] = {niveau: [] for niveau in NIVEAUX}
    for produit in produits:
        groupes[produit.niveau].append(produit)
    for liste in groupes.values():
        liste.sort(key=lambda p: (p.categorie.casefold(), p.nom.casefold()))
    return groupes


def par_categorie(produits: list[Produit]) -> dict[str, list[Produit]]:
    """Conserve l'ordre des catégories tel qu'il apparaît dans l'inventaire."""
    categories: dict[str, list[Produit]] = {}
    for produit in produits:
        categories.setdefault(produit.categorie, []).append(produit)
    return categories


def niveau_global(groupes: dict[str, list[Produit]]) -> str:
    for niveau in NIVEAUX_STOCK:
        if groupes[niveau]:
            return niveau
    return INCONNU


def consigne(global_: str, nb_inconnus: int = 0) -> str:
    if global_ == ROUGE:
        texte = (
            "👉 Passer la commande urgente aujourd'hui et prévenir le ou la "
            "responsable."
        )
    elif global_ == ORANGE:
        texte = (
            "👉 Ajouter les produits en orange à la commande de la semaine prochaine."
        )
    elif global_ == VERT:
        texte = "👉 Rien à commander cette semaine. Bon week-end !"
    else:
        return (
            "👉 Aucun produit n'a encore été vérifié cette semaine : lancer "
            "« python3 alerte_stock.py --saisie »."
        )
    if nb_inconnus:
        texte += (
            f"\n⚪ Attention : {nb_inconnus} produit"
            f"{'s n’ont' if nb_inconnus > 1 else ' n’a'} pas encore été vérifié"
            f"{'s' if nb_inconnus > 1 else ''}."
        )
    return texte


# --------------------------------------------------------------------------
# Saisie par l'employé
# --------------------------------------------------------------------------

AIDE_SAISIE = (
    "  v = 🟢 vert (stock suffisant)   o = 🟠 orange (stock bas)   "
    "r = 🔴 rouge (commande urgente)\n"
    "  Entrée = garder le niveau actuel   x = effacer   p = passer la catégorie   "
    "q = enregistrer et quitter"
)


def saisie_interactive(produits: list[Produit], entree=None, sortie=None) -> list[Produit]:
    """Passe les produits en revue un par un et renvoie la liste mise à jour."""
    entree = entree or sys.stdin
    sortie = sortie or sys.stdout

    def afficher(texte: str = "") -> None:
        print(texte, file=sortie)

    afficher("Relevé des stocks — THE BODY CLUB")
    afficher(AIDE_SAISIE)

    resultat = list(produits)
    total = len(resultat)
    categorie_sautee = None
    indice = 0
    while indice < total:
        produit = resultat[indice]
        if produit.categorie == categorie_sautee:
            indice += 1
            continue
        categorie_sautee = None

        if indice == 0 or produit.categorie != resultat[indice - 1].categorie:
            afficher(f"\n— {produit.categorie} —")

        actuel = f"{PASTILLES[produit.niveau]} {LIBELLES[produit.niveau].lower()}"
        print(
            f"[{indice + 1}/{total}] {produit.nom} ({actuel}) > ",
            end="",
            file=sortie,
            flush=True,
        )
        reponse = entree.readline()
        if not reponse:  # fin de saisie (Ctrl-D)
            afficher()
            break
        reponse = reponse.strip().casefold()

        if reponse == "q":
            break
        if reponse == "p":
            categorie_sautee = produit.categorie
            indice += 1
            continue
        if reponse == "":
            indice += 1
            continue
        if reponse == "x":
            resultat[indice] = replace(produit, niveau=INCONNU)
            indice += 1
            continue
        try:
            resultat[indice] = replace(produit, niveau=normaliser_niveau(reponse))
        except ValueError:
            afficher(f"  « {reponse} » n'est pas une réponse valable.")
            afficher(AIDE_SAISIE)
            continue  # on repose la même question
        indice += 1

    groupes = grouper(resultat)
    afficher()
    afficher(
        "  ".join(
            f"{PASTILLES[niveau]} {LIBELLES[niveau]} : {len(groupes[niveau])}"
            for niveau in NIVEAUX
        )
    )
    return resultat


# --------------------------------------------------------------------------
# Rapports
# --------------------------------------------------------------------------


def _couleurs_actives(flux) -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    return hasattr(flux, "isatty") and flux.isatty()


def rendu_texte(
    groupes: dict[str, list[Produit]], moment: datetime, couleur: bool
) -> str:
    def peindre(texte: str, niveau: str) -> str:
        if not couleur:
            return texte
        return f"{ANSI[niveau]}{ANSI_GRAS}{texte}{ANSI_FIN}"

    global_ = niveau_global(groupes)
    lignes = [
        "=" * 68,
        f"ALERTE STOCK — THE BODY CLUB — {date_lisible(moment)}",
        "Niveau général : "
        + peindre(f"{PASTILLES[global_]} {LIBELLES[global_].upper()}", global_),
        "=" * 68,
        "",
        "  ".join(
            f"{PASTILLES[niveau]} {LIBELLES[niveau]} : {len(groupes[niveau])}"
            for niveau in NIVEAUX
        ),
    ]

    for niveau in NIVEAUX:
        produits = groupes[niveau]
        if not produits:
            continue
        lignes += [
            "",
            peindre(
                f"{PASTILLES[niveau]} {LIBELLES[niveau].upper()} "
                f"({len(produits)} produit{'s' if len(produits) > 1 else ''})",
                niveau,
            ),
            "-" * 68,
        ]
        for produit in produits:
            ligne = f"  • {produit.intitule}"
            if produit.remarque:
                ligne += f" — {produit.remarque}"
            lignes.append(ligne)

    lignes += ["", consigne(global_, len(groupes[INCONNU])), ""]
    return "\n".join(lignes)


def _tableau_markdown(produits: list[Produit]) -> list[str]:
    lignes = ["| Catégorie | Produit | Remarque |", "| --- | --- | --- |"]
    lignes += [
        f"| {p.categorie} | {p.nom} | {p.remarque or '—'} |" for p in produits
    ]
    return lignes


def rendu_markdown(groupes: dict[str, list[Produit]], moment: datetime) -> str:
    global_ = niveau_global(groupes)
    lignes = [
        f"# {PASTILLES[global_]} Alerte stock — {date_lisible(moment)}",
        "",
        f"**Niveau général : {LIBELLES[global_].lower()}**",
        "",
        "| Niveau | Produits |",
        "| --- | --- |",
    ]
    for niveau in NIVEAUX:
        lignes.append(
            f"| {PASTILLES[niveau]} {LIBELLES[niveau]} | {len(groupes[niveau])} |"
        )

    for niveau in NIVEAUX_STOCK:
        produits = groupes[niveau]
        if not produits:
            continue
        lignes += ["", f"## {PASTILLES[niveau]} {LIBELLES[niveau]}", ""]
        lignes += _tableau_markdown(produits)

    inconnus = groupes[INCONNU]
    if inconnus:
        lignes += [
            "",
            f"<details><summary>{PASTILLES[INCONNU]} {LIBELLES[INCONNU]} "
            f"({len(inconnus)} produits)</summary>",
            "",
        ]
        lignes += _tableau_markdown(inconnus)
        lignes += ["", "</details>"]

    lignes += ["", consigne(global_, len(inconnus)).replace("\n", "\n\n"), ""]
    return "\n".join(lignes)


STYLE_IMPRESSION = """
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
         margin: 2rem auto; max-width: 48rem; color: #1a1a1a; }
  h1 { font-size: 1.6rem; margin-bottom: .2rem; }
  p.chapeau { color: #555; margin-top: 0; }
  section { padding: .8rem 1rem; margin: 1.2rem 0; border-radius: 6px; }
  h2 { font-size: 1.1rem; margin: .2rem 0 .6rem; }
  table { border-collapse: collapse; width: 100%; font-size: .95rem; }
  th, td { text-align: left; padding: .35rem .5rem;
           border-bottom: 1px solid rgba(0,0,0,.12); }
  th { font-weight: 600; }
  td.choix { width: 4.2rem; white-space: nowrap; letter-spacing: .15rem; }
  footer { margin-top: 2rem; font-weight: 600; white-space: pre-line; }
  @media print { body { margin: 0; } section { break-inside: avoid; } }
"""

TEINTES = {
    ROUGE: ("#b3261e", "#fdecea"),
    ORANGE: ("#a15c00", "#fff4e0"),
    VERT: ("#1b6b3a", "#eaf6ee"),
    INCONNU: ("#6b6b6b", "#f2f2f2"),
}


def _page(titre: str, chapeau: str, corps: str, pied: str) -> str:
    return f"""<!doctype html>
<html lang="fr">
<meta charset="utf-8">
<title>{escape(titre)}</title>
<style>{STYLE_IMPRESSION}</style>
<h1>{titre}</h1>
<p class="chapeau">{chapeau}</p>
{corps}
<footer>{pied}</footer>
</html>
"""


def rendu_html(groupes: dict[str, list[Produit]], moment: datetime) -> str:
    """Page A4 imprimable, à afficher en réserve ou en salle de pause."""
    global_ = niveau_global(groupes)

    sections = []
    for niveau in NIVEAUX:
        produits = groupes[niveau]
        if not produits:
            continue
        bordure, fond = TEINTES[niveau]
        rangs = "\n".join(
            f"<tr><td>{escape(p.categorie)}</td><td>{escape(p.nom)}</td>"
            f"<td>{escape(p.remarque) or '—'}</td></tr>"
            for p in produits
        )
        sections.append(
            f"""<section style="border-left:8px solid {bordure};background:{fond}">
  <h2>{PASTILLES[niveau]} {LIBELLES[niveau]} — {len(produits)}</h2>
  <table>
    <thead><tr><th>Catégorie</th><th>Produit</th><th>Remarque</th></tr></thead>
    <tbody>
{rangs}
    </tbody>
  </table>
</section>"""
        )

    return _page(
        titre=f"{PASTILLES[global_]} Alerte stock — The Body Club",
        chapeau=(
            f"{escape(date_lisible(moment))} — niveau général : "
            f"{escape(LIBELLES[global_].lower())}"
        ),
        corps="\n".join(sections),
        pied=escape(consigne(global_, len(groupes[INCONNU]))),
    )


def rendu_feuille(produits: list[Produit], moment: datetime) -> str:
    """Feuille de relevé à imprimer : trois cases à cocher par produit."""
    sections = []
    for categorie, liste in par_categorie(produits).items():
        rangs = "\n".join(
            f"<tr><td>{escape(p.nom)}</td>"
            "<td class='choix'>🟢 ☐</td><td class='choix'>🟠 ☐</td>"
            "<td class='choix'>🔴 ☐</td><td></td></tr>"
            for p in liste
        )
        sections.append(
            f"""<section style="border-left:8px solid #1a1a1a;background:#fafafa">
  <h2>{escape(categorie)} — {len(liste)}</h2>
  <table>
    <thead><tr><th>Produit</th><th>Vert</th><th>Orange</th><th>Rouge</th>
    <th>Remarque</th></tr></thead>
    <tbody>
{rangs}
    </tbody>
  </table>
</section>"""
        )

    return _page(
        titre="Relevé des stocks — The Body Club",
        chapeau=(
            f"{escape(date_lisible(moment))} — {len(produits)} références. "
            "🟢 stock suffisant · 🟠 stock bas · 🔴 commande urgente. "
            "Cocher une case par produit, puis reporter dans inventaire.csv."
        ),
        corps="\n".join(sections),
        pied="Relevé fait par : ______________________",
    )


# --------------------------------------------------------------------------


def construire_parseur() -> argparse.ArgumentParser:
    parseur = argparse.ArgumentParser(
        description=(
            "Alerte de stock hebdomadaire du Body Club : l'employé choisit "
            "vert, orange ou rouge pour chaque produit."
        ),
    )
    parseur.add_argument(
        "--inventaire",
        type=Path,
        default=Path(__file__).with_name("inventaire.csv"),
        help="fichier CSV d'inventaire (défaut : inventaire.csv à côté du script)",
    )
    parseur.add_argument(
        "--saisie",
        action="store_true",
        help="passer les produits en revue un par un et enregistrer les niveaux",
    )
    parseur.add_argument(
        "--reinitialiser",
        action="store_true",
        help="effacer tous les niveaux pour repartir d'une semaine vierge",
    )
    parseur.add_argument(
        "--format",
        choices=("texte", "markdown", "html", "feuille"),
        default="texte",
        help=(
            "rapport en texte, markdown ou html ; « feuille » produit le relevé "
            "vierge à imprimer (défaut : texte)"
        ),
    )
    parseur.add_argument(
        "--sortie",
        type=Path,
        help="écrire le rapport dans ce fichier au lieu de la sortie standard",
    )
    parseur.add_argument(
        "--code-sortie",
        action="store_true",
        help="renvoyer 2 si un produit est rouge, 1 si orange, 0 sinon",
    )
    return parseur


def main(argv: list[str] | None = None) -> int:
    arguments = construire_parseur().parse_args(argv)

    try:
        produits = lire_inventaire(arguments.inventaire)
    except ErreurInventaire as erreur:
        print(f"Erreur : {erreur}", file=sys.stderr)
        return 3

    if arguments.reinitialiser:
        produits = [replace(p, niveau=INCONNU, remarque="") for p in produits]
        ecrire_inventaire(arguments.inventaire, produits)
        print(f"{len(produits)} niveaux effacés dans {arguments.inventaire}.")
        return 0

    if arguments.saisie:
        if not sys.stdin.isatty():
            print(
                "Erreur : --saisie a besoin d'un terminal interactif.",
                file=sys.stderr,
            )
            return 3
        produits = saisie_interactive(produits)
        ecrire_inventaire(arguments.inventaire, produits)
        print(f"\nRelevé enregistré dans {arguments.inventaire}.")

    groupes = grouper(produits)
    moment = datetime.now(FUSEAU)

    if arguments.format == "markdown":
        rapport = rendu_markdown(groupes, moment)
    elif arguments.format == "html":
        rapport = rendu_html(groupes, moment)
    elif arguments.format == "feuille":
        rapport = rendu_feuille(produits, moment)
    else:
        couleur = arguments.sortie is None and _couleurs_actives(sys.stdout)
        rapport = rendu_texte(groupes, moment, couleur)

    if arguments.sortie:
        arguments.sortie.parent.mkdir(parents=True, exist_ok=True)
        arguments.sortie.write_text(rapport, encoding="utf-8")
        print(f"Rapport écrit dans {arguments.sortie}")
    elif not arguments.saisie:
        print(rapport)

    if arguments.code_sortie:
        return {ROUGE: 2, ORANGE: 1, VERT: 0, INCONNU: 0}[niveau_global(groupes)]
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
