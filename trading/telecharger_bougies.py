#!/usr/bin/env python3
"""Télécharge les bougies chez Alpaca, pour alimenter le bot.

⚠️ LECTURE SEULE, ET C'EST STRUCTUREL.

Ce script ne parle qu'à `data.alpaca.markets`, l'API de **données**. Il ne
touche jamais à `api.alpaca.markets`, l'API de **trading** : il ne peut donc
ni passer d'ordre, ni lire, ni modifier la moindre position. Si un autre bot
tourne sur le même compte Alpaca, celui-ci ne peut pas le déranger — pas par
prudence, mais parce qu'il ne connaît pas l'adresse pour le faire.

Les clés se lisent dans l'environnement, jamais sur la ligne de commande
(elles resteraient dans l'historique du shell) :

    export APCA_API_KEY_ID=...
    export APCA_API_SECRET_KEY=...

Exemples :
    python3 trading/telecharger_bougies.py                    # les cinq marchés
    python3 trading/telecharger_bougies.py --marche BITCOIN   # un seul
    python3 trading/telecharger_bougies.py --jours 90
    python3 trading/telecharger_bougies.py --montrer-urls     # sans rien appeler
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

# L'hôte des données, et aucun autre. L'API de trading est ailleurs
# (api.alpaca.markets) : ne pas la nommer ici est la garantie.
HOTE_DONNEES = "data.alpaca.markets"

ACTIONS = "actions"
CRYPTO = "crypto"

# Alpaca sert les actions et la crypto par deux routes différentes.
ROUTES = {
    ACTIONS: "/v2/stocks/bars",
    CRYPTO: "/v1beta3/crypto/us/bars",
}

COLONNES = ("horodatage", "ouverture", "haut", "bas", "cloture", "volume")

# Une page Alpaca plafonne à 10 000 barres ; au-delà, on suit le jeton
# de page suivante.
PAR_PAGE = 10_000


@dataclass(frozen=True)
class Source:
    """D'où vient le marché du bot, chez Alpaca."""

    code: str        # le marché, côté bot
    symbole: str     # le symbole, côté Alpaca
    genre: str       # ACTIONS ou CRYPTO — deux routes différentes
    timeframe: str   # l'unité de temps qu'attend la stratégie
    fidelite: str    # ce que ce symbole approxime vraiment


# Alpaca ne propose ni forex, ni CFD, ni contrats à terme : l'or et le
# pétrole n'y existent donc que sous forme d'ETF. C'est une approximation,
# et elle n'est pas de même qualité pour les deux — voir `fidelite`.
SOURCES: tuple[Source, ...] = (
    Source("SP500", "SPY", ACTIONS, "15Min", "ETF qui réplique le S&P 500 — fidèle"),
    Source("NASDAQ", "QQQ", ACTIONS, "15Min", "ETF sur le NASDAQ 100 — fidèle"),
    Source("BITCOIN", "BTC/USD", CRYPTO, "1Hour", "vrai comptant, coté 24 h/24"),
    Source("OR", "GLD", ACTIONS, "4Hour", "ETF adossé à l'or physique — bon proxy"),
    Source(
        "PETROLE", "USO", ACTIONS, "4Hour",
        "ETF sur contrats à terme — dérive du baril avec les roulements",
    ),
)

PAR_CODE = {source.code: source for source in SOURCES}


class ErreurAlpaca(Exception):
    """Clés absentes, appel refusé, ou réponse inexploitable."""


def cles_api(environnement: dict[str, str] | None = None) -> tuple[str, str]:
    """Les deux clés, prises dans l'environnement."""
    environnement = os.environ if environnement is None else environnement
    identifiant = environnement.get("APCA_API_KEY_ID", "").strip()
    secret = environnement.get("APCA_API_SECRET_KEY", "").strip()
    if not identifiant or not secret:
        raise ErreurAlpaca(
            "clés Alpaca absentes — poser APCA_API_KEY_ID et "
            "APCA_API_SECRET_KEY dans l'environnement."
        )
    return identifiant, secret


def url_bougies(
    source: Source,
    debut: datetime,
    fin: datetime,
    feed: str = "iex",
    jeton: str | None = None,
) -> str:
    """L'URL d'une page de bougies — toujours sur l'hôte de données."""
    parametres = {
        "symbols": source.symbole,
        "timeframe": source.timeframe,
        "start": debut.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end": fin.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "limit": str(PAR_PAGE),
        "sort": "asc",
    }
    if source.genre == ACTIONS:
        # Le flux gratuit est IEX ; « sip » demande un abonnement payant.
        parametres["feed"] = feed
        parametres["adjustment"] = "all"  # sinon un split casse l'historique
    if jeton:
        parametres["page_token"] = jeton

    return (
        f"https://{HOTE_DONNEES}{ROUTES[source.genre]}?"
        + urllib.parse.urlencode(parametres)
    )


def appeler(url: str, cles: tuple[str, str], ouvrir=None) -> dict:
    """Le seul point du dépôt qui sorte sur le réseau.

    `ouvrir` est injectable pour que les tests n'aient jamais à appeler
    Alpaca pour de vrai.
    """
    if urllib.parse.urlparse(url).hostname != HOTE_DONNEES:
        raise ErreurAlpaca(f"refus d'appeler autre chose que {HOTE_DONNEES} : {url}")

    identifiant, secret = cles
    requete = urllib.request.Request(
        url,
        headers={
            "APCA-API-KEY-ID": identifiant,
            "APCA-API-SECRET-KEY": secret,
            "Accept": "application/json",
        },
    )
    ouvrir = ouvrir or urllib.request.urlopen
    try:
        with ouvrir(requete, timeout=60) as reponse:
            return json.loads(reponse.read().decode("utf-8"))
    except urllib.error.HTTPError as erreur:
        detail = {
            401: "clés refusées",
            403: "accès interdit — abonnement insuffisant pour ce flux ?",
            429: "trop d'appels, attendre un peu",
        }.get(erreur.code, erreur.reason)
        raise ErreurAlpaca(f"Alpaca a répondu {erreur.code} : {detail}") from erreur
    except urllib.error.URLError as erreur:
        raise ErreurAlpaca(f"Alpaca injoignable : {erreur.reason}") from erreur
    except json.JSONDecodeError as erreur:
        raise ErreurAlpaca("réponse d'Alpaca illisible (JSON invalide)") from erreur


def convertir(barres: list[dict]) -> list[list]:
    """Passe des barres Alpaca aux lignes du CSV que le bot sait lire.

    Alpaca nomme ses champs t/o/h/l/c/v ; le bot attend
    horodatage/ouverture/haut/bas/cloture/volume.
    """
    lignes = []
    for barre in barres:
        try:
            lignes.append([
                barre["t"],
                barre["o"],
                barre["h"],
                barre["l"],
                barre["c"],
                barre["v"],
            ])
        except KeyError as erreur:
            raise ErreurAlpaca(f"barre incomplète, champ {erreur} manquant") from erreur
    return lignes


def telecharger(
    source: Source,
    debut: datetime,
    fin: datetime,
    cles: tuple[str, str],
    feed: str = "iex",
    ouvrir=None,
) -> list[list]:
    """Toutes les bougies d'un marché, en suivant la pagination."""
    lignes: list[list] = []
    jeton: str | None = None
    while True:
        charge = appeler(url_bougies(source, debut, fin, feed, jeton), cles, ouvrir)
        # Alpaca range les barres par symbole, même quand on n'en demande qu'un.
        barres = (charge.get("bars") or {}).get(source.symbole) or []
        lignes += convertir(barres)

        jeton = charge.get("next_page_token")
        if not jeton:
            return lignes


def ecrire_csv(chemin: Path, lignes: list[list]) -> None:
    chemin.parent.mkdir(parents=True, exist_ok=True)
    with chemin.open("w", encoding="utf-8", newline="") as fichier:
        redacteur = csv.writer(fichier)
        redacteur.writerow(COLONNES)
        redacteur.writerows(lignes)


# --------------------------------------------------------------------------


def construire_parseur() -> argparse.ArgumentParser:
    parseur = argparse.ArgumentParser(
        description=(
            "Télécharge les bougies des cinq marchés chez Alpaca. "
            "Lecture seule : ne touche jamais à l'API de trading, et ne peut "
            "donc pas déranger un autre bot tournant sur le même compte."
        ),
    )
    parseur.add_argument(
        "--dossier",
        type=Path,
        default=Path(__file__).with_name("marches"),
        help="où écrire les CSV (défaut : trading/marches/)",
    )
    parseur.add_argument(
        "--marche",
        choices=[source.code for source in SOURCES],
        action="append",
        help="ne traiter que ce marché (répétable ; défaut : les cinq)",
    )
    parseur.add_argument(
        "--jours",
        type=int,
        default=60,
        help="profondeur d'historique en jours (défaut : 60)",
    )
    parseur.add_argument(
        "--feed",
        choices=("iex", "sip"),
        default="iex",
        help="flux actions : « iex » est gratuit, « sip » est payant (défaut : iex)",
    )
    parseur.add_argument(
        "--montrer-urls",
        action="store_true",
        help="afficher les URL qui seraient appelées, sans rien appeler",
    )
    return parseur


def main(argv: list[str] | None = None) -> int:
    arguments = construire_parseur().parse_args(argv)

    sources = [PAR_CODE[code] for code in arguments.marche] if arguments.marche \
        else list(SOURCES)
    fin = datetime.now(timezone.utc)
    debut = fin - timedelta(days=arguments.jours)

    if arguments.montrer_urls:
        for source in sources:
            print(f"{source.code} ({source.fidelite})")
            print(f"  {url_bougies(source, debut, fin, arguments.feed)}")
        return 0

    try:
        cles = cles_api()
    except ErreurAlpaca as erreur:
        print(f"Erreur : {erreur}", file=sys.stderr)
        return 3

    code_retour = 0
    for source in sources:
        try:
            lignes = telecharger(source, debut, fin, cles, arguments.feed)
        except ErreurAlpaca as erreur:
            print(f"{source.code} : {erreur}", file=sys.stderr)
            code_retour = 1
            continue

        if not lignes:
            print(
                f"{source.code} : aucune bougie renvoyée — période trop courte, "
                "ou flux « iex » trop maigre sur cette unité de temps.",
                file=sys.stderr,
            )
            code_retour = 1
            continue

        chemin = arguments.dossier / f"{source.code}.csv"
        ecrire_csv(chemin, lignes)
        print(f"{source.code} : {len(lignes)} bougies → {chemin}")

    return code_retour


if __name__ == "__main__":
    raise SystemExit(main())
