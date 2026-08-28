# Alerte de stock du café

Chaque **vendredi à 15h (heure de Paris)**, une alerte de stock est générée pour
les employés du café. Chaque produit reçoit un niveau :

| Niveau | Signification | Règle |
| --- | --- | --- |
| 🔴 **Rouge** | Commande urgente | quantité restante **≤ seuil urgent** |
| 🟠 **Orange** | Stock bas | quantité restante **≤ seuil bas** |
| 🟢 **Vert** | Stock suffisant | au-dessus du seuil bas |

Le **niveau général** de l'alerte est celui du produit le plus critique : s'il y a
un seul produit rouge, l'alerte de la semaine est rouge.

## Tenir l'inventaire à jour

Tout se règle dans [`inventaire.csv`](inventaire.csv), un tableau ouvrable avec
Excel, Numbers ou LibreOffice :

```csv
produit,categorie,unite,quantite,seuil_bas,seuil_urgent,fournisseur
Lait entier,Boissons,L,18,24,10,Metro
```

| Colonne | À remplir avec |
| --- | --- |
| `produit` | le nom affiché dans l'alerte |
| `categorie` | Boissons, Snacking, Épicerie, Consommables, Entretien… |
| `unite` | kg, L, pièce, boîte, paquet… |
| `quantite` | ce qu'il reste en réserve au moment du comptage |
| `seuil_bas` | en dessous, le produit passe en 🟠 (≈ une semaine de consommation) |
| `seuil_urgent` | en dessous, le produit passe en 🔴 (le stock ne tient plus) |
| `fournisseur` | chez qui commander |

Les décimales s'écrivent avec une virgule (`2,5`) ou un point (`2.5`).
`seuil_urgent` doit rester inférieur ou égal à `seuil_bas`, sinon le script
signale la ligne fautive.

## Lancer l'alerte à la main

```bash
python3 alerte_stock.py                                  # à l'écran, en couleurs
python3 alerte_stock.py --format markdown --sortie alerte.md
python3 alerte_stock.py --format html --sortie alerte.html   # page à imprimer
```

Aucune installation n'est nécessaire : Python 3.11 ou plus récent suffit.

| Option | Effet |
| --- | --- |
| `--inventaire CHEMIN` | utiliser un autre fichier que `inventaire.csv` |
| `--format texte\|markdown\|html` | format du rapport (défaut : `texte`) |
| `--sortie CHEMIN` | écrire dans un fichier au lieu de l'écran |
| `--code-sortie` | renvoyer `2` si rouge, `1` si orange, `0` si vert |

Le format `html` produit une page A4 à imprimer et à afficher en réserve ou en
salle de pause.

## L'envoi automatique du vendredi

Le workflow [`.github/workflows/alerte-stock.yml`](.github/workflows/alerte-stock.yml)
tourne chaque vendredi à 15h, heure de Paris. Il :

1. génère le rapport en Markdown et en HTML ;
2. l'affiche dans le résumé de l'exécution et le joint en pièce jointe
   (téléchargeable pendant 30 jours) ;
3. **ouvre une issue GitHub** — titrée 🔴 ou 🟠 — uniquement s'il y a quelque
   chose à commander. Les semaines tout-vert ne créent pas d'issue, pour éviter
   les notifications inutiles.

Les personnes qui doivent recevoir l'alerte n'ont qu'à s'abonner au dépôt
(bouton **Watch → Issues**) : elles seront prévenues par e-mail à chaque
commande à passer.

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
