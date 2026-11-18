# Mise en ligne — THE BODY CLUB (Vercel + Neon)

| Service | Rôle |
|---|---|
| **Vercel** | le site et l'administration |
| **Neon** | la base de données PostgreSQL (clientes, cours, réservations, crédits, factures, comptes) |
| **Vercel Blob** | les photos (studio, coachs, logo) |
| **Brevo** | emails (confirmation de compte, mot de passe oublié) et SMS (cours annulé) |
| Stripe | paiement en ligne — étape suivante du projet |

> Le code est dans le dépôt GitHub `paolagraziani2a/stocksbodyclub`, dossier **`plateforme/`**,
> branche **`claude/body-club-booking-platform-ws6cs5`** (la branche par défaut du dépôt est celle de
> l'outil de stock : il faut indiquer ce dossier et cette branche à Vercel).

---

## 1. Créer le projet sur Vercel

1. vercel.com → **Add New → Project** → importer le dépôt `stocksbodyclub`.
2. **Root Directory** : `plateforme` · Framework : Next.js (détecté).
3. Ne pas déployer tout de suite : passer d'abord aux étapes 2 à 4 (sinon le premier déploiement échoue faute de base).

## 2. Ajouter la base Neon (depuis Vercel)

1. Dans le projet Vercel : **Storage → Create Database → Neon** (Postgres serverless).
   - Région : **Frankfurt (eu-central-1)** — la plus proche de la France
   - Vercel ajoute automatiquement `DATABASE_URL` et `DATABASE_URL_UNPOOLED` aux variables du projet.
2. Rien d'autre à faire : **les tables, règles, cartes et cours sont installés automatiquement à chaque
   déploiement** (`npm run vercel-build` applique les migrations manquantes, une seule fois chacune).

## 3. Ajouter le stockage des photos

**Storage → Create Database → Blob** → l'associer au projet : Vercel ajoute `BLOB_READ_WRITE_TOKEN`.

## 4. Variables d'environnement (Settings → Environment Variables)

| Variable | Valeur | Secrète |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://<votre domaine>` (ou l'adresse `….vercel.app` au début) | non |
| `BETTER_AUTH_SECRET` | chaîne aléatoire de 32+ caractères (`openssl rand -base64 32`, ou un générateur de mots de passe) | **oui** |
| `BREVO_API_KEY` | clé API Brevo (emails + SMS) | **oui** |
| `EMAIL_FROM` | adresse d'envoi validée dans Brevo, ex. `bonjour@thebodyclub-portovecchio.com` | non |
| `EMAIL_FROM_NAME` | `The Body Club` | non |
| `SMS_SENDER` | `BodyClub` (11 caractères max) | non |

`DATABASE_URL`, `DATABASE_URL_UNPOOLED` et `BLOB_READ_WRITE_TOKEN` sont ajoutées par Vercel (étapes 2 et 3).

> **Sans Brevo, les clientes ne reçoivent pas l'email de confirmation et ne peuvent pas activer leur
> compte.** Brevo est donc nécessaire avant d'ouvrir les inscriptions (offre gratuite : 300 emails/jour).
> Dans Brevo : valider le domaine d'envoi (enregistrements DNS fournis par Brevo), créer une clé API,
> acheter quelques crédits SMS.

## 5. Déployer

1. **Deployments → Redeploy** (ou Deploy). Le journal affiche `→ 2026…_platform.sql … ok`, etc.
2. **Settings → Git → Production Branch** : `claude/body-club-booking-platform-ws6cs5`.
3. **Settings → Functions → Function Region** : `fra1` (Francfort), à côté de la base Neon.
4. **Settings → Domains** : ajouter votre domaine (ex. `reservation.thebodyclub-portovecchio.com`) et créer
   l'enregistrement DNS indiqué ; reporter l'adresse dans `NEXT_PUBLIC_SITE_URL`, puis redéployer.

## 6. Créer votre compte administrateur

Depuis un ordinateur avec Node.js, dans le dossier `plateforme` :

```bash
npm install
npx vercel link            # relie le dossier au projet Vercel
npx vercel env pull .env.local
npm run admin:create -- votre@email.fr Prénom Nom
```

Un **mot de passe temporaire** s'affiche une seule fois : connectez-vous sur `/connexion`, vous choisirez
alors votre propre mot de passe et arriverez sur `/admin`.

Puis compléter : **Réglages** (raison sociale, adresse, SIRET, n° TVA — obligatoires sur les factures),
**Site internet** (adresse, horaires, photos), **Professeurs**, **Cours proposés**, **Planning**.

## 7. Avant d'ouvrir aux clientes

- [ ] Brevo configuré (emails + SMS) et testé : inscription, mot de passe oublié, annulation d'un cours
- [ ] CGV et politique de confidentialité relues
- [ ] Stripe : paiement en ligne (étape suivante du projet)
- [ ] Sauvegardes : Neon garde un historique de restauration (« point-in-time ») — 1 jour en offre gratuite,
      7 jours ou plus en offre payante ; prévoir en plus un export régulier
- [ ] Import des clientes et crédits depuis bsport

## Coûts

| Service | Offre | Coût |
|---|---|---|
| Vercel | **Hobby : usage non commercial uniquement** | 0 € pour tester ; **Pro ≈ 20 $/mois** pour un site commercial |
| Neon | Free (0,5 Go, mise en veille après inactivité) | 0 € au lancement ; Launch ≈ 19 $/mois si besoin |
| Vercel Blob | Inclus (quelques Go) | 0 € à ce volume |
| Brevo | Emails : 300/jour gratuits · SMS prépayés | ≈ 4 à 5 centimes par SMS en France |
| Stripe | Sans abonnement | ≈ 1,5 % + 0,25 € par paiement par carte européenne |
| Nom de domaine | — | ≈ 10 à 15 € par an |

Tarifs à vérifier au moment de souscrire.

---

## Développement local

```bash
cp .env.example .env.local      # DATABASE_URL vers un PostgreSQL local, BETTER_AUTH_SECRET…
npm install
npm run db:seed                 # migrations + cartes + cours
npm run demo                    # données fictives (base locale uniquement)
npm run dev
```

Sans clé Brevo, les emails sont simulés : le lien (confirmation, mot de passe) s'affiche dans le terminal.
