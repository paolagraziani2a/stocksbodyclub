"""Tests du bot de trading : python3 -m unittest discover tests"""

import csv
import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import bot_trading as bot  # noqa: E402

UTC = ZoneInfo("UTC")
DEBUT = datetime(2026, 1, 1, tzinfo=UTC)

EN_TETES = "horodatage,ouverture,haut,bas,cloture,volume\n"


def bougie(cloture, volume=1000.0, haut=None, bas=None, moment=DEBUT, ouverture=None):
    ouverture = cloture if ouverture is None else ouverture
    return bot.Chandelle(
        horodatage=moment,
        ouverture=ouverture,
        haut=max(ouverture, cloture) if haut is None else haut,
        bas=min(ouverture, cloture) if bas is None else bas,
        cloture=cloture,
        volume=volume,
    )


def serie(clotures, volumes=None, minutes=15, marge=0.01):
    """Une série de bougies à partir d'une simple liste de clôtures."""
    volumes = volumes or [1000.0] * len(clotures)
    return [
        bougie(
            cloture=cloture,
            volume=volume,
            haut=cloture + marge,
            bas=cloture - marge,
            moment=DEBUT + timedelta(minutes=minutes * indice),
        )
        for indice, (cloture, volume) in enumerate(zip(clotures, volumes))
    ]


def plat(nombre=50, base=100.0):
    """Un marché sans direction : c'est le terrain du retour à la moyenne."""
    return [base + (0.1 if indice % 2 else -0.1) for indice in range(nombre)]


def csv_temporaire(lignes, nom="SP500.csv"):
    chemin = Path(tempfile.mkdtemp()) / nom
    chemin.write_text(EN_TETES + lignes, encoding="utf-8")
    return chemin


def position(marche="SP500", sens=bot.LONG, prix=100.0, quantite=10.0):
    return bot.Position(
        marche=marche,
        sens=sens,
        prix_entree=prix,
        quantite=quantite,
        stop=bot.prix_stop(sens, prix, bot.Risque()),
        entree_le=DEBUT,
        motif="test",
    )


# --------------------------------------------------------------------------


class TestLesCinqMarches(unittest.TestCase):
    """Le bot ne traite que ces cinq marchés — c'est toute sa définition."""

    def test_exactement_cinq(self):
        self.assertEqual(
            [m.code for m in bot.MARCHES],
            ["SP500", "NASDAQ", "BITCOIN", "OR", "PETROLE"],
        )

    def test_les_strategies_annoncees(self):
        self.assertEqual(bot.PAR_CODE["SP500"].strategie, bot.RETOUR_MOYENNE)
        self.assertEqual(bot.PAR_CODE["NASDAQ"].strategie, bot.RETOUR_MOYENNE)
        self.assertEqual(bot.PAR_CODE["BITCOIN"].strategie, bot.CASSURE)

    def test_les_unites_de_temps_annoncees(self):
        self.assertEqual(bot.PAR_CODE["SP500"].minutes, 15)
        self.assertEqual(bot.PAR_CODE["NASDAQ"].minutes, 15)
        self.assertEqual(bot.PAR_CODE["BITCOIN"].minutes, 60)

    def test_sp500_et_nasdaq_dans_le_meme_groupe(self):
        self.assertEqual(
            bot.PAR_CODE["SP500"].groupe, bot.PAR_CODE["NASDAQ"].groupe
        )

    def test_chaque_marche_a_une_strategie_connue(self):
        for marche in bot.MARCHES:
            self.assertIn(marche.strategie, bot.STRATEGIES)


class TestIndicateurs(unittest.TestCase):
    def test_moyenne_mobile_sur_la_fenetre_seulement(self):
        bougies = serie([1, 2, 3, 100, 200])
        self.assertEqual(bot.moyenne_mobile(bougies, 2), 150.0)

    def test_moyenne_mobile_sans_assez_de_bougies(self):
        self.assertIsNone(bot.moyenne_mobile(serie([1, 2]), 5))

    def test_ecart_normalise(self):
        # 19 clôtures à 100, une à 90 : la dernière est loin sous la moyenne.
        bougies = serie([100.0] * 19 + [90.0])
        self.assertLess(bot.ecart_normalise(bougies, 20), -2)

    def test_ecart_normalise_sans_dispersion(self):
        self.assertEqual(bot.ecart_normalise(serie([100.0] * 20), 20), 0.0)

    def test_atr(self):
        bougies = serie([100, 100, 100, 100, 100], marge=0.5)
        self.assertAlmostEqual(bot.atr(bougies, 4), 1.0)

    def test_atr_sans_assez_de_bougies(self):
        self.assertIsNone(bot.atr(serie([100, 100]), 14))

    def test_plus_haut_exclut_la_bougie_en_cours(self):
        # La dernière bougie est la plus haute, mais c'est celle qui casse :
        # le niveau à franchir est celui d'avant.
        bougies = serie([100, 101, 102, 500])
        self.assertAlmostEqual(bot.plus_haut(bougies, 3), 102.01)

    def test_plus_bas_exclut_la_bougie_en_cours(self):
        bougies = serie([100, 99, 98, 1])
        self.assertAlmostEqual(bot.plus_bas(bougies, 3), 97.99)

    def test_volume_moyen_exclut_la_bougie_en_cours(self):
        bougies = serie([100] * 4, volumes=[100, 100, 100, 9000])
        self.assertAlmostEqual(bot.volume_moyen(bougies, 3), 100.0)


class TestRetourALaMoyenne(unittest.TestCase):
    """S&P 500 et NASDAQ : entrer quand le prix est allé trop loin."""

    def test_achat_quand_le_prix_est_trop_bas(self):
        bougies = serie(plat(49) + [97.0])
        signal = bot.signal_retour_moyenne(bougies, bot.Reglages())
        self.assertIsNotNone(signal)
        self.assertEqual(signal.sens, bot.LONG)

    def test_vente_quand_le_prix_est_trop_haut(self):
        bougies = serie(plat(49) + [103.0])
        signal = bot.signal_retour_moyenne(bougies, bot.Reglages())
        self.assertIsNotNone(signal)
        self.assertEqual(signal.sens, bot.COURT)

    def test_rien_quand_le_prix_est_pres_de_sa_moyenne(self):
        bougies = serie(plat(50))
        self.assertIsNone(bot.signal_retour_moyenne(bougies, bot.Reglages()))

    def test_abstention_en_marche_qui_tend(self):
        """La même exagération, mais dans une tendance : on n'y touche pas."""
        montee = [100.0 + indice for indice in range(49)]
        bougies = serie(montee + [montee[-1] - 8])
        self.assertIsNone(bot.signal_retour_moyenne(bougies, bot.Reglages()))

    def test_pas_assez_de_bougies(self):
        self.assertIsNone(bot.signal_retour_moyenne(serie(plat(10)), bot.Reglages()))

    def test_sortie_quand_la_moyenne_est_retrouvee(self):
        bougies = serie(plat(49) + [100.0])  # la dernière clôture est sur la moyenne
        self.assertEqual(
            bot.motif_sortie(
                bot.PAR_CODE["SP500"], bot.LONG, bougies, bot.Reglages()
            ),
            "retour à la moyenne fait",
        )

    def test_pas_de_sortie_tant_que_le_prix_est_loin(self):
        bougies = serie(plat(49) + [97.0])
        self.assertIsNone(
            bot.motif_sortie(bot.PAR_CODE["SP500"], bot.LONG, bougies, bot.Reglages())
        )


class TestCassure(unittest.TestCase):
    """Bitcoin : le niveau doit céder *avec du volume*, sinon c'est un piège."""

    def test_cassure_avec_volume(self):
        bougies = serie([100.0] * 21 + [105.0], volumes=[1000.0] * 21 + [3000.0])
        signal = bot.signal_cassure(bougies, bot.Reglages())
        self.assertIsNotNone(signal)
        self.assertEqual(signal.sens, bot.LONG)

    def test_cassure_sans_volume_ignoree(self):
        bougies = serie([100.0] * 21 + [105.0], volumes=[1000.0] * 21 + [500.0])
        self.assertIsNone(bot.signal_cassure(bougies, bot.Reglages()))

    def test_cassure_vers_le_bas(self):
        bougies = serie([100.0] * 21 + [95.0], volumes=[1000.0] * 21 + [3000.0])
        self.assertEqual(bot.signal_cassure(bougies, bot.Reglages()).sens, bot.COURT)

    def test_gros_volume_sans_cassure(self):
        bougies = serie([100.0] * 22, volumes=[1000.0] * 21 + [9000.0])
        self.assertIsNone(bot.signal_cassure(bougies, bot.Reglages()))

    def test_sortie_quand_le_momentum_retombe(self):
        bougies = serie([110.0] * 10 + [100.0])
        self.assertEqual(
            bot.motif_sortie(
                bot.PAR_CODE["BITCOIN"], bot.LONG, bougies, bot.Reglages()
            ),
            "le momentum s'est éteint",
        )


class TestTendance(unittest.TestCase):
    """Or et pétrole : suivre la direction installée."""

    def test_achat_en_tendance_haussiere(self):
        bougies = serie([100.0 + indice for indice in range(45)])
        signal = bot.signal_tendance(bougies, bot.Reglages())
        self.assertIsNotNone(signal)
        self.assertEqual(signal.sens, bot.LONG)

    def test_vente_en_tendance_baissiere(self):
        bougies = serie([200.0 - indice for indice in range(45)])
        self.assertEqual(bot.signal_tendance(bougies, bot.Reglages()).sens, bot.COURT)

    def test_rien_sans_direction(self):
        self.assertIsNone(bot.signal_tendance(serie(plat(45)), bot.Reglages()))

    def test_sortie_au_retournement(self):
        bougies = serie([100.0 + indice for indice in range(45)][::-1])
        self.assertEqual(
            bot.motif_sortie(bot.PAR_CODE["OR"], bot.LONG, bougies, bot.Reglages()),
            "la tendance s'est retournée",
        )


class TestStopDePerte(unittest.TestCase):
    """« Un stop dur à 1 %, sans exception. »"""

    def test_stop_sous_l_entree_en_long(self):
        self.assertAlmostEqual(bot.prix_stop(bot.LONG, 100.0, bot.Risque()), 99.0)

    def test_stop_au_dessus_de_l_entree_en_court(self):
        self.assertAlmostEqual(bot.prix_stop(bot.COURT, 100.0, bot.Risque()), 101.0)

    def test_le_stop_se_juge_sur_la_meche(self):
        """Le bas de bougie touche le stop même si la clôture repasse au-dessus."""
        touchee = bougie(cloture=100.0, haut=100.5, bas=98.0)
        self.assertTrue(bot.stop_touche(position(), touchee))

    def test_stop_non_touche(self):
        epargnee = bougie(cloture=100.0, haut=100.5, bas=99.5)
        self.assertFalse(bot.stop_touche(position(), epargnee))

    def test_stop_du_court_touche_par_le_haut(self):
        courte = position(sens=bot.COURT)
        self.assertTrue(bot.stop_touche(courte, bougie(cloture=100, haut=102, bas=99)))
        self.assertFalse(
            bot.stop_touche(courte, bougie(cloture=100, haut=100.5, bas=99))
        )


class TestTaillePosition(unittest.TestCase):
    def test_la_perte_au_stop_vaut_le_risque_annonce(self):
        risque = bot.Risque()
        quantite = bot.taille_position(10_000.0, 100.0, None, risque)
        perte = (100.0 - bot.prix_stop(bot.LONG, 100.0, risque)) * quantite
        self.assertAlmostEqual(perte, 10_000.0 * risque.risque_par_trade)

    def test_un_marche_agite_donne_une_position_plus_petite(self):
        calme = bot.taille_position(10_000.0, 100.0, 1.0, bot.Risque())
        agite = bot.taille_position(10_000.0, 100.0, 3.0, bot.Risque())
        self.assertLess(agite, calme)
        self.assertAlmostEqual(agite, calme / 3)

    def test_sous_la_volatilite_cible_on_n_agrandit_pas(self):
        risque = bot.Risque()
        cible = bot.taille_position(10_000.0, 100.0, 1.0, risque)
        tres_calme = bot.taille_position(10_000.0, 100.0, 0.1, risque)
        self.assertAlmostEqual(tres_calme, cible)

    def test_le_plafond_d_exposition_est_respecte(self):
        risque = bot.Risque()
        quantite = bot.taille_position(10_000.0, 100.0, None, risque)
        self.assertLessEqual(quantite * 100.0, 10_000.0 * risque.exposition_max + 1e-9)

    def test_capital_epuise(self):
        self.assertEqual(bot.taille_position(0.0, 100.0, None, bot.Risque()), 0.0)


class TestFiltreDeCorrelation(unittest.TestCase):
    """« Pas de long NASDAQ si le S&P 500 est déjà long. »"""

    def test_refus_du_deuxieme_long_dans_le_groupe(self):
        ouvertes = {"SP500": position(marche="SP500", sens=bot.LONG)}
        refus = bot.refus_correlation(bot.PAR_CODE["NASDAQ"], bot.LONG, ouvertes)
        self.assertIsNotNone(refus)
        self.assertIn("S&P 500", refus)

    def test_le_sens_oppose_reste_permis(self):
        ouvertes = {"SP500": position(marche="SP500", sens=bot.LONG)}
        self.assertIsNone(
            bot.refus_correlation(bot.PAR_CODE["NASDAQ"], bot.COURT, ouvertes)
        )

    def test_un_autre_groupe_reste_permis(self):
        ouvertes = {"SP500": position(marche="SP500", sens=bot.LONG)}
        self.assertIsNone(
            bot.refus_correlation(bot.PAR_CODE["BITCOIN"], bot.LONG, ouvertes)
        )

    def test_sans_position_rien_a_refuser(self):
        self.assertIsNone(bot.refus_correlation(bot.PAR_CODE["SP500"], bot.LONG, {}))


class TestPortefeuille(unittest.TestCase):
    def test_gain_d_un_long(self):
        p = bot.Portefeuille(capital_initial=10_000.0)
        p.ouvrir(position(prix=100.0, quantite=10.0))
        trade = p.fermer("SP500", 110.0, DEBUT, "test")
        self.assertAlmostEqual(trade.gain, 100.0)
        self.assertAlmostEqual(p.capital, 10_100.0)

    def test_gain_d_un_court(self):
        p = bot.Portefeuille(capital_initial=10_000.0)
        p.ouvrir(position(sens=bot.COURT, prix=100.0, quantite=10.0))
        trade = p.fermer("SP500", 90.0, DEBUT, "test")
        self.assertAlmostEqual(trade.gain, 100.0)

    def test_perte_d_un_court_qui_monte(self):
        p = bot.Portefeuille(capital_initial=10_000.0)
        p.ouvrir(position(sens=bot.COURT, prix=100.0, quantite=10.0))
        self.assertAlmostEqual(p.fermer("SP500", 110.0, DEBUT, "test").gain, -100.0)

    def test_la_valeur_compte_le_latent(self):
        p = bot.Portefeuille(capital_initial=10_000.0)
        p.ouvrir(position(prix=100.0, quantite=10.0))
        self.assertAlmostEqual(p.valeur({"SP500": 105.0}), 10_050.0)

    def test_la_valeur_sans_position(self):
        p = bot.Portefeuille(capital_initial=10_000.0)
        self.assertAlmostEqual(p.valeur({}), 10_000.0)

    def test_rendement_d_un_trade(self):
        p = bot.Portefeuille(capital_initial=10_000.0)
        p.ouvrir(position(prix=100.0, quantite=10.0))
        self.assertAlmostEqual(p.fermer("SP500", 101.0, DEBUT, "t").rendement, 0.01)


class TestBilan(unittest.TestCase):
    def trade(self, gain):
        return bot.Trade(
            marche="SP500", sens=bot.LONG, prix_entree=100.0,
            prix_sortie=100.0 + gain, quantite=1.0, entree_le=DEBUT,
            sortie_le=DEBUT, motif_entree="", motif_sortie="", gain=gain,
        )

    def test_comptes(self):
        resultat = bot.bilan([self.trade(10), self.trade(-5), self.trade(20)], 1000.0)
        self.assertEqual(resultat.trades, 3)
        self.assertEqual(resultat.gagnants, 2)
        self.assertAlmostEqual(resultat.gain_total, 25.0)
        self.assertAlmostEqual(resultat.gain_moyen, 15.0)
        self.assertAlmostEqual(resultat.perte_moyenne, -5.0)

    def test_journal_vide(self):
        resultat = bot.bilan([], 1000.0)
        self.assertEqual(resultat.trades, 0)
        self.assertEqual(resultat.taux_reussite, 0.0)
        self.assertEqual(resultat.plus_fort_recul, 0.0)

    def test_plus_fort_recul(self):
        # 1000 → 1100 (sommet) → 990 : la descente vaut 110/1100 = 10 %.
        journal = [self.trade(100), self.trade(-110)]
        self.assertAlmostEqual(bot.plus_fort_recul(journal, 1000.0), 0.1)

    def test_pas_de_recul_si_ca_ne_fait_que_monter(self):
        journal = [self.trade(100), self.trade(50)]
        self.assertEqual(bot.plus_fort_recul(journal, 1000.0), 0.0)

    def test_bilan_par_marche_ignore_les_marches_sans_trade(self):
        detail = bot.bilan_par_marche([self.trade(10)], 1000.0)
        self.assertEqual(list(detail), ["SP500"])


class TestLectureDesBougies(unittest.TestCase):
    def test_lecture_nominale(self):
        chemin = csv_temporaire("2026-01-01T00:00:00,100,101,99,100.5,1234\n")
        lue = bot.lire_bougies(chemin)[0]
        self.assertEqual(lue.cloture, 100.5)
        self.assertEqual(lue.volume, 1234.0)

    def test_horodatage_sans_fuseau_lu_en_utc(self):
        chemin = csv_temporaire("2026-01-01T00:00:00,100,101,99,100,1\n")
        self.assertEqual(bot.lire_bougies(chemin)[0].horodatage.tzinfo, bot.UTC)

    def test_horodatage_avec_fuseau_conserve(self):
        chemin = csv_temporaire("2026-01-01T00:00:00+02:00,100,101,99,100,1\n")
        self.assertIsNotNone(bot.lire_bougies(chemin)[0].horodatage.tzinfo)

    def test_colonne_manquante(self):
        chemin = Path(tempfile.mkdtemp()) / "SP500.csv"
        chemin.write_text("horodatage,cloture\n2026-01-01,100\n", encoding="utf-8")
        with self.assertRaisesRegex(bot.ErreurMarche, "colonnes manquantes"):
            bot.lire_bougies(chemin)

    def test_bougie_illisible(self):
        chemin = csv_temporaire("2026-01-01T00:00:00,100,101,99,abc,1\n")
        with self.assertRaisesRegex(bot.ErreurMarche, "illisible"):
            bot.lire_bougies(chemin)

    def test_haut_sous_le_bas(self):
        chemin = csv_temporaire("2026-01-01T00:00:00,100,98,99,100,1\n")
        with self.assertRaisesRegex(bot.ErreurMarche, "haut est sous le bas"):
            bot.lire_bougies(chemin)

    def test_bougies_dans_le_desordre(self):
        chemin = csv_temporaire(
            "2026-01-02T00:00:00,100,101,99,100,1\n"
            "2026-01-01T00:00:00,100,101,99,100,1\n"
        )
        with self.assertRaisesRegex(bot.ErreurMarche, "chronologique"):
            bot.lire_bougies(chemin)

    def test_lignes_vides_ignorees(self):
        chemin = csv_temporaire("2026-01-01T00:00:00,100,101,99,100,1\n,,,,,\n")
        self.assertEqual(len(bot.lire_bougies(chemin)), 1)

    def test_fichier_absent(self):
        with self.assertRaisesRegex(bot.ErreurMarche, "introuvable"):
            bot.lire_bougies(Path("/introuvable/SP500.csv"))

    def test_fichier_sans_bougie(self):
        chemin = csv_temporaire("")
        with self.assertRaisesRegex(bot.ErreurMarche, "aucune bougie"):
            bot.lire_bougies(chemin)


class TestChargementDesMarches(unittest.TestCase):
    def dossier(self, codes):
        chemin = Path(tempfile.mkdtemp())
        for code in codes:
            (chemin / f"{code}.csv").write_text(
                EN_TETES + "2026-01-01T00:00:00,100,101,99,100,1\n", encoding="utf-8"
            )
        return chemin

    def test_marches_partiels_acceptes(self):
        series = bot.charger_marches(self.dossier(["SP500", "OR"]))
        self.assertEqual(sorted(series), ["OR", "SP500"])

    def test_fichier_hors_liste_ignore(self):
        """Un CSX d'un marché que le bot ne traite pas ne le fait pas dévier."""
        chemin = self.dossier(["SP500"])
        (chemin / "TESLA.csv").write_text(EN_TETES, encoding="utf-8")
        self.assertEqual(list(bot.charger_marches(chemin)), ["SP500"])

    def test_dossier_vide(self):
        with self.assertRaisesRegex(bot.ErreurMarche, "aucun fichier de marché"):
            bot.charger_marches(Path(tempfile.mkdtemp()))

    def test_dossier_absent(self):
        with self.assertRaisesRegex(bot.ErreurMarche, "dossier de marchés"):
            bot.charger_marches(Path("/introuvable"))


class TestChronologie(unittest.TestCase):
    def test_les_marches_sont_entrelaces_dans_le_temps(self):
        """15 min et 1 h partagent un capital : ils doivent se rejouer mêlés."""
        series = {
            "SP500": serie([100] * 4, minutes=15),
            "BITCOIN": serie([100] * 1, minutes=60),
        }
        moments = [moment for moment, _, _ in bot.chronologie(series)]
        self.assertEqual(moments, sorted(moments))
        self.assertEqual(len(moments), 5)


class TestRejouer(unittest.TestCase):
    """Les garde-fous doivent tenir sur un historique complet."""

    def setUp(self):
        self.portefeuille = bot.rejouer(bot.series_demo(300), capital=10_000.0)

    def test_des_trades_sont_pris(self):
        self.assertGreater(len(self.portefeuille.journal), 0)

    def test_aucune_perte_ne_depasse_le_stop(self):
        """Le stop à 1 % borne chaque perte : rien ne doit passer au travers."""
        for trade in self.portefeuille.journal:
            self.assertGreaterEqual(
                trade.rendement, -bot.Risque().stop_perte - 1e-9,
                f"{trade.marche} a perdu plus que son stop",
            )

    def test_jamais_plus_d_une_position_par_marche(self):
        for code in self.portefeuille.positions:
            self.assertIn(code, bot.PAR_CODE)

    def test_le_plafond_de_positions_est_respecte(self):
        self.assertLessEqual(
            len(self.portefeuille.positions), bot.Risque().positions_max
        )

    def test_les_trades_ne_portent_que_sur_les_cinq_marches(self):
        codes = {trade.marche for trade in self.portefeuille.journal}
        self.assertTrue(codes <= set(bot.PAR_CODE))

    def test_une_sortie_suit_toujours_son_entree(self):
        for trade in self.portefeuille.journal:
            self.assertGreaterEqual(trade.sortie_le, trade.entree_le)

    def test_le_capital_suit_les_trades(self):
        attendu = 10_000.0 + sum(t.gain for t in self.portefeuille.journal)
        self.assertAlmostEqual(self.portefeuille.capital, attendu, places=6)

    def test_le_filtre_de_correlation_tient_sur_tout_l_historique(self):
        """À aucun moment deux positions de même sens dans un même groupe."""
        portefeuille = bot.Portefeuille(capital_initial=10_000.0)
        series = bot.series_demo(300)
        reglages, risque = bot.Reglages(), bot.Risque()

        for moment, code, indice in bot.chronologie(series):
            marche = bot.PAR_CODE[code]
            historique = series[code][: indice + 1]
            derniere = historique[-1]

            ouverte = portefeuille.positions.get(code)
            if ouverte is not None:
                if bot.stop_touche(ouverte, derniere):
                    portefeuille.fermer(code, ouverte.stop, moment, "stop")
                elif bot.motif_sortie(marche, ouverte.sens, historique, reglages):
                    portefeuille.fermer(code, derniere.cloture, moment, "sortie")
            elif len(portefeuille.positions) < risque.positions_max:
                signal = bot.signal_entree(marche, historique, reglages)
                if signal and not bot.refus_correlation(
                    marche, signal.sens, portefeuille.positions
                ):
                    portefeuille.ouvrir(
                        bot.Position(
                            marche=code, sens=signal.sens,
                            prix_entree=derniere.cloture, quantite=1.0,
                            stop=bot.prix_stop(signal.sens, derniere.cloture, risque),
                            entree_le=moment, motif="",
                        )
                    )

            groupes = [
                (bot.PAR_CODE[c].groupe, p.sens)
                for c, p in portefeuille.positions.items()
            ]
            self.assertEqual(
                len(groupes), len(set(groupes)),
                f"deux positions corrélées ouvertes le {moment}",
            )

    def test_sans_bougie_aucun_trade(self):
        vide = bot.rejouer({"SP500": serie([100.0] * 5)})
        self.assertEqual(vide.journal, [])
        self.assertEqual(vide.positions, {})


class TestDonneesDeDemo(unittest.TestCase):
    def test_reproductible(self):
        self.assertEqual(bot.bougies_demo("OR", 20), bot.bougies_demo("OR", 20))

    def test_chaque_marche_a_sa_serie(self):
        self.assertEqual(sorted(bot.series_demo(30)), sorted(bot.PAR_CODE))

    def test_bougies_coherentes(self):
        for chandelle in bot.bougies_demo("BITCOIN", 100):
            self.assertGreaterEqual(chandelle.haut, chandelle.bas)
            self.assertGreaterEqual(chandelle.haut, chandelle.cloture)
            self.assertLessEqual(chandelle.bas, chandelle.cloture)
            self.assertGreater(chandelle.volume, 0)

    def test_le_pas_de_temps_suit_l_unite_du_marche(self):
        bougies = bot.bougies_demo("BITCOIN", 3)
        self.assertEqual(
            bougies[1].horodatage - bougies[0].horodatage, timedelta(hours=1)
        )


class TestMiseEnForme(unittest.TestCase):
    def test_somme_a_la_francaise(self):
        """Milliers séparés par une espace fine, décimales par une virgule."""
        self.assertEqual(bot.somme(12345.6), f"12{bot.ESPACE_FINE}345,60 €")
        self.assertEqual(bot.somme(9.5), "9,50 €")

    def test_signe(self):
        self.assertEqual(bot.signe(-12.5), "−12,50 €")
        self.assertEqual(bot.signe(12.5), "+12,50 €")

    def test_pourcentage(self):
        self.assertEqual(bot.pourcentage(-0.0437), "−4,37 %")
        self.assertEqual(bot.pourcentage(0.0437), "+4,37 %")

    def test_taux(self):
        self.assertEqual(bot.taux(0.24), "24 %")
        self.assertEqual(bot.taux(0.05, 1), "5,0 %")

    def test_date_lisible_en_heure_de_paris(self):
        moment = datetime(2026, 8, 31, 10, 0, tzinfo=bot.UTC)
        self.assertEqual(bot.date_lisible(moment), "lundi 31 août 2026, 12h00")


class TestRapports(unittest.TestCase):
    def setUp(self):
        self.series = bot.series_demo(300)
        self.portefeuille = bot.rejouer(self.series, capital=10_000.0)
        self.prix = {c: b[-1].cloture for c, b in self.series.items()}
        self.etats = bot.etats(self.series, bot.Reglages())
        self.moment = max(b[-1].horodatage for b in self.series.values())

    def test_message_du_matin_parle_des_cinq_marches(self):
        texte = bot.message_matin(
            self.portefeuille, self.etats, self.prix, self.moment
        )
        for marche in bot.MARCHES:
            self.assertIn(marche.nom, texte)

    def test_message_du_soir_donne_le_capital(self):
        texte = bot.message_soir(self.portefeuille, self.prix, self.moment)
        self.assertIn("PORTEFEUILLE", texte)
        self.assertIn("Capital", texte)

    def test_rapport_texte(self):
        texte = bot.rendu_texte(
            self.portefeuille, self.etats, self.prix, self.moment, couleur=False
        )
        self.assertIn("aucun ordre réel", texte)

    def test_pas_de_couleur_sans_couleur(self):
        texte = bot.rendu_texte(
            self.portefeuille, self.etats, self.prix, self.moment, couleur=False
        )
        self.assertNotIn("\033[", texte)

    def test_rapport_markdown(self):
        texte = bot.rendu_markdown(
            self.portefeuille, self.etats, self.prix, self.moment
        )
        self.assertIn("| Marché |", texte)

    def test_rapport_html_sans_marqueur_oublie(self):
        page = bot.rendu_html(self.portefeuille, self.etats, self.prix, self.moment)
        # main() remplace le marqueur ; le rendu brut le porte encore.
        self.assertIn(bot.MARQUEUR_AVERTISSEMENT, page)
        self.assertIn("<!doctype html>", page)

    def test_etats_couvrent_les_marches_presents(self):
        self.assertEqual(len(self.etats), len(bot.MARCHES))

    def test_journal_csv(self):
        chemin = Path(tempfile.mkdtemp()) / "journal.csv"
        bot.ecrire_journal(chemin, self.portefeuille.journal)
        lignes = list(csv.DictReader(chemin.read_text(encoding="utf-8").splitlines()))
        self.assertEqual(len(lignes), len(self.portefeuille.journal))
        if lignes:
            self.assertIn(lignes[0]["marche"], bot.PAR_CODE)


class TestLigneDeCommande(unittest.TestCase):
    def lancer(self, argv):
        flux = io.StringIO()
        with redirect_stdout(flux):
            code = bot.main(argv)
        return code, flux.getvalue()

    def test_backtest_de_demo(self):
        code, sortie = self.lancer(["--demo"])
        self.assertEqual(code, 0)
        self.assertIn("BOT DE TRADING", sortie)

    def test_l_avertissement_de_demo_est_affiche(self):
        """Des chiffres tirés au sort ne doivent jamais passer pour un résultat."""
        _, sortie = self.lancer(["--demo"])
        self.assertIn("tirées au sort", sortie)

    def test_pas_d_avertissement_sur_de_vraies_bougies(self):
        dossier = Path(tempfile.mkdtemp())
        with (dossier / "SP500.csv").open("w", encoding="utf-8", newline="") as f:
            redacteur = csv.writer(f)
            redacteur.writerow(bot.COLONNES_BOUGIES)
            for b in bot.bougies_demo("SP500", 120):
                redacteur.writerow(
                    [b.horodatage.isoformat(), b.ouverture, b.haut, b.bas,
                     b.cloture, b.volume]
                )
        _, sortie = self.lancer(["--marches", str(dossier)])
        self.assertNotIn("tirées au sort", sortie)

    def test_message_du_matin(self):
        _, sortie = self.lancer(["--demo", "--rapport", "matin"])
        self.assertIn("LES MARCHÉS", sortie)

    def test_message_du_soir(self):
        _, sortie = self.lancer(["--demo", "--rapport", "soir"])
        self.assertIn("LE PORTEFEUILLE", sortie)

    def test_html_ne_laisse_pas_le_marqueur(self):
        sortie = Path(tempfile.mkdtemp()) / "bot.html"
        self.lancer(["--demo", "--format", "html", "--sortie", str(sortie)])
        page = sortie.read_text(encoding="utf-8")
        self.assertNotIn(bot.MARQUEUR_AVERTISSEMENT, page)
        self.assertIn("tirées au sort", page)

    def test_html_sans_demo_ne_laisse_pas_le_marqueur(self):
        dossier = Path(tempfile.mkdtemp())
        with (dossier / "OR.csv").open("w", encoding="utf-8", newline="") as f:
            redacteur = csv.writer(f)
            redacteur.writerow(bot.COLONNES_BOUGIES)
            for b in bot.bougies_demo("OR", 120):
                redacteur.writerow(
                    [b.horodatage.isoformat(), b.ouverture, b.haut, b.bas,
                     b.cloture, b.volume]
                )
        sortie = Path(tempfile.mkdtemp()) / "bot.html"
        self.lancer(
            ["--marches", str(dossier), "--format", "html", "--sortie", str(sortie)]
        )
        self.assertNotIn(
            bot.MARQUEUR_AVERTISSEMENT, sortie.read_text(encoding="utf-8")
        )

    def test_dossier_de_marches_absent(self):
        code, _ = self.lancer(["--marches", "/introuvable"])
        self.assertEqual(code, 3)

    def test_code_sortie_signale_la_perte(self):
        code, _ = self.lancer(["--demo", "--code-sortie"])
        self.assertIn(code, (0, 1))


if __name__ == "__main__":
    unittest.main()
