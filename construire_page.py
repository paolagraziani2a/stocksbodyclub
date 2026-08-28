#!/usr/bin/env python3
"""Construit la page de relevé iPad à partir d'inventaire.csv.

Le modèle `page/modele.html` est un document complet contenant deux
marqueurs :

    __ETAT__     la liste des produits, en JSON
    __MODELE__   une copie du modèle lui-même, que la page republie
                 quand elle doit se réécrire entièrement

Ce script produit :

    page/releve.html    le fragment à publier comme Artifact
    page/apercu.html    le document complet, ouvrable en local pour voir
                        le rendu sans publier

Usage :
    python3 construire_page.py
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from alerte_stock import ErreurInventaire, lire_inventaire

RACINE = Path(__file__).resolve().parent
MODELE = RACINE / "page" / "modele.html"
FRAGMENT = RACINE / "page" / "releve.html"
APERCU = RACINE / "page" / "apercu.html"

# Lignes d'enveloppe à retirer : l'Artifact fournit lui-même le squelette
# <!doctype html><head></head><body>.
ENVELOPPE = (
    "<!doctype html>",
    '<html lang="fr">',
    "<head>",
    "</head>",
    "<body>",
    "</body>",
    "</html>",
)


def semaine_courante(moment: datetime) -> str:
    annee, numero, _ = moment.isocalendar()
    return f"{annee}-S{numero:02d}"


def etat_initial(produits, moment: datetime) -> dict:
    return {
        "enseigne": "The Body Club",
        "semaine": semaine_courante(moment),
        "maj": "",
        "produits": [
            {"nom": p.nom, "cat": p.categorie, "niveau": p.niveau, "note": p.remarque}
            for p in produits
        ],
    }


def encoder(texte: str) -> str:
    """Neutralise les `</script>` pour que le modèle tienne dans un script."""
    return texte.replace("</", "<\\/")


def retirer_enveloppe(document: str) -> str:
    lignes = [
        ligne
        for ligne in document.splitlines()
        if ligne.strip() not in ENVELOPPE
    ]
    return "\n".join(lignes) + "\n"


def construire(modele: str, etat: dict) -> tuple[str, str]:
    """Renvoie (fragment pour l'Artifact, document complet)."""
    # Chaque marqueur doit apparaître exactement une fois : s'il traîne
    # ailleurs — dans le code JS qui les manipule, par exemple — la
    # substitution casserait la page.
    for marqueur in ("__ETAT__", "__MODELE__"):
        trouves = modele.count(marqueur)
        if trouves != 1:
            raise SystemExit(
                f"Le modèle doit contenir {marqueur} exactement une fois "
                f"(trouvé {trouves} fois)."
            )

    # `<` échappé : le JSON ne peut plus fermer la balise <script> qui le porte.
    charge = json.dumps(etat, ensure_ascii=False).replace("<", "\\u003c")
    copie = encoder(modele)

    def remplir(gabarit: str) -> str:
        return gabarit.replace("__ETAT__", charge).replace("__MODELE__", copie)

    return remplir(retirer_enveloppe(modele)), remplir(modele)


def main() -> int:
    try:
        produits = lire_inventaire(RACINE / "inventaire.csv")
    except ErreurInventaire as erreur:
        print(f"Erreur : {erreur}", file=sys.stderr)
        return 3

    modele = MODELE.read_text(encoding="utf-8")
    etat = etat_initial(produits, datetime.now(ZoneInfo("Europe/Paris")))
    fragment, complet = construire(modele, etat)

    FRAGMENT.write_text(fragment, encoding="utf-8")
    APERCU.write_text(complet, encoding="utf-8")

    categories = {p.categorie for p in produits}
    print(
        f"{len(produits)} produits, {len(categories)} catégories\n"
        f"  {FRAGMENT.relative_to(RACINE)}  ({len(fragment) // 1024} Kio) — à publier\n"
        f"  {APERCU.relative_to(RACINE)}  ({len(complet) // 1024} Kio) — aperçu local"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
