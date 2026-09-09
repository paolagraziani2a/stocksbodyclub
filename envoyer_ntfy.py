#!/usr/bin/env python3
"""Envoie un texte en notification push via ntfy.

Le rapport du vendredi passe par ici : ntfy pousse la notification sur
l'application ntfy de l'iPad, sans compte ni serveur à gérer.

Le sujet ntfy se lit dans la variable d'environnement NTFY_TOPIC — ou, à
défaut, dans un fichier ntfy.txt local, que .gitignore tient hors du dépôt.

    echo "Stock bas : lait avoine" | python3 envoyer_ntfy.py
    python3 envoyer_ntfy.py --titre "Relevé du vendredi" --fichier rapport.txt

⚠️ Sur ntfy.sh, un sujet n'est protégé que par son nom : qui le connaît peut
lire les notifications et en publier de fausses. Ce dépôt étant public, le
sujet ne doit JAMAIS y être commité — il vit dans le secret GitHub
NTFY_TOPIC, que le workflow « Notification ntfy » utilise.
"""

from __future__ import annotations

import argparse
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent
FICHIER_SUJET = RACINE / "ntfy.txt"
SERVEUR = os.environ.get("NTFY_SERVEUR", "https://ntfy.sh")

# ntfy attend des en-têtes en latin-1 ; les accents et emoji passent par le
# corps du message, jamais par le titre.
PRIORITES = {"rouge": "high", "orange": "default", "vert": "low"}


class ErreurNtfy(Exception):
    """Le sujet est absent, ou l'envoi a échoué."""


def lire_sujet() -> str:
    sujet = (os.environ.get("NTFY_TOPIC") or "").strip()
    if not sujet and FICHIER_SUJET.exists():
        sujet = FICHIER_SUJET.read_text(encoding="utf-8").strip()
    if not sujet:
        raise ErreurNtfy(
            "aucun sujet ntfy : renseigner NTFY_TOPIC ou le fichier ntfy.txt."
        )
    return sujet


def entete_sur(valeur: str) -> str:
    """ntfy transmet les en-têtes en latin-1 : on retire ce qui ne passe pas."""
    return valeur.encode("latin-1", "ignore").decode("latin-1")


def envoyer(
    message: str,
    titre: str = "Relevé stocks Body Club",
    priorite: str = "default",
    etiquettes: str = "package",
    sujet: str | None = None,
) -> None:
    sujet = sujet or lire_sujet()
    requete = urllib.request.Request(
        f"{SERVEUR}/{sujet}",
        data=message.encode("utf-8"),
        method="POST",
        headers={
            "Title": entete_sur(titre),
            "Priority": priorite,
            "Tags": etiquettes,
            "Markdown": "yes",
        },
    )
    try:
        with urllib.request.urlopen(requete, timeout=20) as reponse:
            if reponse.status >= 300:
                raise ErreurNtfy(f"ntfy a répondu {reponse.status}")
    except urllib.error.URLError as erreur:
        raise ErreurNtfy(
            f"envoi impossible ({erreur}). Si le réseau est filtré, autoriser "
            "ntfy.sh dans la politique réseau de l'environnement."
        ) from erreur


def main(argv: list[str] | None = None) -> int:
    parseur = argparse.ArgumentParser(description="Envoie une notification ntfy.")
    parseur.add_argument("--titre", default="Relevé stocks Body Club")
    parseur.add_argument(
        "--niveau",
        choices=sorted(PRIORITES),
        help="règle la priorité de la notification d'après le niveau général",
    )
    parseur.add_argument("--fichier", type=Path, help="lire le message ici")
    arguments = parseur.parse_args(argv)

    message = (
        arguments.fichier.read_text(encoding="utf-8")
        if arguments.fichier
        else sys.stdin.read()
    )
    if not message.strip():
        print("Erreur : message vide.", file=sys.stderr)
        return 2

    try:
        envoyer(
            message,
            titre=arguments.titre,
            priorite=PRIORITES.get(arguments.niveau or "", "default"),
        )
    except ErreurNtfy as erreur:
        print(f"Erreur : {erreur}", file=sys.stderr)
        return 3

    print("Notification envoyée.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
