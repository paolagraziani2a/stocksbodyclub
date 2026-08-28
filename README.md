# Alerte de stock — THE BODY CLUB

Chaque semaine, l'employé passe les produits en revue et choisit **un niveau par
produit**. Le vendredi à **15h (heure de Paris)**, l'alerte part automatiquement.

| Niveau | Signification |
| --- | --- |
| 🟢 **Vert** | Stock suffisant |
| 🟠 **Orange** | Stock bas |
| 🔴 **Rouge** | Commande urgente |
| ⚪ *(vide)* | Pas encore vérifié cette semaine |

Le **niveau général** de la semaine est celui du produit le plus critique : un
seul produit rouge et l'alerte de la semaine est rouge. Les produits ⚪ ne
comptent pas dans le niveau général, mais ils sont listés à part : un produit
non vérifié n'est **jamais** annoncé comme vert.

## L'employé fait le relevé

```bash
python3 alerte_stock.py --saisie
```

Le script déroule les 140 produits, catégorie par catégorie :

```
— Sirops Monin —
[57/140] Framboise (⚪ pas encore vérifié) > o
[58/140] Fraise (⚪ pas encore vérifié) > v
```

| Touche | Effet |
| --- | --- |
| `v` | 🟢 vert — stock suffisant |
| `o` | 🟠 orange — stock bas |
| `r` | 🔴 rouge — commande urgente |
| *Entrée* | garder le niveau actuel et passer au suivant |
| `x` | effacer le niveau (repasse en ⚪) |
| `p` | passer toute la catégorie |
| `q` | enregistrer et quitter |

Tout est enregistré dans `inventaire.csv` au fur et à mesure de la sortie : on
peut s'arrêter avec `q` et reprendre plus tard, le travail déjà fait est gardé.

**Sans ordinateur en réserve ?** Imprimer la feuille de relevé — une page par
catégorie, trois cases à cocher par produit — puis reporter les réponses ensuite :

```bash
python3 alerte_stock.py --format feuille --sortie feuille.html
```

## Voir l'alerte

```bash
python3 alerte_stock.py                                       # à l'écran, en couleurs
python3 alerte_stock.py --format html --sortie alerte.html    # page à imprimer
python3 alerte_stock.py --format markdown --sortie alerte.md
```

Aucune installation nécessaire : Python 3.11 ou plus récent suffit.

| Option | Effet |
| --- | --- |
| `--saisie` | le relevé produit par produit |
| `--reinitialiser` | effacer tous les niveaux pour repartir d'une semaine vierge |
| `--inventaire CHEMIN` | utiliser un autre fichier que `inventaire.csv` |
| `--format texte\|markdown\|html\|feuille` | rapport, ou feuille de relevé vierge |
| `--sortie CHEMIN` | écrire dans un fichier au lieu de l'écran |
| `--code-sortie` | renvoyer `2` si rouge, `1` si orange, `0` sinon |

## La liste des produits

[`inventaire.csv`](inventaire.csv) contient les **140 références réparties en
13 catégories** de la liste produits du Body Club : Alimentaire, Laits & frais,
Sauces cuisine, Symples, Boissons, Sirops Monin, Sauces sucrées, Maya, Eaux,
Étiquettes, Emballages / consommables, Ménager, Divers.

Quatre colonnes seulement, ouvrables avec Excel, Numbers ou LibreOffice :

```csv
produit,categorie,niveau,remarque
Lait avoine,Laits & frais,rouge,rupture prévue lundi
Sucre,Alimentaire,orange,
Granola,Alimentaire,vert,
Cannelle,Alimentaire,,
```

- `niveau` accepte `vert`, `orange`, `rouge` — ou leur initiale, ou la pastille
  🟢 🟠 🔴. Vide = pas encore vérifié.
- `remarque` est facultative : elle apparaît dans l'alerte à côté du produit
  (« rupture prévue lundi », « commander 2 cartons »…).
- **C'est le couple catégorie + produit qui identifie une référence.** Framboise
  existe en Sirops Monin et en Sauces sucrées, Vanille en Laits & frais et en
  Sirops Monin, Matcha en Sirops Monin et en Maya : les deux sont bien suivis
  séparément. Un vrai doublon dans une même catégorie est refusé.

Pour ajouter ou retirer un produit, il suffit d'ajouter ou de retirer une ligne.

## L'envoi automatique du vendredi

Le workflow [`.github/workflows/alerte-stock.yml`](.github/workflows/alerte-stock.yml)
tourne chaque vendredi à 15h, heure de Paris. Il :

1. génère l'alerte à partir des niveaux choisis dans la semaine, en Markdown et
   en HTML, plus la feuille de relevé vierge de la semaine suivante ;
2. affiche l'alerte dans le résumé de l'exécution et joint les trois fichiers
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

## Après l'alerte

Une fois la commande passée, remettre les compteurs à zéro pour la semaine
suivante :

```bash
python3 alerte_stock.py --reinitialiser
```

## Tests

```bash
python3 -m unittest discover -s tests -v
```
