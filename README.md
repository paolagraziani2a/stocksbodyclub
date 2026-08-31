# Relevé de stock — THE BODY CLUB

> Ce dépôt contient deux bots sans rapport l'un avec l'autre : l'alerte de
> stock du café, décrite ici, et un [**bot de trading**](#le-deuxième-bot--trading)
> qui ne traite que cinq marchés.

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

---

# Le deuxième bot — trading

[`bot_trading.py`](bot_trading.py) n'a rien à voir avec le café : c'est le
deuxième bot du dépôt, et il ne traite que **cinq marchés**.

| Marché | Stratégie | Bougies |
| --- | --- | --- |
| 📈 **S&P 500** | retour à la moyenne | 15 min |
| 📈 **NASDAQ** | retour à la moyenne | 15 min |
| ₿ **Bitcoin** | cassure en momentum | 1 h |
| 🥇 **Or** | suivi de tendance lent | 4 h |
| 🛢 **Pétrole** | suivi de tendance lent | 4 h |

Rien d'autre n'est traité : un `TESLA.csv` posé dans le dossier des bougies
est ignoré.

## ⚠️ Ce que ce bot ne fait pas

**Il ne passe aucun ordre réel.** Il lit des bougies, décide, et tient un
portefeuille *simulé*. Aucun courtier n'est branché, aucun identifiant n'est
demandé : brancher une exécution réelle demanderait un adaptateur que ce
fichier n'a volontairement pas.

Deux choses à savoir avant d'aller plus loin :

- **Les données de démonstration sont tirées au sort.** `--demo` fabrique des
  bougies au hasard pour vérifier que le moteur tourne. Elles ne disent
  **rien** de la rentabilité des stratégies, et chaque rapport produit à
  partir d'elles porte un avertissement en tête.
- **Un backtest n'est pas un résultat.** Ces trois stratégies sont des
  classiques publics, pas un avantage : rejouées sur du passé elles ne
  prouvent rien sur l'avenir, et les frais, l'écart de cotation et les
  glissements d'exécution ne sont pas simulés ici. Le montage décrit sur
  Instagram promettait des résultats ; ce code ne promet que d'appliquer les
  règles annoncées, ce qui est déjà autre chose.

## Les trois stratégies

**Retour à la moyenne** (S&P 500, NASDAQ) — quand la clôture s'écarte de plus
de 2 écarts-types de sa moyenne mobile 20, le bot prend le retour vers cette
moyenne, et ressort quand elle est retrouvée. Il **s'abstient dès que le
marché tend** : c'est en marché sans direction que les petites occasions se
répètent, et une tendance écrase cette stratégie.

**Cassure en momentum** (Bitcoin) — le bot attend que le prix traverse le
sommet (ou le creux) des 20 dernières heures **avec au moins 1,5 fois le
volume moyen**. C'est la condition de volume qui sépare la vraie cassure du
faux signal : sans elle, une sortie de canal est le plus souvent un piège. Il
ressort quand le prix repasse sous sa moyenne 10.

**Suivi de tendance lent** (Or, Pétrole) — les matières premières avancent par
vagues plus propres que les indices, donc la stratégie est **délibérément
lente** : moyenne 20 contre moyenne 80, confirmée par un nouveau sommet sur
30 périodes. Et surtout, elle refuse toute entrée marginale — c'est le
« pas de bruit à l'entrée » de la source, traduit en deux filtres mesurés en
ATR, donc à l'échelle du marché plutôt qu'en pourcentage arbitraire :

- les deux moyennes doivent être séparées d'au moins 0,5 ATR — un croisement
  de justesse va et vient au gré du bruit, ce n'est pas une vague ;
- la clôture doit dépasser l'extrême précédent de 0,25 ATR, pas l'effleurer.

La sortie, elle, reste sur le simple croisement inverse : lent à entrer,
prompt à partir.

> Ces deux filtres ne sont pas cosmétiques. Sur les données de démonstration
> ils font passer l'or et le pétrole de 20 trades à 4 — le pétrole, en
> particulier, de 13 entrées toutes perdantes à une seule. C'est exactement ce
> qu'un filtre anti-bruit doit faire : ne rien prendre plutôt que prendre du
> bruit.

## Les garde-fous

Appliqués à *chaque* trade, sans exception :

1. **Stop de perte dur à 1 %** du prix d'entrée. Il se juge sur la mèche, pas
   sur la clôture : un bas de bougie qui touche le stop sort la position même
   si le prix remonte ensuite.
2. **Taille ajustée à la volatilité.** Chaque trade risque 0,25 % du capital
   si le stop tombe ; au-delà de la volatilité cible (ATR d'1 % du prix), la
   position est réduite d'autant — deux fois plus agité, deux fois plus petit.
   Un plafond d'exposition de 25 % du capital reste en dernier recours, et
   trois positions ouvertes au maximum.
3. **Filtre de corrélation.** Jamais deux positions de même sens dans un même
   groupe : être long du S&P 500 *et* du NASDAQ, c'est le même pari pris deux
   fois — et le stop de 1 % se paie deux fois aussi. L'or et le pétrole sont
   dans des groupes séparés : ce sont deux matières premières, mais elles ne
   montent pas ensemble.

Le rapport indique combien d'entrées le filtre a refusées.

> **Une tension à connaître, dans la source elle-même.** Le stop dur à 1 %
> s'applique « sans exception », y compris à l'or et au pétrole — mais sur des
> bougies de 4 h, 1 % est plus étroit que le va-et-vient normal du marché. Le
> bot se fait donc sortir de vagues qui, sur le fond, allaient dans son sens :
> les deux marchés lents restent perdants sur les données de démonstration
> même après le filtre anti-bruit. Un stop calé sur l'ATR (1,5 à 2 ATR, par
> exemple) résoudrait ça, mais ce ne serait plus la règle annoncée : le code
> applique la règle annoncée, et la signale ici plutôt que de la corriger en
> douce. Le paramètre est `Risque.stop_perte`, si vous voulez essayer.

## Les deux messages du jour

```bash
python3 bot_trading.py --demo --rapport matin   # ☀️ ce qui se passe sur les marchés
python3 bot_trading.py --demo --rapport soir    # 🌙 où en est le portefeuille
```

Le message du matin donne, pour chacun des cinq marchés, le prix, la lecture
de sa stratégie (« à −2,3σ de sa moyenne », « tendance haussière ») et le
signal éventuel. Celui du soir donne le capital, le nombre de trades, le taux
de réussite, le plus fort recul et les derniers trades refermés. Comme pour
l'alerte stock, une Routine peut les envoyer par notification et par e-mail.

## Les bougies

Un fichier CSV par marché dans `marches/`, nommé d'après le code du marché —
`marches/SP500.csv`, `marches/BITCOIN.csv`, `marches/OR.csv`… Un marché sans
fichier est simplement absent du rapport.

```csv
horodatage,ouverture,haut,bas,cloture,volume
2026-01-02T14:30:00+00:00,5601.20,5608.75,5598.10,5605.40,128400
2026-01-02T14:45:00+00:00,5605.40,5611.00,5603.25,5604.80,96300
```

L'horodatage est une date ISO 8601 ; sans fuseau, il est lu en UTC. Les
bougies doivent être dans l'ordre chronologique — un désordre est refusé
plutôt que rejoué de travers.

`marches/` est dans le [`.gitignore`](.gitignore) : les cotations se
retéléchargent, elles peuvent être volumineuses, et elles ne sont pas toujours
redistribuables.

## En ligne de commande

```bash
python3 bot_trading.py --demo                            # backtest sur données de démo
python3 bot_trading.py --marches marches                 # sur de vraies bougies
python3 bot_trading.py --demo --format markdown          # rapport en markdown
python3 bot_trading.py --demo --format html --sortie bot.html
python3 bot_trading.py --demo --journal journal.csv      # les trades, pour un tableur
python3 bot_trading.py --demo --capital 25000            # autre capital de départ
```

Aucune installation nécessaire : Python 3.11 ou plus récent suffit, comme pour
le reste du dépôt.

Le workflow [`.github/workflows/bot-trading.yml`](.github/workflows/bot-trading.yml)
fait la même chose dans GitHub, **à la main** (onglet Actions → Run workflow).
Sans dossier `marches/`, il tourne sur les données de démonstration et le dit.

---

## Tests

```bash
python3 -m unittest discover -s tests -v
```

Les deux bots sont testés ensemble : `tests/test_alerte_stock.py` pour
l'alerte stock, `tests/test_bot_trading.py` pour le bot de trading.
