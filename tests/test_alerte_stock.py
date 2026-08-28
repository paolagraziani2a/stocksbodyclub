"""Tests de l'alerte de stock : python3 -m unittest discover tests"""

import io
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import alerte_stock as app  # noqa: E402

EN_TETES = "produit,categorie,niveau,remarque\n"


def produit(niveau, nom="Café grains", categorie="Alimentaire", remarque=""):
    return app.Produit(
        nom=nom, categorie=categorie, niveau=niveau, remarque=remarque
    )


def csv_temporaire(lignes):
    fichier = Path(tempfile.mkdtemp()) / "inventaire.csv"
    fichier.write_text(EN_TETES + lignes, encoding="utf-8")
    return fichier


class TestNormalisationDesNiveaux(unittest.TestCase):
    def test_initiales(self):
        self.assertEqual(app.normaliser_niveau("v"), app.VERT)
        self.assertEqual(app.normaliser_niveau("o"), app.ORANGE)
        self.assertEqual(app.normaliser_niveau("r"), app.ROUGE)

    def test_mots_entiers(self):
        self.assertEqual(app.normaliser_niveau("Rouge"), app.ROUGE)
        self.assertEqual(app.normaliser_niveau("  ORANGE  "), app.ORANGE)

    def test_pastilles(self):
        self.assertEqual(app.normaliser_niveau("🟢"), app.VERT)

    def test_cellule_vide(self):
        self.assertEqual(app.normaliser_niveau(""), app.INCONNU)
        self.assertEqual(app.normaliser_niveau(None), app.INCONNU)
        self.assertEqual(app.normaliser_niveau("   "), app.INCONNU)

    def test_valeur_inconnue(self):
        with self.assertRaises(ValueError):
            app.normaliser_niveau("jaune")


class TestNiveauGlobal(unittest.TestCase):
    def test_rouge_prime_sur_orange(self):
        groupes = app.grouper(
            [produit(app.ROUGE), produit(app.ORANGE, nom="Sucre"),
             produit(app.VERT, nom="Granola")]
        )
        self.assertEqual(app.niveau_global(groupes), app.ROUGE)

    def test_orange_prime_sur_vert(self):
        groupes = app.grouper([produit(app.ORANGE), produit(app.VERT, nom="Granola")])
        self.assertEqual(app.niveau_global(groupes), app.ORANGE)

    def test_vert_si_tout_va_bien(self):
        self.assertEqual(app.niveau_global(app.grouper([produit(app.VERT)])), app.VERT)

    def test_les_non_verifies_ne_font_pas_le_niveau_general(self):
        groupes = app.grouper([produit(app.VERT), produit(app.INCONNU, nom="Sucre")])
        self.assertEqual(app.niveau_global(groupes), app.VERT)

    def test_inconnu_si_rien_n_est_verifie(self):
        groupes = app.grouper([produit(app.INCONNU)])
        self.assertEqual(app.niveau_global(groupes), app.INCONNU)

    def test_tri_par_categorie_puis_nom(self):
        groupes = app.grouper(
            [
                produit(app.ORANGE, nom="Sucre", categorie="Alimentaire"),
                produit(app.ORANGE, nom="Lait avoine", categorie="Laits & frais"),
                produit(app.ORANGE, nom="Ail", categorie="Alimentaire"),
            ]
        )
        self.assertEqual(
            [p.nom for p in groupes[app.ORANGE]], ["Ail", "Sucre", "Lait avoine"]
        )


class TestLectureInventaire(unittest.TestCase):
    def test_lecture_nominale(self):
        chemin = csv_temporaire("Lait avoine,Laits & frais,orange,plus que 2\n")
        lu = app.lire_inventaire(chemin)[0]
        self.assertEqual(lu.nom, "Lait avoine")
        self.assertEqual(lu.niveau, app.ORANGE)
        self.assertEqual(lu.remarque, "plus que 2")

    def test_niveau_vide_accepte(self):
        chemin = csv_temporaire("Cannelle,Alimentaire,,\n")
        self.assertEqual(app.lire_inventaire(chemin)[0].niveau, app.INCONNU)

    def test_initiale_acceptee_dans_le_fichier(self):
        chemin = csv_temporaire("Cannelle,Alimentaire,R,\n")
        self.assertEqual(app.lire_inventaire(chemin)[0].niveau, app.ROUGE)

    def test_niveau_invalide(self):
        chemin = csv_temporaire("Cannelle,Alimentaire,jaune,\n")
        with self.assertRaisesRegex(app.ErreurInventaire, "n'est pas un niveau"):
            app.lire_inventaire(chemin)

    def test_virgule_dans_le_nom_du_produit(self):
        chemin = csv_temporaire('"Zilia 1,5 L",Eaux,vert,\n')
        self.assertEqual(app.lire_inventaire(chemin)[0].nom, "Zilia 1,5 L")

    def test_meme_nom_dans_deux_categories(self):
        chemin = csv_temporaire(
            "Framboise,Sirops Monin,vert,\nFramboise,Sauces sucrées,rouge,\n"
        )
        produits = app.lire_inventaire(chemin)
        self.assertEqual(len(produits), 2)
        self.assertEqual(produits[0].niveau, app.VERT)
        self.assertEqual(produits[1].niveau, app.ROUGE)

    def test_doublon_dans_la_meme_categorie(self):
        chemin = csv_temporaire(
            "Framboise,Sirops Monin,vert,\nframboise,Sirops Monin,rouge,\n"
        )
        with self.assertRaisesRegex(app.ErreurInventaire, "déjà présent"):
            app.lire_inventaire(chemin)

    def test_lignes_vides_ignorees(self):
        chemin = csv_temporaire("Lait avoine,Laits & frais,vert,\n,,,\n")
        self.assertEqual(len(app.lire_inventaire(chemin)), 1)

    def test_fichier_absent(self):
        with self.assertRaisesRegex(app.ErreurInventaire, "introuvable"):
            app.lire_inventaire(Path("/introuvable/inventaire.csv"))

    def test_colonne_manquante(self):
        chemin = Path(tempfile.mkdtemp()) / "i.csv"
        chemin.write_text("produit,niveau\nSucre,vert\n", encoding="utf-8")
        with self.assertRaisesRegex(app.ErreurInventaire, "colonnes manquantes"):
            app.lire_inventaire(chemin)

    def test_inventaire_vide(self):
        with self.assertRaisesRegex(app.ErreurInventaire, "aucun produit"):
            app.lire_inventaire(csv_temporaire(""))


class TestEcritureInventaire(unittest.TestCase):
    def test_aller_retour(self):
        chemin = csv_temporaire(
            '"Zilia 1,5 L",Eaux,vert,\nLait avoine,Laits & frais,rouge,urgent\n'
        )
        avant = app.lire_inventaire(chemin)
        app.ecrire_inventaire(chemin, avant)
        self.assertEqual(app.lire_inventaire(chemin), avant)


class TestInventaireDuBodyClub(unittest.TestCase):
    """Garde-fou sur le vrai fichier livré avec le dépôt."""

    @classmethod
    def setUpClass(cls):
        cls.produits = app.lire_inventaire(
            Path(app.__file__).with_name("inventaire.csv")
        )

    def test_140_references(self):
        self.assertEqual(len(self.produits), 140)

    def test_effectif_par_categorie(self):
        attendu = {
            "Alimentaire": 29,
            "Laits & frais": 6,
            "Sauces cuisine": 3,
            "Symples": 3,
            "Boissons": 14,
            "Sirops Monin": 15,
            "Sauces sucrées": 7,
            "Maya": 5,
            "Eaux": 3,
            "Étiquettes": 17,
            "Emballages / consommables": 17,
            "Ménager": 19,
            "Divers": 2,
        }
        reel = {c: len(p) for c, p in app.par_categorie(self.produits).items()}
        self.assertEqual(reel, attendu)


class TestSaisieInteractive(unittest.TestCase):
    def _saisir(self, produits, frappes):
        return app.saisie_interactive(
            produits, entree=io.StringIO(frappes), sortie=io.StringIO()
        )

    def test_choix_successifs(self):
        produits = [
            produit(app.INCONNU, nom="Sucre"),
            produit(app.INCONNU, nom="Granola"),
            produit(app.INCONNU, nom="Ail"),
        ]
        resultat = self._saisir(produits, "v\no\nr\n")
        self.assertEqual(
            [p.niveau for p in resultat], [app.VERT, app.ORANGE, app.ROUGE]
        )

    def test_entree_vide_garde_le_niveau_actuel(self):
        produits = [produit(app.ORANGE, nom="Sucre")]
        self.assertEqual(self._saisir(produits, "\n")[0].niveau, app.ORANGE)

    def test_x_efface_le_niveau(self):
        produits = [produit(app.ROUGE, nom="Sucre")]
        self.assertEqual(self._saisir(produits, "x\n")[0].niveau, app.INCONNU)

    def test_q_enregistre_et_quitte(self):
        produits = [produit(app.INCONNU, nom="Sucre"), produit(app.INCONNU, nom="Ail")]
        resultat = self._saisir(produits, "r\nq\n")
        self.assertEqual([p.niveau for p in resultat], [app.ROUGE, app.INCONNU])

    def test_p_passe_toute_la_categorie(self):
        produits = [
            produit(app.INCONNU, nom="Sucre", categorie="Alimentaire"),
            produit(app.INCONNU, nom="Ail", categorie="Alimentaire"),
            produit(app.INCONNU, nom="Lait avoine", categorie="Laits & frais"),
        ]
        resultat = self._saisir(produits, "p\nv\n")
        self.assertEqual(
            [p.niveau for p in resultat], [app.INCONNU, app.INCONNU, app.VERT]
        )

    def test_reponse_invalide_repose_la_question(self):
        produits = [produit(app.INCONNU, nom="Sucre")]
        self.assertEqual(self._saisir(produits, "jaune\nv\n")[0].niveau, app.VERT)

    def test_fin_de_saisie_prematuree(self):
        produits = [produit(app.INCONNU, nom="Sucre"), produit(app.INCONNU, nom="Ail")]
        resultat = self._saisir(produits, "v\n")
        self.assertEqual([p.niveau for p in resultat], [app.VERT, app.INCONNU])


class TestRendus(unittest.TestCase):
    def setUp(self):
        self.produits = [
            produit(app.ROUGE, nom="Lait avoine", categorie="Laits & frais",
                    remarque="rupture lundi"),
            produit(app.ORANGE, nom="Sucre"),
            produit(app.VERT, nom="Granola"),
            produit(app.INCONNU, nom="Cannelle"),
        ]
        self.groupes = app.grouper(self.produits)
        self.moment = datetime(2026, 8, 28, 15, 0, tzinfo=app.FUSEAU)

    def test_texte_sans_couleur(self):
        rapport = app.rendu_texte(self.groupes, self.moment, couleur=False)
        self.assertNotIn("\033[", rapport)
        self.assertIn("vendredi 28 août 2026, 15h00", rapport)
        self.assertIn("Laits & frais › Lait avoine — rupture lundi", rapport)

    def test_texte_avec_couleur(self):
        rapport = app.rendu_texte(self.groupes, self.moment, couleur=True)
        self.assertIn(app.ANSI[app.ROUGE], rapport)

    def test_texte_signale_les_non_verifies(self):
        rapport = app.rendu_texte(self.groupes, self.moment, couleur=False)
        self.assertIn("Cannelle", rapport)
        self.assertIn("pas encore été vérifié", rapport)

    def test_markdown_liste_les_quatre_niveaux(self):
        rapport = app.rendu_markdown(self.groupes, self.moment)
        for niveau in app.NIVEAUX:
            self.assertIn(app.LIBELLES[niveau], rapport)

    def test_html_echappe_les_noms(self):
        groupes = app.grouper([produit(app.ROUGE, nom="Sirop <caramel>")])
        rapport = app.rendu_html(groupes, self.moment)
        self.assertIn("Sirop &lt;caramel&gt;", rapport)
        self.assertNotIn("<caramel>", rapport)

    def test_feuille_trois_cases_par_produit(self):
        feuille = app.rendu_feuille(self.produits, self.moment)
        self.assertIn("Relevé des stocks", feuille)
        self.assertIn("Laits &amp; frais", feuille)
        self.assertEqual(feuille.count("☐"), 3 * len(self.produits))


class TestLigneDeCommande(unittest.TestCase):
    def test_ecriture_dans_un_fichier(self):
        sortie = Path(tempfile.mkdtemp()) / "rapport" / "alerte.md"
        self.assertEqual(
            app.main(["--format", "markdown", "--sortie", str(sortie)]), 0
        )
        self.assertIn("Alerte stock", sortie.read_text(encoding="utf-8"))

    def test_feuille_en_ligne_de_commande(self):
        sortie = Path(tempfile.mkdtemp()) / "feuille.html"
        self.assertEqual(app.main(["--format", "feuille", "--sortie", str(sortie)]), 0)
        self.assertIn("Relevé des stocks", sortie.read_text(encoding="utf-8"))

    def test_code_sortie_rouge(self):
        chemin = csv_temporaire("Lait avoine,Laits & frais,rouge,\n")
        self.assertEqual(app.main(["--inventaire", str(chemin), "--code-sortie"]), 2)

    def test_code_sortie_orange(self):
        chemin = csv_temporaire("Lait avoine,Laits & frais,orange,\n")
        self.assertEqual(app.main(["--inventaire", str(chemin), "--code-sortie"]), 1)

    def test_code_sortie_vert(self):
        chemin = csv_temporaire("Lait avoine,Laits & frais,vert,\n")
        self.assertEqual(app.main(["--inventaire", str(chemin), "--code-sortie"]), 0)

    def test_code_sortie_non_verifie_ne_declenche_pas_de_commande(self):
        chemin = csv_temporaire("Cannelle,Alimentaire,,\n")
        self.assertEqual(app.main(["--inventaire", str(chemin), "--code-sortie"]), 0)

    def test_reinitialiser_efface_les_niveaux(self):
        chemin = csv_temporaire(
            "Lait avoine,Laits & frais,rouge,urgent\nSucre,Alimentaire,vert,\n"
        )
        self.assertEqual(app.main(["--inventaire", str(chemin), "--reinitialiser"]), 0)
        produits = app.lire_inventaire(chemin)
        self.assertEqual(len(produits), 2)
        self.assertTrue(all(p.niveau == app.INCONNU for p in produits))
        self.assertTrue(all(p.remarque == "" for p in produits))

    def test_erreur_inventaire(self):
        self.assertEqual(app.main(["--inventaire", "/introuvable.csv"]), 3)


if __name__ == "__main__":
    unittest.main()
