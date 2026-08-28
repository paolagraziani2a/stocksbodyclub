#!/usr/bin/env python3
"""Alerte de stock hebdomadaire — THE BODY CLUB.

Lit l'inventaire au format CSV et classe chaque produit sur trois niveaux :

    🔴 ROUGE   commande urgente  (quantité <= seuil_urgent)
    🟠 ORANGE  stock bas         (quantité <= seuil_bas)
    🟢 VERT    stock suffisant

Un produit dont la quantité ou les seuils ne sont pas renseignés reste
⚪ À RENSEIGNER : il n'est jamais annoncé comme vert par défaut.

Exemples :
    python3 alerte_stock.py
    python3 alerte_stock.py --format markdown --sortie alerte.md
    python3 alerte_stock.py --format feuille --sortie comptage.html
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from dataclasses import dataclass
from datetime import datetime
from html import escape
from pathlib import Path
from zoneinfo import ZoneInfo

FUSEAU = ZoneInfo("Europe/Paris")

ROUGE = "rouge"
ORANGE = "orange"
VERT = "vert"
INCONNU = "inconnu"

# Niveaux de stock proprement dits, du plus urgent au moins urgent.
NIVEAUX_STOCK = (ROUGE, ORANGE, VERT)
# Ordre d'affichage des sections du rapport.
NIVEAUX = NIVEAUX_STOCK + (INCONNU,)

LIBELLES = {
    ROUGE: "Commande urgente",
    ORANGE: "Stock bas",
    VERT: "Stock suffisant",
    INCONNU: "À renseigner",
}

PASTILLES = {ROUGE: "🔴", ORANGE: "🟠", VERT: "🟢", INCONNU: "⚪"}

ANSI = {ROUGE: "\033[31m", ORANGE: "\033[33m", VERT: "\033[32m", INCONNU: "\033[90m"}
ANSI_GRAS = "\033[1m"
ANSI_FIN = "\033[0m"

COLONNES = (
    "produit",
    "categorie",
    "unite",
    "quantite",
    "seuil_bas",
    "seuil_urgent",
    "fournisseur",
)

JOURS = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")

MOIS = (
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
)


class ErreurInventaire(Exception):
    """L'inventaire est absent, mal formé ou incohérent."""


@dataclass(frozen=True)
class Produit:
    nom: str
    categorie: str
    unite: str
    quantite: float | None
    seuil_bas: float | None
    seuil_urgent: float | None
    fournisseur: str

    @property
    def niveau(self) -> str:
        # Plusieurs catégories partagent les mêmes noms (Framboise en sirop et
        # en sauce sucrée…) : rien ici ne dépend du nom seul.
        if self.quantite is None or self.seuil_bas is None or self.seuil_urgent is None:
            return INCONNU
        if self.quantite <= self.seuil_urgent:
            return ROUGE
        if self.quantite <= self.seuil_bas:
            return ORANGE
        return VERT

    @property
    def manque(self) -> float:
        """Quantité à commander pour repasser au-dessus du seuil bas."""
        if self.quantite is None or self.seuil_bas is None:
            return 0.0
        return max(0.0, self.seuil_bas - self.quantite)

    @property
    def intitule(self) -> str:
        """« Sirops Monin › Framboise » — lève l'ambiguïté entre catégories."""
        return f"{self.categorie} › {self.nom}"

    def avec_unite(self, valeur: float | None) -> str:
        if valeur is None:
            return "—"
        return f"{format_nombre(valeur)} {self.unite}"

    def quantite_lisible(self) -> str:
        return self.avec_unite(self.quantite)

    def manque_lisible(self) -> str:
        return self.avec_unite(self.manque)

    def raison_inconnu(self) -> str:
        if self.quantite is None and self.seuil_bas is None:
            return "à compter et à paramétrer"
        if self.quantite is None:
            return "à compter"
        return "seuils à définir"


def format_nombre(valeur: float) -> str:
    """23.0 -> «23», 2.5 -> «2,5» (virgule décimale française)."""
    if valeur == int(valeur):
        return str(int(valeur))
    return f"{valeur:.2f}".rstrip("0").rstrip(".").replace(".", ",")


def date_lisible(moment: datetime) -> str:
    return (
        f"{JOURS[moment.weekday()]} {moment.day} {MOIS[moment.month - 1]} "
        f"{moment.year}, {moment:%Hh%M}"
    )


def _nombre(valeur: str | None, colonne: str, ligne: int) -> float | None:
    """Convertit une cellule numérique ; une cellule vide vaut « non renseigné »."""
    texte = (valeur or "").strip().replace(",", ".")
    if not texte:
        return None
    try:
        nombre = float(texte)
    except ValueError as erreur:
        raise ErreurInventaire(
            f"ligne {ligne} : « {valeur} » n'est pas un nombre "
            f"dans la colonne « {colonne} »."
        ) from erreur
    if nombre < 0:
        raise ErreurInventaire(
            f"ligne {ligne} : la colonne « {colonne} » ne peut pas être négative."
        )
    return nombre


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

        seuil_bas = _nombre(ligne["seuil_bas"], "seuil_bas", numero)
        seuil_urgent = _nombre(ligne["seuil_urgent"], "seuil_urgent", numero)
        if seuil_bas is not None and seuil_urgent is not None and seuil_urgent > seuil_bas:
            raise ErreurInventaire(
                f"ligne {numero} ({nom}) : seuil_urgent ({format_nombre(seuil_urgent)}) "
                f"doit être inférieur ou égal à seuil_bas ({format_nombre(seuil_bas)})."
            )
        produits.append(
            Produit(
                nom=nom,
                categorie=categorie,
                unite=(ligne.get("unite") or "").strip() or "unité",
                quantite=_nombre(ligne["quantite"], "quantite", numero),
                seuil_bas=seuil_bas,
                seuil_urgent=seuil_urgent,
                fournisseur=(ligne.get("fournisseur") or "").strip() or "—",
            )
        )

    if not produits:
        raise ErreurInventaire(f"aucun produit trouvé dans {chemin}.")
    return produits


def grouper(produits: list[Produit]) -> dict[str, list[Produit]]:
    """Range les produits par niveau, les plus critiques d'abord dans chaque groupe."""
    groupes: dict[str, list[Produit]] = {niveau: [] for niveau in NIVEAUX}
    for produit in produits:
        groupes[produit.niveau].append(produit)
    for niveau, liste in groupes.items():
        if niveau == INCONNU:
            liste.sort(key=lambda p: (p.categorie.casefold(), p.nom.casefold()))
        else:
            liste.sort(key=lambda p: (-p.manque, p.nom.casefold()))
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
            "👉 Aucun produit n'a encore été compté : remplir la colonne "
            "« quantite » d'inventaire.csv, puis relancer l'alerte."
        )
    if nb_inconnus:
        texte += (
            f"\n⚪ Attention : {nb_inconnus} produit"
            f"{'s ne sont' if nb_inconnus > 1 else ' n’est'} pas encore renseigné"
            f"{'s' if nb_inconnus > 1 else ''} — leur niveau réel est inconnu."
        )
    return texte


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
            if niveau == INCONNU:
                lignes.append(f"  • {produit.intitule} — {produit.raison_inconnu()}")
                continue
            ligne = f"  • {produit.intitule} — reste {produit.quantite_lisible()}"
            if niveau != VERT:
                ligne += (
                    f" (à commander : {produit.manque_lisible()}"
                    f" — {produit.fournisseur})"
                )
            lignes.append(ligne)

    lignes += ["", consigne(global_, len(groupes[INCONNU])), ""]
    return "\n".join(lignes)


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
        lignes += [
            "",
            f"## {PASTILLES[niveau]} {LIBELLES[niveau]}",
            "",
            "| Catégorie | Produit | Restant | Seuil bas | À commander | Fournisseur |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
        for produit in produits:
            a_commander = produit.manque_lisible() if niveau != VERT else "—"
            lignes.append(
                f"| {produit.categorie} | {produit.nom} | "
                f"{produit.quantite_lisible()} | {produit.avec_unite(produit.seuil_bas)}"
                f" | {a_commander} | {produit.fournisseur} |"
            )

    inconnus = groupes[INCONNU]
    if inconnus:
        lignes += [
            "",
            f"<details><summary>{PASTILLES[INCONNU]} {LIBELLES[INCONNU]} "
            f"({len(inconnus)} produits)</summary>",
            "",
            "| Catégorie | Produit | Ce qui manque |",
            "| --- | --- | --- |",
        ]
        lignes += [
            f"| {p.categorie} | {p.nom} | {p.raison_inconnu()} |" for p in inconnus
        ]
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
  td.case { width: 1.6rem; font-size: 1.1rem; }
  td.saisie { width: 7rem; border-bottom: 1px solid #999; }
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
        if niveau == INCONNU:
            entetes = "<th>Catégorie</th><th>Produit</th><th>Ce qui manque</th>"
            rangs = "\n".join(
                f"<tr><td>{escape(p.categorie)}</td><td>{escape(p.nom)}</td>"
                f"<td>{escape(p.raison_inconnu())}</td></tr>"
                for p in produits
            )
        else:
            entetes = (
                "<th>Catégorie</th><th>Produit</th><th>Restant</th>"
                "<th>À commander</th><th>Fournisseur</th>"
            )
            rangs = "\n".join(
                f"<tr><td>{escape(p.categorie)}</td><td>{escape(p.nom)}</td>"
                f"<td>{escape(p.quantite_lisible())}</td>"
                f"<td>{escape(p.manque_lisible()) if niveau != VERT else '—'}</td>"
                f"<td>{escape(p.fournisseur)}</td></tr>"
                for p in produits
            )
        sections.append(
            f"""<section style="border-left:8px solid {bordure};background:{fond}">
  <h2>{PASTILLES[niveau]} {LIBELLES[niveau]} — {len(produits)}</h2>
  <table>
    <thead><tr>{entetes}</tr></thead>
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
    """Feuille de comptage vierge à imprimer, une section par catégorie."""
    sections = []
    for categorie, liste in par_categorie(produits).items():
        rangs = "\n".join(
            f"<tr><td class='case'>☐</td><td>{escape(p.nom)}</td>"
            f"<td>{escape(p.unite)}</td><td class='saisie'></td>"
            f"<td>{escape(p.avec_unite(p.seuil_bas))}</td></tr>"
            for p in liste
        )
        sections.append(
            f"""<section style="border-left:8px solid #1a1a1a;background:#fafafa">
  <h2>{escape(categorie)} — {len(liste)}</h2>
  <table>
    <thead><tr><th></th><th>Produit</th><th>Unité</th><th>Quantité comptée</th>
    <th>Seuil bas</th></tr></thead>
    <tbody>
{rangs}
    </tbody>
  </table>
</section>"""
        )

    return _page(
        titre="Feuille de comptage — The Body Club",
        chapeau=(
            f"{escape(date_lisible(moment))} — {len(produits)} références. "
            "Cocher au fur et à mesure, noter la quantité restante, "
            "puis reporter les chiffres dans inventaire.csv."
        ),
        corps="\n".join(sections),
        pied="Comptage fait par : ______________________",
    )


def construire_parseur() -> argparse.ArgumentParser:
    parseur = argparse.ArgumentParser(
        description=(
            "Alerte de stock hebdomadaire du Body Club (vert / orange / rouge)."
        ),
    )
    parseur.add_argument(
        "--inventaire",
        type=Path,
        default=Path(__file__).with_name("inventaire.csv"),
        help="fichier CSV d'inventaire (défaut : inventaire.csv à côté du script)",
    )
    parseur.add_argument(
        "--format",
        choices=("texte", "markdown", "html", "feuille"),
        default="texte",
        help=(
            "rapport en texte, markdown ou html ; « feuille » produit la feuille "
            "de comptage vierge à imprimer (défaut : texte)"
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
    else:
        print(rapport)

    if arguments.code_sortie:
        return {ROUGE: 2, ORANGE: 1, VERT: 0, INCONNU: 0}[niveau_global(groupes)]
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
