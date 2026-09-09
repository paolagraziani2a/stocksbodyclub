"""Tests du téléchargeur Alpaca — sans jamais toucher au réseau.

L'appel réseau est injecté (`ouvrir`), donc tout est vérifié sur des
réponses enregistrées à la main d'après le format documenté par Alpaca.
"""

import csv
import io
import json
import sys
import tempfile
import unittest
import urllib.error
import urllib.parse
from contextlib import redirect_stdout, redirect_stderr
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import telecharger_bougies as tele  # noqa: E402
import bot_trading as bot  # noqa: E402

DEBUT = datetime(2026, 1, 1, tzinfo=timezone.utc)
FIN = datetime(2026, 3, 1, tzinfo=timezone.utc)
CLES = ("identifiant", "secret")


def barre(t="2026-01-02T14:30:00Z", o=100.0, h=101.0, l=99.0, c=100.5, v=1234):
    """Une barre au format Alpaca : t/o/h/l/c/v."""
    return {"t": t, "o": o, "h": h, "l": l, "c": c, "v": v, "n": 10, "vw": 100.2}


class FausseReponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()
        return False


def repondeur(pages):
    """Rend un `ouvrir` qui sert les pages données, l'une après l'autre."""
    restantes = list(pages)
    appels = []

    def ouvrir(requete, timeout=None):
        appels.append(requete)
        return FausseReponse(json.dumps(restantes.pop(0)).encode("utf-8"))

    ouvrir.appels = appels
    return ouvrir


def parametres(url):
    return dict(urllib.parse.parse_qsl(urllib.parse.urlparse(url).query))


# --------------------------------------------------------------------------


class TestLectureSeule(unittest.TestCase):
    """Le point crucial : ce script ne peut pas déranger un autre bot."""

    def test_toutes_les_urls_visent_l_hote_de_donnees(self):
        for source in tele.SOURCES:
            hote = urllib.parse.urlparse(
                tele.url_bougies(source, DEBUT, FIN)
            ).hostname
            self.assertEqual(hote, "data.alpaca.markets", source.code)

    def test_l_hote_de_trading_est_refuse(self):
        """Même forcé, l'appel vers l'API de trading ne part pas."""
        with self.assertRaisesRegex(tele.ErreurAlpaca, "refus d'appeler"):
            tele.appeler(
                "https://api.alpaca.markets/v2/orders", CLES, repondeur([{}])
            )

    def test_un_hote_quelconque_est_refuse(self):
        with self.assertRaisesRegex(tele.ErreurAlpaca, "refus d'appeler"):
            tele.appeler("https://example.com/bars", CLES, repondeur([{}]))

    def test_le_module_ne_nomme_jamais_l_api_de_trading(self):
        source = Path(tele.__file__).read_text(encoding="utf-8")
        lignes_code = [
            ligne for ligne in source.splitlines()
            if "api.alpaca.markets" in ligne
            and not ligne.lstrip().startswith("#")
        ]
        # Elle n'apparaît que dans la docstring, pour dire qu'on n'y touche pas.
        for ligne in lignes_code:
            self.assertIn("jamais", ligne.lower(), ligne)


class TestLesCinqMarches(unittest.TestCase):
    def test_les_memes_cinq_marches_que_le_bot(self):
        self.assertEqual(
            sorted(tele.PAR_CODE), sorted(bot.PAR_CODE),
            "le téléchargeur et le bot doivent parler des mêmes marchés",
        )

    def test_aucun_forex(self):
        """Le bot ne trade pas le forex — et Alpaca n'en propose pas."""
        for source in tele.SOURCES:
            self.assertNotIn("/", source.symbole.replace("BTC/USD", ""))

    def test_les_unites_de_temps_suivent_les_strategies(self):
        attendu = {"SP500": "15Min", "NASDAQ": "15Min", "BITCOIN": "1Hour",
                   "OR": "4Hour", "PETROLE": "4Hour"}
        for code, timeframe in attendu.items():
            self.assertEqual(tele.PAR_CODE[code].timeframe, timeframe)

    def test_chaque_source_dit_ce_qu_elle_approxime(self):
        for source in tele.SOURCES:
            self.assertTrue(source.fidelite.strip(), source.code)


class TestConstructionDesUrls(unittest.TestCase):
    def test_route_actions(self):
        url = tele.url_bougies(tele.PAR_CODE["SP500"], DEBUT, FIN)
        self.assertIn("/v2/stocks/bars", url)

    def test_route_crypto(self):
        url = tele.url_bougies(tele.PAR_CODE["BITCOIN"], DEBUT, FIN)
        self.assertIn("/v1beta3/crypto/us/bars", url)

    def test_le_symbole_crypto_est_encode(self):
        url = tele.url_bougies(tele.PAR_CODE["BITCOIN"], DEBUT, FIN)
        self.assertNotIn("BTC/USD", url)
        self.assertEqual(parametres(url)["symbols"], "BTC/USD")

    def test_les_dates_sont_en_utc_iso(self):
        url = tele.url_bougies(tele.PAR_CODE["SP500"], DEBUT, FIN)
        self.assertEqual(parametres(url)["start"], "2026-01-01T00:00:00Z")
        self.assertEqual(parametres(url)["end"], "2026-03-01T00:00:00Z")

    def test_les_actions_demandent_un_historique_ajuste(self):
        """Sans ajustement, un split casserait l'historique en deux."""
        url = tele.url_bougies(tele.PAR_CODE["SP500"], DEBUT, FIN)
        self.assertEqual(parametres(url)["adjustment"], "all")

    def test_le_flux_ne_concerne_que_les_actions(self):
        actions = parametres(tele.url_bougies(tele.PAR_CODE["OR"], DEBUT, FIN))
        crypto = parametres(tele.url_bougies(tele.PAR_CODE["BITCOIN"], DEBUT, FIN))
        self.assertEqual(actions["feed"], "iex")
        self.assertNotIn("feed", crypto)

    def test_le_flux_est_modifiable(self):
        url = tele.url_bougies(tele.PAR_CODE["SP500"], DEBUT, FIN, feed="sip")
        self.assertEqual(parametres(url)["feed"], "sip")

    def test_le_jeton_de_page_est_transmis(self):
        url = tele.url_bougies(tele.PAR_CODE["SP500"], DEBUT, FIN, jeton="abc")
        self.assertEqual(parametres(url)["page_token"], "abc")

    def test_sans_jeton_pas_de_parametre(self):
        url = tele.url_bougies(tele.PAR_CODE["SP500"], DEBUT, FIN)
        self.assertNotIn("page_token", parametres(url))


class TestConversion(unittest.TestCase):
    def test_les_champs_alpaca_deviennent_ceux_du_bot(self):
        ligne = tele.convertir([barre()])[0]
        self.assertEqual(
            ligne, ["2026-01-02T14:30:00Z", 100.0, 101.0, 99.0, 100.5, 1234]
        )

    def test_l_ordre_des_colonnes_est_celui_du_bot(self):
        self.assertEqual(tele.COLONNES, bot.COLONNES_BOUGIES)

    def test_barre_incomplete_refusee(self):
        incomplete = {"t": "2026-01-02T14:30:00Z", "o": 100.0}
        with self.assertRaisesRegex(tele.ErreurAlpaca, "barre incomplète"):
            tele.convertir([incomplete])

    def test_aucune_barre(self):
        self.assertEqual(tele.convertir([]), [])


class TestTelechargement(unittest.TestCase):
    def test_une_seule_page(self):
        pages = [{"bars": {"SPY": [barre(), barre(t="2026-01-02T14:45:00Z")]},
                  "next_page_token": None}]
        lignes = tele.telecharger(
            tele.PAR_CODE["SP500"], DEBUT, FIN, CLES, ouvrir=repondeur(pages)
        )
        self.assertEqual(len(lignes), 2)

    def test_la_pagination_est_suivie(self):
        pages = [
            {"bars": {"SPY": [barre()]}, "next_page_token": "page2"},
            {"bars": {"SPY": [barre(t="2026-01-03T14:30:00Z")]},
             "next_page_token": None},
        ]
        ouvrir = repondeur(pages)
        lignes = tele.telecharger(
            tele.PAR_CODE["SP500"], DEBUT, FIN, CLES, ouvrir=ouvrir
        )
        self.assertEqual(len(lignes), 2)
        self.assertEqual(len(ouvrir.appels), 2)
        self.assertEqual(parametres(ouvrir.appels[1].full_url)["page_token"], "page2")

    def test_reponse_vide(self):
        pages = [{"bars": {}, "next_page_token": None}]
        lignes = tele.telecharger(
            tele.PAR_CODE["SP500"], DEBUT, FIN, CLES, ouvrir=repondeur(pages)
        )
        self.assertEqual(lignes, [])

    def test_bars_a_null(self):
        """Alpaca renvoie parfois bars: null plutôt qu'un objet vide."""
        pages = [{"bars": None, "next_page_token": None}]
        lignes = tele.telecharger(
            tele.PAR_CODE["SP500"], DEBUT, FIN, CLES, ouvrir=repondeur(pages)
        )
        self.assertEqual(lignes, [])

    def test_les_cles_partent_dans_les_en_tetes(self):
        ouvrir = repondeur([{"bars": {"SPY": [barre()]}, "next_page_token": None}])
        tele.telecharger(tele.PAR_CODE["SP500"], DEBUT, FIN, CLES, ouvrir=ouvrir)
        entetes = ouvrir.appels[0].headers
        self.assertEqual(entetes["Apca-api-key-id"], "identifiant")
        self.assertEqual(entetes["Apca-api-secret-key"], "secret")

    def test_erreur_http_traduite(self):
        def refuser(requete, timeout=None):
            raise urllib.error.HTTPError(
                requete.full_url, 401, "Unauthorized", {}, None
            )
        with self.assertRaisesRegex(tele.ErreurAlpaca, "clés refusées"):
            tele.telecharger(
                tele.PAR_CODE["SP500"], DEBUT, FIN, CLES, ouvrir=refuser
            )

    def test_trop_d_appels_traduit(self):
        def limiter(requete, timeout=None):
            raise urllib.error.HTTPError(requete.full_url, 429, "Too Many", {}, None)
        with self.assertRaisesRegex(tele.ErreurAlpaca, "trop d'appels"):
            tele.telecharger(
                tele.PAR_CODE["SP500"], DEBUT, FIN, CLES, ouvrir=limiter
            )

    def test_reseau_coupe_traduit(self):
        def couper(requete, timeout=None):
            raise urllib.error.URLError("nom introuvable")
        with self.assertRaisesRegex(tele.ErreurAlpaca, "injoignable"):
            tele.telecharger(
                tele.PAR_CODE["SP500"], DEBUT, FIN, CLES, ouvrir=couper
            )

    def test_json_invalide_traduit(self):
        def bavarder(requete, timeout=None):
            return FausseReponse(b"<html>maintenance</html>")
        with self.assertRaisesRegex(tele.ErreurAlpaca, "illisible"):
            tele.telecharger(
                tele.PAR_CODE["SP500"], DEBUT, FIN, CLES, ouvrir=bavarder
            )


class TestCles(unittest.TestCase):
    def test_cles_lues_dans_l_environnement(self):
        self.assertEqual(
            tele.cles_api(
                {"APCA_API_KEY_ID": "abc", "APCA_API_SECRET_KEY": "def"}
            ),
            ("abc", "def"),
        )

    def test_cles_absentes(self):
        with self.assertRaisesRegex(tele.ErreurAlpaca, "clés Alpaca absentes"):
            tele.cles_api({})

    def test_cle_vide_vaut_absente(self):
        with self.assertRaisesRegex(tele.ErreurAlpaca, "clés Alpaca absentes"):
            tele.cles_api({"APCA_API_KEY_ID": "  ", "APCA_API_SECRET_KEY": "def"})


class TestEcritureCsv(unittest.TestCase):
    def test_le_bot_relit_ce_que_le_telechargeur_ecrit(self):
        """Le vrai test d'intégration : la boucle complète, sans réseau."""
        dossier = Path(tempfile.mkdtemp())
        pages = [{
            "bars": {"SPY": [
                barre(t="2026-01-02T14:30:00Z", o=100, h=101, l=99, c=100.5),
                barre(t="2026-01-02T14:45:00Z", o=100.5, h=102, l=100, c=101.5),
            ]},
            "next_page_token": None,
        }]
        lignes = tele.telecharger(
            tele.PAR_CODE["SP500"], DEBUT, FIN, CLES, ouvrir=repondeur(pages)
        )
        tele.ecrire_csv(dossier / "SP500.csv", lignes)

        bougies = bot.lire_bougies(dossier / "SP500.csv")
        self.assertEqual(len(bougies), 2)
        self.assertEqual(bougies[0].cloture, 100.5)
        self.assertEqual(bougies[1].haut, 102.0)
        # Les horodatages Alpaca finissent par « Z » : le fuseau est porté par
        # la donnée, pas déduit. C'est le décalage qui compte, pas l'objet.
        self.assertEqual(bougies[0].horodatage.utcoffset(), timedelta(0))

    def test_charger_marches_accepte_le_dossier_produit(self):
        dossier = Path(tempfile.mkdtemp())
        tele.ecrire_csv(
            dossier / "BITCOIN.csv",
            tele.convertir([barre(t="2026-01-02T14:00:00Z")]),
        )
        self.assertEqual(list(bot.charger_marches(dossier)), ["BITCOIN"])

    def test_le_dossier_est_cree(self):
        chemin = Path(tempfile.mkdtemp()) / "creux" / "SP500.csv"
        tele.ecrire_csv(chemin, tele.convertir([barre()]))
        self.assertTrue(chemin.exists())

    def test_l_entete_est_ecrit(self):
        chemin = Path(tempfile.mkdtemp()) / "SP500.csv"
        tele.ecrire_csv(chemin, [])
        lu = list(csv.reader(chemin.read_text(encoding="utf-8").splitlines()))
        self.assertEqual(lu[0], list(tele.COLONNES))


class TestLigneDeCommande(unittest.TestCase):
    def lancer(self, argv):
        sortie, erreurs = io.StringIO(), io.StringIO()
        with redirect_stdout(sortie), redirect_stderr(erreurs):
            code = tele.main(argv)
        return code, sortie.getvalue(), erreurs.getvalue()

    def test_montrer_urls_n_appelle_rien(self):
        """Utile pour vérifier la configuration sans consommer de quota."""
        code, sortie, _ = self.lancer(["--montrer-urls"])
        self.assertEqual(code, 0)
        for source in tele.SOURCES:
            self.assertIn(source.code, sortie)
        self.assertIn("data.alpaca.markets", sortie)

    def test_montrer_urls_marche_sans_cles(self):
        code, _, erreurs = self.lancer(["--montrer-urls"])
        self.assertEqual(code, 0)
        self.assertNotIn("clés", erreurs)

    def test_montrer_urls_pour_un_seul_marche(self):
        _, sortie, _ = self.lancer(["--montrer-urls", "--marche", "BITCOIN"])
        self.assertIn("BITCOIN", sortie)
        self.assertNotIn("SP500", sortie)

    def test_sans_cles_le_code_de_sortie_signale(self):
        garde = {}
        for nom in ("APCA_API_KEY_ID", "APCA_API_SECRET_KEY"):
            garde[nom] = tele.os.environ.pop(nom, None)
        try:
            code, _, erreurs = self.lancer([])
            self.assertEqual(code, 3)
            self.assertIn("clés Alpaca absentes", erreurs)
        finally:
            for nom, valeur in garde.items():
                if valeur is not None:
                    tele.os.environ[nom] = valeur

    def test_marche_inconnu_refuse(self):
        with self.assertRaises(SystemExit):
            self.lancer(["--marche", "TESLA"])


if __name__ == "__main__":
    unittest.main()
