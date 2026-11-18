# Mise en ligne — THE BODY CLUB

Trois services à relier : **Supabase** (base de données, comptes, photos), **Vercel** (le site),
et plus tard **Stripe** (paiement) et **Brevo** (SMS). Compter environ 1 heure la première fois.

> Le code est dans le dépôt GitHub `paolagraziani2a/stocksbodyclub`, dossier **`plateforme/`**,
> branche **`claude/body-club-booking-platform-ws6cs5`**. La branche par défaut du dépôt est celle
> de l'outil de stock : il faut donc indiquer cette branche et ce dossier à Vercel (étape 2).

---

## 1. Supabase (base de données)

1. Créer un compte sur supabase.com → **New project**
   - Nom : `bodyclub` · Région : **West EU (Paris)** (données en France, RGPD)
   - Noter le **mot de passe de la base** (dans un gestionnaire de mots de passe)
2. Installer les tables, règles et cartes du studio (depuis un ordinateur avec Node.js) :
   ```bash
   cd plateforme
   npx supabase login
   npx supabase link --project-ref <identifiant du projet>   # Settings → General
   npx supabase db push --include-seed                        # migrations + cartes + 8 cours
   ```
   Ne **pas** lancer `npm run demo` sur ce projet : ce sont des données fictives, réservées au local.
3. **Authentication → URL Configuration**
   - Site URL : `https://<votre domaine>` (ou l'adresse `…vercel.app` au début)
   - Redirect URLs : `https://<votre domaine>/**`
4. **Authentication → Providers → Email** : activer « Confirm email » ;
   mot de passe : 8 caractères minimum, « lettres et chiffres ».
5. **Authentication → Email Templates** : copier le contenu de
   `supabase/templates/confirmation.html` (Confirm signup) et `supabase/templates/recovery.html`
   (Reset password), avec leurs sujets (voir `supabase/config.toml`).
6. **Authentication → SMTP Settings** : obligatoire en production (l'envoi intégré de Supabase est
   limité à quelques emails par heure). Utiliser le SMTP gratuit de **Brevo** (300 emails/jour),
   expéditeur par ex. `bonjour@<votre domaine>`.
7. **Settings → API** : noter `Project URL`, la clé `anon` (publique) et la clé `service_role` (**secrète**).

## 2. Vercel (le site)

1. vercel.com → **Add New → Project** → importer le dépôt GitHub `stocksbodyclub`
2. **Root Directory** : `plateforme` · Framework : Next.js (détecté automatiquement)
3. **Environment Variables** :

   | Variable | Valeur | Secrète |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL Supabase | non |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé `anon` | non |
   | `NEXT_PUBLIC_SITE_URL` | `https://<votre domaine>` | non |
   | `SUPABASE_SERVICE_ROLE_KEY` | clé `service_role` | **oui** |
   | `BREVO_API_KEY` | clé API Brevo (SMS) — facultatif au début | **oui** |
   | `SMS_SENDER` | `BodyClub` | non |

   Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) viendra avec le paiement en ligne.
4. **Deploy**. Puis **Settings → Git → Production Branch** : `claude/body-club-booking-platform-ws6cs5`
   (ou la branche `main` si le code y est fusionné).
5. **Settings → Functions → Region** : `cdg1` (Paris), au plus près de la base.
6. **Settings → Domains** : ajouter votre domaine (ex. `reservation.thebodyclub-portovecchio.com`)
   et créer chez votre registrar l'enregistrement DNS indiqué par Vercel.
   Reporter ce domaine dans Supabase (étape 1.3) et dans `NEXT_PUBLIC_SITE_URL`, puis redéployer.

## 3. Premier accès administrateur

1. Sur le site en ligne, **Créer mon compte** avec votre email.
2. Supabase → **SQL Editor** :
   ```sql
   update public.profiles set role = 'admin' where email = 'votre@email.fr';
   ```
3. Se reconnecter : vous arrivez sur `/admin`.
4. Compléter **Réglages** (raison sociale, adresse, SIRET, n° TVA : obligatoires sur les factures),
   **Site internet** (adresse, horaires, photos), **Professeurs**, **Cours proposés**, puis le **Planning**.

## 4. Avant d'ouvrir aux clientes

- [ ] Faire relire les CGV et la politique de confidentialité
- [ ] Brevo : compte, crédits SMS, clé API dans Vercel (sinon les SMS restent « simulés »)
- [ ] Stripe : paiement en ligne (étape suivante du projet)
- [ ] Sauvegardes : l'offre gratuite de Supabase n'en propose pas de téléchargeables →
      passer à Supabase Pro, ou mettre en place la sauvegarde quotidienne automatique (à faire)
- [ ] Import des clientes et crédits depuis bsport (à faire)

## Coûts

| Service | Offre | Coût |
|---|---|---|
| Supabase | Free (500 Mo, 50 000 comptes) | 0 € — Pro 25 $/mois pour les sauvegardes |
| Vercel | **Hobby : usage non commercial uniquement** | 0 € pour tester ; **Pro 20 $/mois** pour un site commercial |
| Brevo | SMTP gratuit ; SMS prépayés | ≈ 4 à 5 centimes par SMS en France |
| Stripe | Sans abonnement | ≈ 1,5 % + 0,25 € par paiement par carte européenne |
| Nom de domaine | — | ≈ 10 à 15 € par an (si pas déjà le vôtre) |

Tarifs à vérifier au moment de souscrire.
