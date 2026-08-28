# Alerte de stock — THE BODY CLUB

Chaque **vendredi à 15h (heure de Paris)**, une alerte de stock est générée pour
l'équipe. Chaque produit reçoit un niveau :

| Niveau | Signification | Règle |
| --- | --- | --- |
| 🔴 **Rouge** | Commande urgente | quantité restante **≤ seuil urgent** |
| 🟠 **Orange** | Stock bas | quantité restante **≤ seuil bas** |
| 🟢 **Vert** | Stock suffisant | au-dessus du seuil bas |
| ⚪ **À renseigner** | Niveau inconnu | quantité pas encore comptée, ou seuils pas encore définis |

Le **niveau général** de la semaine est celui du produit le plus critique : un
seul produit rouge et l'alerte de la semaine est rouge. Les produits ⚪ ne
comptent pas dans le niveau général, mais ils sont listés à part : un produit
non compté n'est **jamais** annoncé comme vert.

## L'inventaire

[`inventaire.csv`](inventaire.csv) contient les **140 références réparties en
13 catégories** de la liste produits du Body Club : Alimentaire, Laits & frais,
Sauces cuisine, Symples, Boissons, Sirops Monin, Sauces sucrées, Maya, Eaux,
Étiquettes, Emballages / consommables, Ménager, Divers.

C'est un tableau ouvrable avec Excel, Numbers ou LibreOffice :

```csv
produit,categorie,unite,quantite,seuil_bas,seuil_urgent,fournisseur
Lait avoine,Laits & frais,L,18,24,10,Metro
```

| Colonne | À remplir avec |
| --- | --- |
| `produit` | le nom affiché dans l'alerte |
| `categorie` | une des 13 catégories |
| `unite` | L, kg, bouteille, sachet, pot, pièce, rouleau… |
| `quantite` | ce qu'il reste en réserve au moment du comptage |
| `seuil_bas` | en dessous, le produit passe en 🟠 (≈ une semaine de consommation) |
| `seuil_urgent` | en dessous, le produit passe en 🔴 (le stock ne tient plus) |
| `fournisseur` | chez qui commander |

**Les colonnes `quantite`, `seuil_bas`, `seuil_urgent` et `fournisseur` sont
vides pour l'instant** — la liste produits ne contenait ni quantités ni niveaux.
Tant qu'elles le restent, le produit s'affiche en ⚪. Les `unite` ont été
déduites du type de produit : à corriger là où elles ne collent pas.

Détails utiles :

- les décimales s'écrivent avec une virgule (`2,5`) ou un point (`2.5`) ;
- `seuil_urgent` doit rester ≤ `seuil_bas`, sinon le script signale la ligne ;
- **c'est le couple catégorie + produit qui identifie une référence.** Framboise
  existe en Sirops Monin et en Sauces sucrées, Vanille en Laits & frais et en
  Sirops Monin, Matcha en Sirops Monin et en Maya : les deux sont bien suivis
  séparément. Un vrai doublon dans une même catégorie est refusé.

## Par où commencer

1. **Imprimer la feuille de comptage** — une page par catégorie, avec une case à
   cocher et une colonne pour écrire la quantité :

   ```bash
   python3 alerte_stock.py --format feuille --sortie comptage.html
   ```

2. **Faire le tour de la réserve** et noter les quantités.
3. **Reporter les chiffres** dans la colonne `quantite` d'`inventaire.csv`.
4. **Fixer les seuils** au fur et à mesure : `seuil_bas` ≈ la consommation d'une
   semaine, `seuil_urgent` le point où le stock ne tient plus jusqu'à la
   livraison. Chaque ligne complétée sort du ⚪ et bascule en 🟢 / 🟠 / 🔴.

Rien n'oblige à tout remplir d'un coup : le rapport fonctionne dès la première
ligne renseignée et indique combien de produits restent à traiter.

## Lancer l'alerte à la main

```bash
python3 alerte_stock.py                                       # à l'écran, en couleurs
python3 alerte_stock.py --format markdown --sortie alerte.md
python3 alerte_stock.py --format html --sortie alerte.html    # page à imprimer
python3 alerte_stock.py --format feuille --sortie comptage.html
```

Aucune installation nécessaire : Python 3.11 ou plus récent suffit.

| Option | Effet |
| --- | --- |
| `--inventaire CHEMIN` | utiliser un autre fichier que `inventaire.csv` |
| `--format texte\|markdown\|html\|feuille` | rapport, ou feuille de comptage vierge |
| `--sortie CHEMIN` | écrire dans un fichier au lieu de l'écran |
| `--code-sortie` | renvoyer `2` si rouge, `1` si orange, `0` sinon |

## L'envoi automatique du vendredi

Le workflow [`.github/workflows/alerte-stock.yml`](.github/workflows/alerte-stock.yml)
tourne chaque vendredi à 15h, heure de Paris. Il :

1. génère le rapport en Markdown et en HTML, plus la feuille de comptage de la
   semaine suivante ;
2. affiche le rapport dans le résumé de l'exécution et joint les trois fichiers
   (téléchargeables pendant 30 jours) ;
3. **ouvre une issue GitHub** — titrée 🔴 ou 🟠 — uniquement s'il y a quelque
   chose à commander. Les semaines tout-vert ne créent pas d'issue, pour éviter
   les notifications inutiles.

Les personnes qui doivent recevoir l'alerte s'abonnent au dépôt (bouton
**Watch → Issues**) : elles sont prévenues par e-mail à chaque commande à passer.

GitHub planifie ses tâches en UTC, qui ne suit pas l'heure d'été. Le workflow se
déclenche donc à 13h **et** 14h UTC, et une première étape annule le
déclenchement qui ne correspond pas à 15h à Paris — l'alerte tombe à la bonne
heure toute l'année.

Pour un essai immédiat sans attendre vendredi : onglet **Actions → Alerte stock
du vendredi → Run workflow**.

## Tests

```bash
python3 -m unittest discover -s tests -v
```
