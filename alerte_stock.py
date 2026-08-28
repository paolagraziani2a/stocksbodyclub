#!/usr/bin/env python3
"""Alerte de stock hebdomadaire du café.

Lit un inventaire au format CSV et classe chaque produit sur trois niveaux :

    🔴 ROUGE   commande urgente  (quantité <= seuil_urgent)
    🟠 ORANGE  stock bas         (quantité <= seuil_bas)
    🟢 VERT    stock suffisant

Exemples :
    python3 alerte_stock.py
    python3 alerte_stock.py --format markdown --sortie alerte.md
    python3 alerte_stock.py --inventaire inventaire.csv --format html
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

# Du plus urgent au moins urgent : ordre d'affichage des sections.
NIVEAUX = (ROUGE, ORANGE, VERT)

LIBELLES = {
    ROUGE: "Commande urgente",
    ORANGE: "Stock bas",
    VERT: "Stock suffisant",
}

PASTILLES = {ROUGE: "🔴", ORANGE: "🟠", VERT: "🟢"}

ANSI = {ROUGE: "\033[31m", ORANGE: "\033[33m", VERT: "\033[32m"}
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

JOURS = (
    "lundi",
    "mardi",
    "mercredi",
    "jeudi",
    "vendredi",
    "samedi",
    "dimanche",
)

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
    quantite: float
    seuil_bas: float
    seuil_urgent: float
    fournisseur: str

    @property
    def niveau(self) -> str:
        if self.quantite <= self.seuil_urgent:
            return ROUGE
        if self.quantite <= self.seuil_bas:
            return ORANGE
        return VERT

    @property
    def manque(self) -> float:
        """Quantité à commander pour repasser au-dessus du seuil bas."""
        return max(0.0, self.seuil_bas - self.quantite)

    def quantite_lisible(self) -> str:
        return f"{format_nombre(self.quantite)} {self.unite}"

    def manque_lisible(self) -> str:
        return f"{format_nombre(self.manque)} {self.unite}"


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


def _nombre(valeur: str, colonne: str, ligne: int) -> float:
    texte = (valeur or "").strip().replace(",", ".")
    if not texte:
        raise ErreurInventaire(f"ligne {ligne} : la colonne « {colonne} » est vide.")
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
    for numero, ligne in enumerate(lecteur, start=2):  # ligne 1 = en-têtes
        nom = (ligne.get("produit") or "").strip()
        if not nom:
            continue  # ligne vide ou séparateur : on l'ignore
        seuil_bas = _nombre(ligne["seuil_bas"], "seuil_bas", numero)
        seuil_urgent = _nombre(ligne["seuil_urgent"], "seuil_urgent", numero)
        if seuil_urgent > seuil_bas:
            raise ErreurInventaire(
                f"ligne {numero} ({nom}) : seuil_urgent ({format_nombre(seuil_urgent)}) "
                f"doit être inférieur ou égal à seuil_bas ({format_nombre(seuil_bas)})."
            )
        produits.append(
            Produit(
                nom=nom,
                categorie=(ligne.get("categorie") or "").strip() or "Divers",
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
    for liste in groupes.values():
        liste.sort(key=lambda p: (-p.manque, p.nom.lower()))
    return groupes


def niveau_global(groupes: dict[str, list[Produit]]) -> str:
    for niveau in NIVEAUX:
        if groupes[niveau]:
            return niveau
    return VERT


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
        "=" * 62,
        f"ALERTE STOCK — {date_lisible(moment)}",
        "Niveau général : "
        + peindre(f"{PASTILLES[global_]} {LIBELLES[global_].upper()}", global_),
        "=" * 62,
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
        lignes.append("")
        lignes.append(
            peindre(
                f"{PASTILLES[niveau]} {LIBELLES[niveau].upper()} "
                f"({len(produits)} produit{'s' if len(produits) > 1 else ''})",
                niveau,
            )
        )
        lignes.append("-" * 62)
        for produit in produits:
            ligne = f"  • {produit.nom} — reste {produit.quantite_lisible()}"
            if niveau != VERT:
                ligne += (
                    f" (à commander : {produit.manque_lisible()}"
                    f" — {produit.fournisseur})"
                )
            lignes.append(ligne)

    lignes.append("")
    lignes.append(consigne(global_))
    lignes.append("")
    return "\n".join(lignes)


def consigne(global_: str) -> str:
    if global_ == ROUGE:
        return (
            "👉 Passer la commande urgente aujourd'hui et prévenir le ou la "
            "responsable."
        )
    if global_ == ORANGE:
        return "👉 Ajouter les produits en orange à la commande de la semaine prochaine."
    return "👉 Rien à commander cette semaine. Bon week-end !"


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

    for niveau in NIVEAUX:
        produits = groupes[niveau]
        if not produits:
            continue
        lignes += [
            "",
            f"## {PASTILLES[niveau]} {LIBELLES[niveau]}",
            "",
            "| Produit | Restant | Seuil bas | À commander | Fournisseur |",
            "| --- | --- | --- | --- | --- |",
        ]
        for produit in produits:
            a_commander = produit.manque_lisible() if niveau != VERT else "—"
            lignes.append(
                f"| {produit.nom} | {produit.quantite_lisible()} | "
                f"{format_nombre(produit.seuil_bas)} {produit.unite} | "
                f"{a_commander} | {produit.fournisseur} |"
            )

    lignes += ["", consigne(global_), ""]
    return "\n".join(lignes)


def rendu_html(groupes: dict[str, list[Produit]], moment: datetime) -> str:
    """Page A4 imprimable, à afficher en réserve ou en salle de pause."""
    global_ = niveau_global(groupes)
    teintes = {
        ROUGE: ("#b3261e", "#fdecea"),
        ORANGE: ("#a15c00", "#fff4e0"),
        VERT: ("#1b6b3a", "#eaf6ee"),
    }

    sections = []
    for niveau in NIVEAUX:
        produits = groupes[niveau]
        if not produits:
            continue
        bordure, fond = teintes[niveau]
        rangs = "\n".join(
            "<tr>"
            f"<td>{escape(produit.nom)}</td>"
            f"<td>{escape(produit.quantite_lisible())}</td>"
            f"<td>{escape(produit.manque_lisible()) if niveau != VERT else '—'}</td>"
            f"<td>{escape(produit.fournisseur)}</td>"
            "</tr>"
            for produit in produits
        )
        sections.append(
            f"""<section style="border-left:8px solid {bordure};background:{fond}">
  <h2>{PASTILLES[niveau]} {LIBELLES[niveau]} — {len(produits)}</h2>
  <table>
    <thead><tr><th>Produit</th><th>Restant</th><th>À commander</th>
    <th>Fournisseur</th></tr></thead>
    <tbody>
{rangs}
    </tbody>
  </table>
</section>"""
        )

    corps = "\n".join(sections)
    return f"""<!doctype html>
<html lang="fr">
<meta charset="utf-8">
<title>Alerte stock — {escape(date_lisible(moment))}</title>
<style>
  body {{ font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
         margin: 2rem auto; max-width: 46rem; color: #1a1a1a; }}
  h1 {{ font-size: 1.6rem; margin-bottom: .2rem; }}
  p.chapeau {{ color: #555; margin-top: 0; }}
  section {{ padding: .8rem 1rem; margin: 1.2rem 0; border-radius: 6px; }}
  h2 {{ font-size: 1.1rem; margin: .2rem 0 .6rem; }}
  table {{ border-collapse: collapse; width: 100%; font-size: .95rem; }}
  th, td {{ text-align: left; padding: .35rem .5rem;
            border-bottom: 1px solid rgba(0,0,0,.12); }}
  th {{ font-weight: 600; }}
  footer {{ margin-top: 2rem; font-weight: 600; }}
  @media print {{ body {{ margin: 0; }} section {{ break-inside: avoid; }} }}
</style>
<h1>{PASTILLES[global_]} Alerte stock du café</h1>
<p class="chapeau">{escape(date_lisible(moment))} — niveau général :
{escape(LIBELLES[global_].lower())}</p>
{corps}
<footer>{consigne(global_)}</footer>
</html>
"""


def construire_parseur() -> argparse.ArgumentParser:
    parseur = argparse.ArgumentParser(
        description="Alerte de stock hebdomadaire du café (vert / orange / rouge).",
    )
    parseur.add_argument(
        "--inventaire",
        type=Path,
        default=Path(__file__).with_name("inventaire.csv"),
        help="fichier CSV d'inventaire (défaut : inventaire.csv à côté du script)",
    )
    parseur.add_argument(
        "--format",
        choices=("texte", "markdown", "html"),
        default="texte",
        help="format du rapport (défaut : texte)",
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
        return {ROUGE: 2, ORANGE: 1, VERT: 0}[niveau_global(groupes)]
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
