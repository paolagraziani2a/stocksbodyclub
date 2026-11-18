# THE BODY CLUB — Plateforme de réservation

Alternative privée à bsport : planning, réservations, cartes de cours, paiements
Stripe, professeurs et tableau de bord, pour le studio de Lagree The Body Club.

**Stack** : Next.js 16 (App Router, TypeScript) · Tailwind CSS · **Neon** (PostgreSQL, RLS) ·
**Better Auth** (comptes email + mot de passe) · Vercel Blob (photos) · Brevo (emails, SMS) ·
Stripe Checkout + webhooks · hébergement **Vercel**. Mise en ligne : voir [DEPLOIEMENT.md](DEPLOIEMENT.md).

## Règles du studio (validées)

| Règle | Valeur | Où la changer |
|---|---|---|
| Annulation gratuite | jusqu'à **12 h** avant le cours | `studio_settings.cancel_window_hours` |
| Annulation tardive / absence | crédit perdu, place libérée | — |
| Début de validité d'une carte | au moment où la cliente **fait** sa 1ʳᵉ réservation | — |
| 1ʳᵉ réservation annulée | la carte **reste activée** | — |
| Cours après la date d'expiration | autorisé si réservé avant l'expiration | — |
| Fin de validité | minuit (Paris) le lendemain de la date anniversaire | `compute_expiry()` |
| Liste d'attente | notification simple, la première qui réserve a la place | `studio_settings.waitlist_enabled` |
| Prix | TTC, TVA 20 % | `products`, `studio_settings.vat_rate` |
| Rémunération des professeurs | 40 % de la valeur **HT** des cours ; Pao : 0 % (le studio garde 100 %) | Admin → Professeurs / Réglages |
| Carte offerte ou remisée | le professeur est payé sur le **prix public** | `passes.pay_unit_value_cents` |
| Abonnement illimité | 280 € / mois, valable dès le paiement ; 1 cours = 25 € (CA et rémunération) | `products.class_value_cents` |
| Illimité : annulations tardives | 2 d'affilée maximum, la 3ᵉ est refusée ; un cours suivi remet à zéro | Admin → Réglages |
| Factures | émises automatiquement, numérotation continue F2026-00001 ; avoirs A2026-00001 | Admin → Réglages (mentions) |

| Carte | Prix TTC | Prix / cours | Validité |
|---|---|---|---|
| 1 cours | 35 € | 35 € | 1 mois |
| 3 cours | 99 € | 33 € | 1 mois |
| 5 cours | 150 € | 30 € | 1 mois |
| 10 cours | 250 € | 25 € | 2 mois |
| Illimité | 280 € | — | 1 mois (dès le paiement) |

## Architecture

```
Navigateur / PWA ──► Next.js (Server Components, Server Actions, /api/stripe/webhook, /api/cron)
                         │
                         ▼
                   PostgreSQL (Neon) — le serveur endosse le rôle de la personne connectée
                   ├─ RLS : chacune ne lit que ses données
                   └─ Fonctions transactionnelles : seule voie d'écriture
                      book_session · cancel_booking · process_checkout_completed · process_refund
                      expire_passes · admin_* · join_waitlist · set_attendance
```

**Toutes les règles critiques vivent dans PostgreSQL** (`db/migrations/`) :

- une réservation = une transaction : verrou du cours → verrou de la cliente →
  choix de la carte → débit → historique → place occupée ;
- index unique partiel : une seule réservation active par cliente et par cours ;
- contrainte `booked_count <= capacity` : surréservation impossible, même en cas de bug applicatif ;
- `credit_ledger` en ajout seul (trigger) : historique fiable de chaque crédit ;
- webhooks Stripe idempotents (`stripe_events`, `orders.stripe_checkout_session_id` unique, `passes.order_id` unique).

### Choix de la carte débitée

1. carte déjà activée, non expirée, avec crédits — celle qui expire **le plus tôt** ;
2. sinon la plus ancienne carte non activée (sa validité démarre alors) ;
3. sinon : `NO_CREDITS` → proposition d'achat.

### Chiffre d'affaires (sans double comptage)

- **Encaissé** = paiements Stripe (`orders.amount_total_cents`), moins remboursements, frais Stripe à part.
- **Valeur consommée** = crédits utilisés × `passes.unit_value_cents` (prix payé ÷ crédits, remise incluse).
  Sert à la rémunération des professeurs ; jamais additionnée à l'encaissé.

## Structure

```
db/
  migrations/   socle (rôles, comptes), schéma, fonctions métier, sécurité (RLS + droits)
  seed.sql      cartes, cours proposés
scripts/        migrate.mjs (migrations), create-admin.mjs, demo-data.mjs
src/
  app/          pages (App Router) ; api/auth : liens reçus par email
  lib/          db.ts (transactions par rôle), auth-server.ts (Better Auth), email, SMS, stockage
  proxy.ts      protection /compte /admin /prof
tests/db/       tests des règles critiques contre une vraie base PostgreSQL
```

## Développement

```bash
cp .env.example .env.local     # puis remplir
npm install
npm run dev
```

### Base locale et données de démonstration

```bash
npm run db:seed             # migrations + cartes + cours (DATABASE_URL de .env.local)
npm run demo                # admin pao@bodyclub.test / bodyclub2026 (base locale uniquement)
npm run dev                 # http://localhost:3000/admin
```

### SMS (Brevo)

Ajouter `BREVO_API_KEY` (et éventuellement `SMS_SENDER`, 11 caractères max, par défaut « BodyClub »)
dans les variables d'environnement du serveur. Sans clé, aucun SMS n'est envoyé : chaque message est
journalisé avec le statut « simulé » (visible sur la page du cours dans l'admin).

### Tests

Les tests de base de données ont besoin d'un PostgreSQL 16 local
(`TEST_DATABASE_ADMIN_URL`, par défaut `postgres://postgres:postgres@localhost:5432/postgres`).
Ils créent une base `bodyclub_test` neuve et y appliquent les migrations.

```bash
npm test            # tout
npm run test:db     # règles critiques (réservation, crédits, Stripe, RLS…)
npm run test:unit
npm run lint && npm run typecheck && npm run build
```

La CI GitHub Actions (`.github/workflows/plateforme.yml`) exécute tout cela à chaque push.

## Avancement

- [x] Lot 0 — projet, CI, design de base
- [x] Lot 1 — schéma, RLS, fonctions métier, 46 tests SQL
- [ ] Lot 2 — authentification, planning, réservation / annulation, espace cliente
- [ ] Lot 3 — Stripe Checkout (test), webhook, codes promo, remboursements
- [x] Administration : tableau de bord (CA jour/semaine/mois/période, meilleures clientes, rémunération par coach),
      planning (création rapide, professeur, séries, duplication de semaine, présences, annulation),
      paiements & factures (liens Stripe, export CSV), professeurs, apparence du site, réglages
- [x] Factures et avoirs, abonnement illimité, cartes offertes, 73 tests
- [x] Site client : accueil (photos du studio, méthode, coachs, tarifs, infos pratiques, itinéraire),
      pages « Les coachs » et profil de chaque coach (photo, présentation, spécialités, prochains cours),
      tarifs, planning public avec places restantes ; profils et galerie modifiables depuis l'admin
- [x] Identité visuelle du club (thebodyclub-portovecchio.com) : Big Shoulders, Instrument Serif, Geist, crème / encre / sauge
- [x] Comptes clientes : inscription (email + mot de passe + mobile), connexion, mot de passe oublié par email,
      espace « Mon compte » (solde, cours, cartes, factures, profil), réservation et liste d'attente depuis le planning
- [x] Admin → Clientes : fiche, vente au studio (CB, espèces, virement) ou carte offerte, correction de crédits,
      lien de réinitialisation et mot de passe temporaire (les mots de passe ne sont jamais lisibles)
- [x] SMS d'annulation de cours (Brevo) ; sans clé BREVO_API_KEY, envois simulés et journalisés
- [x] Séance d'essai 15 € (une par cliente) ; CGV et politique de confidentialité (projets à faire valider)
- [x] Disciplines : Lagree (5 cours), Yoga (2), Mat Pilates (1) avec niveau, intensité 1–3, durée, places ;
      page « Les cours », coachs par discipline (section « Professeurs de yoga »), planning filtrable,
      Admin → Cours proposés ; le type de cours pré-remplit les créneaux
- [ ] Lot 3 — paiement en ligne Stripe
- [x] Admin → Cartes & tarifs : prix, nombre de cours et durée de validité modifiables (prochains achats uniquement)
- [ ] Lot 6 — liste d'attente (emails), confirmations, PWA, tâches planifiées
- [ ] Lot 7 — import bsport, sauvegardes, mise en production
