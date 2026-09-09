# Bot de trading — cinq marchés

[`bot_trading.py`](bot_trading.py) ne traite que **cinq marchés**, et rien
d'autre : un `TESLA.csv` posé dans le dossier des bougies est ignoré.

| Marché | Stratégie | Bougies |
| --- | --- | --- |
| 📈 **S&P 500** | retour à la moyenne | 15 min |
| 📈 **NASDAQ** | retour à la moyenne | 15 min |
| ₿ **Bitcoin** | cassure en momentum | 1 h |
| 🥇 **Or** | suivi de tendance lent | 4 h |
| 🛢 **Pétrole** | suivi de tendance lent | 4 h |

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
  classiques publics, pas un avantage : rejouées sur du passé, elles ne
  prouvent rien sur l'avenir. Le montage décrit sur Instagram promettait des
  résultats ; ce code ne promet que d'appliquer les règles annoncées, ce qui
  est déjà autre chose.

## Ce que le courtier prend

Les frais **sont** simulés, parce qu'un backtest qui les ignore est un rapport
de vacances. Trois postes, appliqués à chaque ordre :

| Poste | Défaut | Pourquoi |
| --- | --- | --- |
| **Écart de cotation** | 0,005 % à 0,03 % selon le marché | On achète au-dessus du prix affiché, on vend en dessous. Le pétrole et le Bitcoin coûtent plus cher à traiter qu'un indice. |
| **Glissement** | 0,01 % | L'exécution n'est jamais tout à fait au prix visé. |
| **Commission** | 0,02 % du notionnel, par côté | Payée à l'entrée **et** à la sortie. |

Ce sont des ordres de grandeur d'un courtier CFD grand public : à remplacer par
ceux du vôtre, dans `DEMI_SPREAD` et `Couts`.

```bash
python3 trading/bot_trading.py --demo                # frais compris
python3 trading/bot_trading.py --demo --sans-frais   # pour mesurer ce qu'ils coûtent
```

Deux conséquences qui ne sautent pas aux yeux :

- **Le stop « dur à 1 %, sans exception » perd plus d'1 %.** On sort au prix
  qu'on obtient, pas à celui qu'on vise, et les deux commissions s'ajoutent :
  chaque stop coûte environ 1,06 %. Systématiquement, pour chaque trade perdant.
- **Et bien davantage sur un trou à l'ouverture.** Si le marché rouvre sous le
  stop — un week-end, une annonce — personne n'a échangé au prix du stop :
  l'ordre part au premier prix coté. Le bot le simule (`prix_sortie_stop`), donc
  la perte peut largement dépasser 1 %. C'est la limite réelle d'un stop, et
  aucun réglage ne la supprime.

Les frais frappent d'autant plus fort qu'on trade souvent : le retour à la
moyenne sur 15 min passe des dizaines d'ordres là où le suivi de tendance sur
4 h en passe un.

> Les données de `--demo` n'ont **aucun trou** : chaque bougie ouvre sur la
> clôture précédente. Le chemin des trous est testé unitairement, mais il ne
> se déclenche que sur de vraies cotations.

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
> même après le filtre anti-bruit. Frais compris, chaque sortie au stop coûte
> en réalité ~1,06 %, et davantage sur un trou à l'ouverture. Un stop calé sur
> l'ATR (1,5 à 2 ATR) résoudrait ça, mais ce ne serait plus la règle annoncée :
> le code applique la règle annoncée, et la signale ici plutôt que de la
> corriger en douce. Le paramètre est `Risque.stop_perte`, si vous voulez
> essayer.

## Les deux messages du jour

```bash
python3 trading/bot_trading.py --demo --rapport matin   # ☀️ les marchés
python3 trading/bot_trading.py --demo --rapport soir    # 🌙 le portefeuille
```

Le message du matin donne, pour chacun des cinq marchés, le prix, la lecture
de sa stratégie (« à −2,3σ de sa moyenne », « vague haussière (+1,1 ATR
d'écart) ») et le signal éventuel. Celui du soir donne le capital, le nombre de
trades, le taux de réussite, le plus fort recul et les derniers trades
refermés. Une Routine peut les envoyer par notification et par e-mail.

## Les bougies

Un fichier CSV par marché dans `trading/marches/`, nommé d'après le code du
marché — `SP500.csv`, `NASDAQ.csv`, `BITCOIN.csv`, `OR.csv`, `PETROLE.csv`. Un
marché sans fichier est simplement absent du rapport.

```csv
horodatage,ouverture,haut,bas,cloture,volume
2026-01-02T14:30:00+00:00,5601.20,5608.75,5598.10,5605.40,128400
2026-01-02T14:45:00+00:00,5605.40,5611.00,5603.25,5604.80,96300
```

L'horodatage est une date ISO 8601 ; sans fuseau, il est lu en UTC. Les
bougies doivent être dans l'ordre chronologique — un désordre est refusé
plutôt que rejoué de travers.

`trading/marches/` est dans le [`.gitignore`](../.gitignore) : les cotations se
retéléchargent, elles peuvent être volumineuses, et elles ne sont pas toujours
redistribuables.

## En ligne de commande

Depuis la racine du dépôt — le script retrouve ses fichiers tout seul, quel que
soit le dossier d'où on l'appelle :

```bash
python3 trading/bot_trading.py --demo                       # backtest sur données de démo
python3 trading/bot_trading.py                              # sur trading/marches/
python3 trading/bot_trading.py --demo --format markdown     # rapport en markdown
python3 trading/bot_trading.py --demo --format html --sortie bot.html
python3 trading/bot_trading.py --demo --journal journal.csv # les trades, pour un tableur
python3 trading/bot_trading.py --demo --capital 25000       # autre capital de départ
python3 trading/bot_trading.py --demo --sans-frais          # sans spread ni commissions
```

Aucune installation nécessaire : Python 3.11 ou plus récent suffit.

Le workflow [`bot-trading.yml`](../.github/workflows/bot-trading.yml) fait la
même chose dans GitHub, **à la main** (onglet Actions → Run workflow). Sans
dossier `trading/marches/`, il tourne sur les données de démonstration et le
dit.

## Tests

```bash
python3 -m unittest discover -s trading/tests -v
```
