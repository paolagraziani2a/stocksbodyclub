"""Tests de l'alerte de stock : python3 -m unittest discover tests"""

import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import alerte_stock as app  # noqa: E402

EN_TETES = "produit,categorie,unite,quantite,seuil_bas,seuil_urgent,fournisseur\n"


def produit(quantite, seuil_bas=10, seuil_urgent=4, nom="Café grains", categorie="Alimentaire"):
    return app.Produit(
        nom=nom,
        categorie=categorie,
        unite="kg",
        quantite=quantite,
        seuil_bas=seuil_bas,
        seuil_urgent=seuil_urgent,
        fournisseur="Metro",
    )


def csv_temporaire(lignes):
    fichier = Path(tempfile.mkdtemp()) / "inventaire.csv"
    fichier.write_text(EN_TETES + lignes, encoding="utf-8")
    return fichier


class TestNiveaux(unittest.TestCase):
    def test_vert_au_dessus_du_seuil_bas(self):
        self.assertEqual(produit(11).niveau, app.VERT)

    def test_orange_sur_le_seuil_bas(self):
        self.assertEqual(produit(10).niveau, app.ORANGE)

    def test_orange_entre_les_deux_seuils(self):
        self.assertEqual(produit(5).niveau, app.ORANGE)

    def test_rouge_sur_le_seuil_urgent(self):
        self.assertEqual(produit(4).niveau, app.ROUGE)

    def test_rouge_en_dessous_du_seuil_urgent(self):
        self.assertEqual(produit(0).niveau, app.ROUGE)

    def test_rouge_prime_si_les_seuils_sont_egaux(self):
        self.assertEqual(produit(3, seuil_bas=3, seuil_urgent=3).niveau, app.ROUGE)

    def test_manque_ramene_au_seuil_bas(self):
        self.assertEqual(produit(4).manque, 6)

    def test_manque_nul_quand_le_stock_est_suffisant(self):
        self.assertEqual(produit(20).manque, 0)


class TestProduitsNonRenseignes(unittest.TestCase):
    """Un produit incomplet ne doit jamais passer pour vert."""

    def test_sans_quantite(self):
        self.assertEqual(produit(None).niveau, app.INCONNU)

    def test_sans_seuils(self):
        self.assertEqual(
            produit(12, seuil_bas=None, seuil_urgent=None).niveau, app.INCONNU
        )

    def test_sans_seuil_urgent_seulement(self):
        self.assertEqual(produit(12, seuil_urgent=None).niveau, app.INCONNU)

    def test_manque_nul_si_incomplet(self):
        self.assertEqual(produit(None).manque, 0)

    def test_raison_a_compter(self):
        self.assertEqual(produit(None, seuil_bas=10).raison_inconnu(), "à compter")

    def test_raison_seuils_a_definir(self):
        self.assertEqual(
            produit(12, seuil_bas=None, seuil_urgent=None).raison_inconnu(),
            "seuils à définir",
        )

    def test_quantite_lisible_sans_quantite(self):
        self.assertEqual(produit(None).quantite_lisible(), "—")


class TestNiveauGlobal(unittest.TestCase):
    def test_rouge_prime_sur_orange(self):
        groupes = app.grouper(
            [produit(2), produit(5, nom="Sucre"), produit(50, nom="Granola")]
        )
        self.assertEqual(app.niveau_global(groupes), app.ROUGE)

    def test_orange_prime_sur_vert(self):
        groupes = app.grouper([produit(5), produit(50, nom="Granola")])
        self.assertEqual(app.niveau_global(groupes), app.ORANGE)

    def test_vert_si_tout_va_bien(self):
        self.assertEqual(app.niveau_global(app.grouper([produit(50)])), app.VERT)

    def test_les_inconnus_ne_font_pas_le_niveau_general(self):
        groupes = app.grouper([produit(50), produit(None, nom="Sucre")])
        self.assertEqual(app.niveau_global(groupes), app.VERT)

    def test_inconnu_si_rien_n_est_renseigne(self):
        self.assertEqual(app.niveau_global(app.grouper([produit(None)])), app.INCONNU)

    def test_tri_du_plus_manquant_au_moins_manquant(self):
        groupes = app.grouper([produit(9, nom="Sucre"), produit(1, nom="Granola")])
        self.assertEqual([p.nom for p in groupes[app.ORANGE]], ["Sucre"])
        self.assertEqual([p.nom for p in groupes[app.ROUGE]], ["Granola"])


class TestLectureInventaire(unittest.TestCase):
    def test_lecture_nominale(self):
        chemin = csv_temporaire("Lait avoine,Laits & frais,L,18,24,10,Metro\n")
        produits = app.lire_inventaire(chemin)
        self.assertEqual(len(produits), 1)
        self.assertEqual(produits[0].nom, "Lait avoine")
        self.assertEqual(produits[0].niveau, app.ORANGE)

    def test_cellules_vides_acceptees(self):
        chemin = csv_temporaire("Cannelle,Alimentaire,pot,,,,\n")
        lu = app.lire_inventaire(chemin)[0]
        self.assertIsNone(lu.quantite)
        self.assertEqual(lu.niveau, app.INCONNU)
        self.assertEqual(lu.fournisseur, "—")

    def test_virgule_decimale_acceptee(self):
        chemin = csv_temporaire('Lait coco,Laits & frais,L,"2,5",4,2,Metro\n')
        self.assertEqual(app.lire_inventaire(chemin)[0].quantite, 2.5)

    def test_virgule_dans_le_nom_du_produit(self):
        chemin = csv_temporaire('"Zilia 1,5 L",Eaux,bouteille,6,4,2,Metro\n')
        self.assertEqual(app.lire_inventaire(chemin)[0].nom, "Zilia 1,5 L")

    def test_meme_nom_dans_deux_categories(self):
        chemin = csv_temporaire(
            "Framboise,Sirops Monin,bouteille,6,4,2,Monin\n"
            "Framboise,Sauces sucrées,bouteille,1,4,2,Monin\n"
        )
        produits = app.lire_inventaire(chemin)
        self.assertEqual(len(produits), 2)
        self.assertEqual(produits[0].niveau, app.VERT)
        self.assertEqual(produits[1].niveau, app.ROUGE)

    def test_doublon_dans_la_meme_categorie(self):
        chemin = csv_temporaire(
            "Framboise,Sirops Monin,bouteille,6,4,2,Monin\n"
            "framboise,Sirops Monin,bouteille,1,4,2,Monin\n"
        )
        with self.assertRaisesRegex(app.ErreurInventaire, "déjà présent"):
            app.lire_inventaire(chemin)

    def test_lignes_vides_ignorees(self):
        chemin = csv_temporaire("Lait avoine,Laits & frais,L,18,24,10,Metro\n,,,,,,\n")
        self.assertEqual(len(app.lire_inventaire(chemin)), 1)

    def test_fichier_absent(self):
        with self.assertRaisesRegex(app.ErreurInventaire, "introuvable"):
            app.lire_inventaire(Path("/introuvable/inventaire.csv"))

    def test_colonne_manquante(self):
        chemin = Path(tempfile.mkdtemp()) / "i.csv"
        chemin.write_text("produit,quantite\nSucre,3\n", encoding="utf-8")
        with self.assertRaisesRegex(app.ErreurInventaire, "colonnes manquantes"):
            app.lire_inventaire(chemin)

    def test_quantite_non_numerique(self):
        chemin = csv_temporaire("Sucre,Alimentaire,kg,beaucoup,24,10,Metro\n")
        with self.assertRaisesRegex(app.ErreurInventaire, "n'est pas un nombre"):
            app.lire_inventaire(chemin)

    def test_quantite_negative(self):
        chemin = csv_temporaire("Sucre,Alimentaire,kg,-2,24,10,Metro\n")
        with self.assertRaisesRegex(app.ErreurInventaire, "négative"):
            app.lire_inventaire(chemin)

    def test_seuils_incoherents(self):
        chemin = csv_temporaire("Sucre,Alimentaire,kg,18,4,10,Metro\n")
        with self.assertRaisesRegex(app.ErreurInventaire, "inférieur ou égal"):
            app.lire_inventaire(chemin)

    def test_inventaire_vide(self):
        chemin = csv_temporaire("")
        with self.assertRaisesRegex(app.ErreurInventaire, "aucun produit"):
            app.lire_inventaire(chemin)


class TestInventaireDuBodyClub(unittest.TestCase):
    """Garde-fou sur le vrai fichier livré avec le dépôt."""

    @classmethod
    def setUpClass(cls):
        cls.produits = app.lire_inventaire(
            Path(app.__file__).with_name("inventaire.csv")
        )

    def test_140_references(self):
        self.assertEqual(len(self.produits), 140)

    def test_13_categories(self):
        self.assertEqual(len(app.par_categorie(self.produits)), 13)

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

    def test_chaque_produit_a_une_unite(self):
        self.assertTrue(all(p.unite for p in self.produits))


class TestRendus(unittest.TestCase):
    def setUp(self):
        self.produits = [
            produit(2, nom="Lait avoine", categorie="Laits & frais"),
            produit(5, nom="Sucre"),
            produit(50, nom="Granola"),
            produit(None, nom="Cannelle"),
        ]
        self.groupes = app.grouper(self.produits)
        self.moment = datetime(2026, 8, 28, 15, 0, tzinfo=app.FUSEAU)

    def test_texte_sans_couleur(self):
        rapport = app.rendu_texte(self.groupes, self.moment, couleur=False)
        self.assertNotIn("\033[", rapport)
        self.assertIn("vendredi 28 août 2026, 15h00", rapport)
        self.assertIn("Laits & frais › Lait avoine", rapport)

    def test_texte_avec_couleur(self):
        rapport = app.rendu_texte(self.groupes, self.moment, couleur=True)
        self.assertIn(app.ANSI[app.ROUGE], rapport)

    def test_texte_signale_les_non_renseignes(self):
        rapport = app.rendu_texte(self.groupes, self.moment, couleur=False)
        self.assertIn("Cannelle", rapport)
        self.assertIn("pas encore renseigné", rapport)

    def test_markdown_liste_les_quatre_niveaux(self):
        rapport = app.rendu_markdown(self.groupes, self.moment)
        for niveau in app.NIVEAUX:
            self.assertIn(app.LIBELLES[niveau], rapport)

    def test_html_echappe_les_noms(self):
        groupes = app.grouper([produit(1, nom="Sirop <caramel>")])
        rapport = app.rendu_html(groupes, self.moment)
        self.assertIn("Sirop &lt;caramel&gt;", rapport)
        self.assertNotIn("<caramel>", rapport)

    def test_feuille_de_comptage(self):
        feuille = app.rendu_feuille(self.produits, self.moment)
        self.assertIn("Feuille de comptage", feuille)
        self.assertIn("Laits &amp; frais", feuille)
        self.assertEqual(feuille.count("☐"), len(self.produits))

    def test_format_nombre(self):
        self.assertEqual(app.format_nombre(23.0), "23")
        self.assertEqual(app.format_nombre(2.5), "2,5")


class TestLigneDeCommande(unittest.TestCase):
    def test_ecriture_dans_un_fichier(self):
        sortie = Path(tempfile.mkdtemp()) / "rapport" / "alerte.md"
        code = app.main(["--format", "markdown", "--sortie", str(sortie)])
        self.assertEqual(code, 0)
        self.assertIn("Alerte stock", sortie.read_text(encoding="utf-8"))

    def test_feuille_de_comptage_en_ligne_de_commande(self):
        sortie = Path(tempfile.mkdtemp()) / "comptage.html"
        self.assertEqual(app.main(["--format", "feuille", "--sortie", str(sortie)]), 0)
        self.assertIn("Feuille de comptage", sortie.read_text(encoding="utf-8"))

    def test_code_sortie_rouge(self):
        chemin = csv_temporaire("Lait avoine,Laits & frais,L,1,24,10,Metro\n")
        self.assertEqual(app.main(["--inventaire", str(chemin), "--code-sortie"]), 2)

    def test_code_sortie_orange(self):
        chemin = csv_temporaire("Lait avoine,Laits & frais,L,18,24,10,Metro\n")
        self.assertEqual(app.main(["--inventaire", str(chemin), "--code-sortie"]), 1)

    def test_code_sortie_vert(self):
        chemin = csv_temporaire("Lait avoine,Laits & frais,L,40,24,10,Metro\n")
        self.assertEqual(app.main(["--inventaire", str(chemin), "--code-sortie"]), 0)

    def test_code_sortie_inconnu_ne_declenche_pas_de_commande(self):
        chemin = csv_temporaire("Cannelle,Alimentaire,pot,,,,\n")
        self.assertEqual(app.main(["--inventaire", str(chemin), "--code-sortie"]), 0)

    def test_erreur_inventaire(self):
        self.assertEqual(app.main(["--inventaire", "/introuvable.csv"]), 3)


if __name__ == "__main__":
    unittest.main()
