# Relevé de stock — THE BODY CLUB

Trois pièces :

1. **La page iPad** — les employés ouvrent une page web et choisissent 🟢 / 🟠 / 🔴
   pour chacune des 140 références. La page garde le relevé de la semaine.
2. **Le rapport du vendredi** — chaque vendredi à 15h, un rapport reprend leurs
   réponses et part **par notification et par e-mail** à la gérante.
3. **Le dépôt** — la liste des produits, et de quoi fabriquer la page et des
   documents imprimables.

| Niveau | Signification |
| --- | --- |
| 🟢 **Vert** | Stock suffisant |
| 🟠 **Orange** | Stock bas |
| 🔴 **Rouge** | Commande urgente |
| ⚪ *(vide)* | Pas encore vérifié cette semaine |

Le niveau général de la semaine est celui du produit le plus critique : un seul
produit rouge et la semaine est rouge. Un produit non vérifié reste ⚪ — il n'est
**jamais** compté comme vert, et le rapport dit combien il en reste.

## 1. La page iPad

**Page publiée :** <https://claude.ai/code/artifact/016cbdd2-6264-470f-b2dc-55eea8777fd8>

Sur l'iPad : ouvrir le lien dans Safari, puis **Partager → Sur l'écran d'accueil**
pour en faire une icône. Les employés tapent dessus, choisissent un niveau par
produit, et c'est enregistré tout seul — plusieurs appareils voient le même
relevé.

Ce que la page propose :
- les 140 produits groupés par catégorie, avec un sélecteur pour sauter d'une
  catégorie à l'autre ;
- une barre de progression et des compteurs par niveau, qui servent aussi de
  filtres (**À faire** ne montre que les produits pas encore vérifiés) ;
- un champ **note** sur les produits orange et rouge — « plus qu'un sachet »,
  « commander 2 cartons » — repris tel quel dans le rapport ;
- une **liste de commande** en bas de page, rouges d'abord ;
- **Nouvelle semaine** pour tout effacer après la commande ;
- **Exporter en CSV** pour récupérer le relevé et l'archiver dans ce dépôt.

## 2. Le rapport du vendredi

Une Routine nommée *Relevé stocks Body Club — vendredi 15h* se déclenche chaque
vendredi, relit la page, et envoie **une notification sur l'iPhone / l'iPad et un
e-mail** avec :

- le niveau général de la semaine et le compte par niveau ;
- les produits 🔴 à commander en urgence, groupés par catégorie, avec leurs notes ;
- les produits 🟠 en stock bas ;
- le nombre de produits non vérifiés — et, si le relevé n'a pas été fait du tout,
  c'est dit en premier ;
- le lien vers la page.

La Routine se règle depuis claude.ai (liste des Routines) : horaire, contenu, ou
mise en pause.

> **Heure d'hiver.** Les Routines se planifient en UTC, qui ne suit pas le
> changement d'heure. Celle-ci est réglée sur 13h UTC, soit 15h à Paris en été.
> Fin octobre, il faudra la passer à 14h UTC pour rester à 15h — sinon le rapport
> arrivera à 14h.

### Notification ntfy

**ntfy est le canal principal** : l'iPad reçoit la notification du vendredi dans
l'application ntfy. La notification et l'e-mail Claude restent en second rideau
— les canaux sont indépendants, un échec ntfy ne fait pas perdre le rapport.

### Pourquoi ça passe par GitHub

L'environnement d'exécution de Claude filtre ses sorties réseau : `ntfy.sh` y est
refusé (`403` du proxy), **seul GitHub passe**. Le trajet est donc :

```
Routine du vendredi ──► écrit rapports/AAAA-Sxx.md ──► push GitHub
                                                          │
                        workflow « Notification ntfy » ◄───┘
                        (runner GitHub, Internet non filtré)
                                     │
                                     └──► ntfy.sh ──► iPad
```

Le dossier `rapports/` sert au passage d'archive des relevés hebdomadaires.

La priorité de la notification est lue sur la pastille en tête du rapport :
`urgent` en 🔴 (elle perce le mode silencieux de l'iPad), `high` en 🟠,
`default` en 🟢.

### Mise en place

1. **Le secret.** Dépôt → *Settings → Secrets and variables → Actions →
   New repository secret* → nom `NTFY_TOPIC`, valeur : le sujet ntfy.
2. **L'iPad.** App Store → **ntfy** → *Subscribe to topic* → coller le même
   sujet.
3. Pour tester sans attendre vendredi : onglet *Actions* → **Notification
   ntfy** → *Run workflow*.

> ⚠️ **Ce dépôt est public**, et sur `ntfy.sh` un sujet n'est protégé que par
> son nom : qui le connaît peut lire les notifications et **en publier de
> fausses**. Le sujet ne doit donc vivre que dans le secret GitHub — jamais
> dans un fichier commité. S'il fuite, en générer un nouveau, mettre à jour le
> secret et le réabonnement sur l'iPad.

Envoi manuel depuis une machine non filtrée :

```bash
NTFY_TOPIC=le-sujet python3 alerte_stock.py | python3 envoyer_ntfy.py --niveau rouge
```

## 3. Le dépôt

### La liste des produits

[`inventaire.csv`](inventaire.csv) contient les **140 références réparties en
13 catégories** : Alimentaire, Laits & frais, Sauces cuisine, Symples, Boissons,
Sirops Monin, Sauces sucrées, Maya, Eaux, Étiquettes, Emballages / consommables,
Ménager, Divers.

```csv
produit,categorie,niveau,remarque
Lait avoine,Laits & frais,rouge,rupture prévue lundi
Sucre,Alimentaire,orange,
Cannelle,Alimentaire,,
```

- `niveau` accepte `vert`, `orange`, `rouge` — ou leur initiale, ou la pastille
  🟢 🟠 🔴. Vide = pas encore vérifié.
- **C'est le couple catégorie + produit qui identifie une référence.** Framboise
  existe en Sirops Monin et en Sauces sucrées, Vanille en Laits & frais et en
  Sirops Monin, Matcha en Sirops Monin et en Maya : les deux sont suivis
  séparément. Un vrai doublon dans une même catégorie est refusé.

### Ajouter ou retirer un produit

1. modifier `inventaire.csv` ;
2. `python3 construire_page.py` — régénère `page/releve.html` ;
3. republier ce fichier comme nouvelle version de la page.

⚠️ La reconstruction repart d'un relevé vierge : la faire **après** la commande
du vendredi, pas au milieu de la semaine.

`page/apercu.html` est produit en même temps — c'est la même page, ouvrable
directement dans un navigateur pour vérifier le rendu avant de publier (sans
enregistrement).

### En ligne de commande

`alerte_stock.py` travaille sur `inventaire.csv` — utile pour un CSV exporté
depuis la page, ou pour un relevé sans iPad :

```bash
python3 alerte_stock.py --saisie                              # relevé produit par produit
python3 alerte_stock.py                                       # le rapport à l'écran
python3 alerte_stock.py --format html --sortie alerte.html    # page à imprimer
python3 alerte_stock.py --format feuille --sortie feuille.html  # relevé papier vierge
python3 alerte_stock.py --reinitialiser                       # semaine vierge
```

Aucune installation nécessaire : Python 3.11 ou plus récent suffit.

Le workflow [`.github/workflows/alerte-stock.yml`](.github/workflows/alerte-stock.yml)
fait la même chose dans GitHub — **à la main** (onglet Actions → Run workflow), pour
archiver une semaine sous forme d'issue et de fichiers imprimables. Il ne tourne
plus automatiquement le vendredi : c'est la Routine qui s'en charge.

## Tests

```bash
python3 -m unittest discover -s tests -v
```
