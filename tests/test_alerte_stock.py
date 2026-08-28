"""Tests de l'alerte de stock : python3 -m unittest discover tests"""

import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import alerte_stock as app  # noqa: E402

EN_TETES = "produit,categorie,unite,quantite,seuil_bas,seuil_urgent,fournisseur\n"


def produit(quantite, seuil_bas=10, seuil_urgent=4, nom="Café"):
    return app.Produit(
        nom=nom,
        categorie="Boissons",
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


class TestNiveauGlobal(unittest.TestCase):
    def test_rouge_prime_sur_orange(self):
        groupes = app.grouper([produit(2), produit(5, nom="Lait"), produit(50, nom="Thé")])
        self.assertEqual(app.niveau_global(groupes), app.ROUGE)

    def test_orange_prime_sur_vert(self):
        groupes = app.grouper([produit(5), produit(50, nom="Thé")])
        self.assertEqual(app.niveau_global(groupes), app.ORANGE)

    def test_vert_si_tout_va_bien(self):
        self.assertEqual(app.niveau_global(app.grouper([produit(50)])), app.VERT)

    def test_tri_du_plus_manquant_au_moins_manquant(self):
        groupes = app.grouper([produit(9, nom="Sucre"), produit(1, nom="Lait")])
        self.assertEqual([p.nom for p in groupes[app.ORANGE]], ["Sucre"])
        self.assertEqual([p.nom for p in groupes[app.ROUGE]], ["Lait"])


class TestLectureInventaire(unittest.TestCase):
    def test_lecture_nominale(self):
        chemin = csv_temporaire("Lait,Boissons,L,18,24,10,Metro\n")
        produits = app.lire_inventaire(chemin)
        self.assertEqual(len(produits), 1)
        self.assertEqual(produits[0].nom, "Lait")
        self.assertEqual(produits[0].niveau, app.ORANGE)

    def test_virgule_decimale_acceptee(self):
        chemin = csv_temporaire("Lait,Boissons,L,\"2,5\",4,2,Metro\n")
        self.assertEqual(app.lire_inventaire(chemin)[0].quantite, 2.5)

    def test_lignes_vides_ignorees(self):
        chemin = csv_temporaire("Lait,Boissons,L,18,24,10,Metro\n,,,,,,\n")
        self.assertEqual(len(app.lire_inventaire(chemin)), 1)

    def test_inventaire_reel_du_depot(self):
        produits = app.lire_inventaire(Path(app.__file__).with_name("inventaire.csv"))
        self.assertGreater(len(produits), 0)

    def test_fichier_absent(self):
        with self.assertRaisesRegex(app.ErreurInventaire, "introuvable"):
            app.lire_inventaire(Path("/introuvable/inventaire.csv"))

    def test_colonne_manquante(self):
        chemin = Path(tempfile.mkdtemp()) / "i.csv"
        chemin.write_text("produit,quantite\nLait,3\n", encoding="utf-8")
        with self.assertRaisesRegex(app.ErreurInventaire, "colonnes manquantes"):
            app.lire_inventaire(chemin)

    def test_quantite_non_numerique(self):
        chemin = csv_temporaire("Lait,Boissons,L,beaucoup,24,10,Metro\n")
        with self.assertRaisesRegex(app.ErreurInventaire, "n'est pas un nombre"):
            app.lire_inventaire(chemin)

    def test_quantite_negative(self):
        chemin = csv_temporaire("Lait,Boissons,L,-2,24,10,Metro\n")
        with self.assertRaisesRegex(app.ErreurInventaire, "négative"):
            app.lire_inventaire(chemin)

    def test_seuils_incoherents(self):
        chemin = csv_temporaire("Lait,Boissons,L,18,4,10,Metro\n")
        with self.assertRaisesRegex(app.ErreurInventaire, "inférieur ou égal"):
            app.lire_inventaire(chemin)

    def test_inventaire_vide(self):
        chemin = csv_temporaire("")
        with self.assertRaisesRegex(app.ErreurInventaire, "aucun produit"):
            app.lire_inventaire(chemin)


class TestRendus(unittest.TestCase):
    def setUp(self):
        self.groupes = app.grouper(
            [produit(2, nom="Lait"), produit(5, nom="Sucre"), produit(50, nom="Thé")]
        )
        self.moment = datetime(2026, 8, 28, 15, 0, tzinfo=app.FUSEAU)

    def test_texte_sans_couleur(self):
        rapport = app.rendu_texte(self.groupes, self.moment, couleur=False)
        self.assertNotIn("\033[", rapport)
        self.assertIn("vendredi 28 août 2026, 15h00", rapport)
        self.assertIn("Lait", rapport)

    def test_texte_avec_couleur(self):
        rapport = app.rendu_texte(self.groupes, self.moment, couleur=True)
        self.assertIn(app.ANSI[app.ROUGE], rapport)

    def test_markdown_liste_les_trois_niveaux(self):
        rapport = app.rendu_markdown(self.groupes, self.moment)
        for niveau in app.NIVEAUX:
            self.assertIn(app.LIBELLES[niveau], rapport)

    def test_html_echappe_les_noms(self):
        groupes = app.grouper([produit(1, nom="Sirop <caramel>")])
        rapport = app.rendu_html(groupes, self.moment)
        self.assertIn("Sirop &lt;caramel&gt;", rapport)
        self.assertNotIn("<caramel>", rapport)

    def test_format_nombre(self):
        self.assertEqual(app.format_nombre(23.0), "23")
        self.assertEqual(app.format_nombre(2.5), "2,5")


class TestLigneDeCommande(unittest.TestCase):
    def test_ecriture_dans_un_fichier(self):
        sortie = Path(tempfile.mkdtemp()) / "rapport" / "alerte.md"
        code = app.main(["--format", "markdown", "--sortie", str(sortie)])
        self.assertEqual(code, 0)
        self.assertIn("Alerte stock", sortie.read_text(encoding="utf-8"))

    def test_code_sortie_rouge(self):
        chemin = csv_temporaire("Lait,Boissons,L,1,24,10,Metro\n")
        code = app.main(["--inventaire", str(chemin), "--code-sortie"])
        self.assertEqual(code, 2)

    def test_code_sortie_orange(self):
        chemin = csv_temporaire("Lait,Boissons,L,18,24,10,Metro\n")
        code = app.main(["--inventaire", str(chemin), "--code-sortie"])
        self.assertEqual(code, 1)

    def test_code_sortie_vert(self):
        chemin = csv_temporaire("Lait,Boissons,L,40,24,10,Metro\n")
        code = app.main(["--inventaire", str(chemin), "--code-sortie"])
        self.assertEqual(code, 0)

    def test_erreur_inventaire(self):
        code = app.main(["--inventaire", "/introuvable.csv"])
        self.assertEqual(code, 3)


if __name__ == "__main__":
    unittest.main()
