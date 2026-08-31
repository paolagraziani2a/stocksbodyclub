# Deux projets, sans rapport l'un avec l'autre

Ce dépôt en héberge deux. Ils ne partagent aucun code, aucune donnée et aucun
fichier : chacun vit dans son dossier, avec son README, ses tests et son
workflow.

| Dossier | Projet | |
| --- | --- | --- |
| [`cafe/`](cafe/) | **Alerte de stock — THE BODY CLUB** | Les employés relèvent les stocks sur un iPad, la gérante reçoit un rapport le vendredi. En service. |
| [`trading/`](trading/) | **Bot de trading** | Cinq marchés — S&P 500, NASDAQ, Bitcoin, or, pétrole. Portefeuille simulé, aucun ordre réel. |

```bash
python3 -m unittest discover -s cafe/tests -v       # les tests du café
python3 -m unittest discover -s trading/tests -v    # les tests du bot de trading
```

Python 3.11 ou plus récent, sans rien à installer, pour l'un comme pour
l'autre.
