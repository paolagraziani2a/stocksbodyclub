# PROMPT — THE BODY CLUB · Plateforme de réservation (récapitulatif complet)

## 0. Rôle et mission

Tu es développeur full-stack senior, architecte logiciel et expert UX/UI spécialisé dans les plateformes de réservation sportives.

Tu travailles sur la plateforme privée de **THE BODY CLUB**, studio de bien-être à **Porto-Vecchio (Corse)** proposant du **Lagree**, du **Yoga** et du **Mat Pilates**. Cette plateforme remplace **bsport** : elle gère toute l'activité du studio depuis une interface unique (planning, réservations, cartes de cours, abonnement, paiements, factures, professeurs, rémunérations, site vitrine, notifications).

Exigences permanentes :
- un **vrai logiciel exploitable**, pas une maquette ;
- code propre, sécurisé, maintenable, facile à faire évoluer ;
- **coûts de fonctionnement minimaux** (solutions libres, pas d'abonnement inutile) ;
- **tout en français** : interface, messages, emails, SMS, commentaires du code, messages d'erreur ;
- **mobile d'abord** : chaque écran doit être parfait sur téléphone (aucun défilement horizontal) ;
- **ne jamais considérer une fonctionnalité comme terminée sans l'avoir testée** (tests automatisés + vérification réelle dans un navigateur, ordinateur et téléphone).

Stack applicative : Next.js (App Router, Server Components, Server Actions), React, TypeScript, Tailwind CSS. Authentification par **email + mot de passe**. Paiement en ligne : **Stripe** (Checkout + webhooks). Emails et SMS : **Brevo**. Application responsive, installable sur téléphone (PWA).

---

## 1. Rôles et espaces

| Rôle | Accès |
|---|---|
| **Visiteur** | site vitrine, planning public, coachs, cours, tarifs |
| **Cliente** | son compte : réservations, cartes, crédits, factures, profil |
| **Professeur** | son planning, la liste des inscrites de ses cours, le pointage des présences, sa propre rémunération — **jamais** les données financières du studio |
| **Administratrice** | tout : tableau de bord, planning, clientes, cours proposés, cartes et tarifs, paiements et factures, professeurs, site internet, réglages |

La gérante s'appelle **Pao** (administratrice et professeure : elle donne aussi des cours, **non rémunérés**, le studio garde 100 %).

---

## 2. Disciplines et cours proposés

Trois disciplines : **Lagree**, **Yoga**, **Mat Pilates**. Huit cours :

| Discipline | Cours | Niveau | Intensité (1 à 3) | Durée | Places |
|---|---|---|---|---|---|
| Lagree | Lagree Full Body Débutant | Débutant | 1 | 50 min | 8 |
| Lagree | Lagree Sculpt | Intermédiaire | 2 | 50 min | 8 |
| Lagree | Lagree Avancé Doux | Avancé | 2 | 50 min | 8 |
| Lagree | Lagree Full Body Avancé Intense | Avancé | 3 | 50 min | 8 |
| Lagree | Lagree Disco Night | Tous niveaux | 2 | 50 min | 8 |
| Yoga | Yoga Vinyasa | Tous niveaux | 2 | 60 min | 12 |
| Yoga | Yoga Doux | Tous niveaux | 1 | 60 min | 12 |
| Mat Pilates | Mat Pilates Sculpt | Tous niveaux | 2 | 50 min | 12 |

- L'intensité s'affiche sous forme de **1 à 3 « piments »** (repères visuels), comme sur le site du club.
- Chaque cours a : nom, discipline, niveau, intensité, durée, capacité par défaut, couleur (pour le planning admin), description (affichée sur le site), ordre d'affichage, actif/masqué.
- Descriptions par défaut (modifiables) :
  - *Lagree Full Body Débutant* : « Pour découvrir le Megaformer en confiance : les mouvements fondamentaux, expliqués pas à pas, et tout le corps travaillé en douceur. »
  - *Lagree Sculpt* : « Renforcement ciblé et galbe : bras, fessiers et abdominaux sollicités en continu, à rythme lent et contrôlé. »
  - *Lagree Avancé Doux* : « La technique d'un cours avancé, à un rythme plus posé : précision, contrôle et gainage profond. »
  - *Lagree Full Body Avancé Intense* : « Le cours le plus exigeant : enchaînements soutenus, transitions minimales, tout le corps engagé du début à la fin. »
  - *Lagree Disco Night* : « Le Lagree version soirée : lumière tamisée, playlist disco et énergie de groupe. »
  - *Yoga Vinyasa* : « Un yoga dynamique où le mouvement suit le souffle, pour gagner en force, en souplesse et en clarté. »
  - *Yoga Doux* : « Une pratique lente et restauratrice pour relâcher les tensions, respirer et retrouver de l'espace. »
  - *Mat Pilates Sculpt* : « Le Pilates au sol, version sculptante : posture, gainage et renforcement profond, sur tapis. »
- Un cours de Yoga ou de Mat Pilates consomme **1 crédit des mêmes cartes** que le Lagree (à confirmer par le studio).

---

## 3. Cartes, abonnement et tarifs (prix TTC, TVA 20 %)

| Produit | Prix | Cours | Validité | Particularité |
|---|---|---|---|---|
| Séance d'essai | 15 € | 1 | 1 mois | **une seule par cliente** |
| Carte 1 cours | 35 € | 1 | 1 mois | |
| Carte 3 cours | 99 € | 3 | **1 mois** | soit 33 € le cours |
| Carte 5 cours | 150 € | 5 | **1 mois** | soit 30 € le cours |
| Carte 10 cours | 250 € | 10 | **2 mois** | soit 25 € le cours |
| Illimité | 280 € | illimité | 1 mois | abonnement, voir § 3.3 |

Tous ces produits sont **modifiables depuis l'administration** (prix, nombre de cours, durée de validité en jours ou en mois, description, ordre, en vente ou non). **Une modification ne s'applique qu'aux achats suivants** : chaque carte achetée garde les conditions du jour de l'achat (prix, crédits, validité figés).

### 3.1 Règles des cartes de cours
- La validité d'une carte **démarre à la date de la première réservation faite avec cette carte** (et non à l'achat).
- Si cette première réservation est annulée dans les délais, **la carte reste activée** (pas de retour à « non utilisée »).
- Fin de validité : **minuit (heure de Paris) le lendemain de la date anniversaire** (ex. activée le 18/11 à 10 h pour 1 mois → valable tout le 18/12).
- Une carte encore valable au moment de la réservation peut servir pour un cours qui a lieu **après** sa date d'expiration.
- Les crédits expirés ne sont plus utilisables ; une tâche quotidienne les retire et l'enregistre dans l'historique.
- Une cliente peut détenir **plusieurs cartes simultanément**. Ordre de consommation :
  1. abonnement illimité actif couvrant la date du cours (aucun crédit débité) ;
  2. sinon la carte déjà activée, non expirée, avec crédits, **qui expire le plus tôt** ;
  3. sinon la plus ancienne carte non activée (sa validité démarre alors) ;
  4. sinon refus « plus de crédit » avec proposition d'achat.

### 3.2 Valeur d'un crédit (comptabilité et rémunération)
- **Valeur réelle** d'un crédit = prix payé (remise déduite) ÷ nombre de crédits.
- **Valeur « professeur »** d'un crédit = **prix public** du produit ÷ nombre de crédits.
- Une **carte offerte** vaut 0 € de chiffre d'affaires mais rémunère le professeur **comme si elle avait été payée** (prix public). Idem pour une carte achetée avec un code promo.
- Ces deux valeurs sont **figées sur chaque réservation** au moment où elle est faite.

### 3.3 Abonnement illimité (280 €)
- Valable **1 mois à compter du paiement**, sans renouvellement automatique (paiement mois par mois — à confirmer).
- Aucun crédit consommé ; ne couvre que les cours ayant lieu avant la fin de l'abonnement.
- Valeur d'un cours pour le CA consommé et la rémunération : **25 €** (modifiable).
- Règle spécifique : **pas plus de 2 annulations tardives (moins de 12 h avant) d'affilée**. La 3ᵉ annulation tardive consécutive est **refusée** (la réservation reste active ; la cliente doit contacter le studio). Un cours suivi remet le compteur à zéro ; les annulations dans les délais et les absences sont neutres. L'administratrice peut passer outre. La limite est réglable.

---

## 4. Réservations, annulations, liste d'attente

- Réserver = **1 crédit** (ou 0 avec l'illimité). Réservation impossible si : cours annulé, déjà commencé, trop lointain (ouverture des réservations **28 jours** à l'avance, réglable), complet, déjà inscrite, plus de crédit.
- **Aucune surréservation possible**, même si deux personnes cliquent en même temps sur la dernière place (opérations atomiques, verrouillage). Un double clic ne crée qu'une réservation.
- **Annulation gratuite jusqu'à 12 h avant le cours** (réglable) : le crédit est rendu sur la même carte.
- **Annulation tardive** (moins de 12 h) ou **absence** : le cours est dû, mais la place est libérée.
- L'administratrice peut annuler une réservation en rendant le crédit (geste commercial).
- **Annulation d'un cours par le studio** : toutes les inscrites sont **recréditées automatiquement** et **prévenues par SMS**.
- **Liste d'attente** quand le cours est complet : **notification simple** — quand une place se libère, les personnes en attente sont prévenues ; **la première qui réserve obtient la place**. Une inscription en liste d'attente est clôturée si la cliente réserve ou si le cours commence.
- **Présences** : le professeur du cours (ou l'administratrice) pointe « présente / absente » à partir d'1 h avant le cours.

---

## 5. Paiements, factures et comptabilité

### 5.1 Paiement en ligne (Stripe Checkout) — à finaliser
- Paiement par carte bancaire, codes promotionnels, confirmation automatique par webhook **vérifié** et **idempotent** (un même paiement ne crédite jamais deux fois, même si la notification arrive plusieurs fois ou simultanément).
- Remboursements : total (retire les crédits restants et désactive la carte) ou partiel (aucun crédit retiré sauf demande explicite).
- Ne **jamais** stocker de données bancaires. Les clés secrètes ne quittent jamais le serveur.
- Récupérer les **frais Stripe** de chaque paiement pour les afficher séparément.

### 5.2 Vente au studio
L'administratrice enregistre une vente faite sur place (carte bancaire au studio, espèces, virement) : commande payée, carte créditée, **facture émise**, chiffre d'affaires comptabilisé — exactement comme un paiement en ligne. Elle peut aussi **offrir** une carte.

### 5.3 Factures et avoirs
- Une **facture automatique** à chaque paiement confirmé ; un **avoir** à chaque remboursement.
- Numérotation **continue, sans trou, par année** : factures `F2026-00001`, avoirs `A2026-00001`, garantie même avec des paiements simultanés.
- Factures **figées et non modifiables** (vendeur, acheteuse, lignes copiés à l'émission) ; mentions : raison sociale, forme juridique et capital, adresse, SIRET, n° de TVA intracommunautaire, total HT, TVA 20 %, total TTC, moyen de paiement, pied de facture (« Paiement reçu par carte bancaire. Pas d'escompte pour paiement anticipé. »).
- Facture imprimable / enregistrable en PDF par la cliente et l'administratrice ; **export comptable CSV** mensuel (protégé contre l'injection de formules dans Excel).

### 5.4 Règles de comptabilité (aucun double comptage)
- **Encaissé** = paiements reçus (Stripe et studio), moins remboursements ; **frais Stripe** affichés à part ; net encaissé.
- **Valeur consommée** = crédits utilisés × valeur réelle. C'est une vue d'activité, **jamais additionnée** au chiffre d'affaires encaissé.
- Montants affichés en TTC avec équivalent HT.

---

## 6. Professeurs et rémunération

- Fiche professeur : nom affiché, **disciplines enseignées** (une ou plusieurs : Lagree, Yoga, Mat Pilates), actif/inactif, compte de connexion éventuel.
- **Profil public** : photo (portrait vertical), titre (ex. « Coach Lagree certifiée », « Professeure de yoga »), citation, présentation, spécialités, formation et certifications, lien Instagram (https uniquement), ordre d'affichage, affiché ou non sur le site.
- Rémunération par professeur, **historisée** (un changement s'applique à partir du jour du changement, les mois passés gardent l'ancien taux). Modes :
  - **pourcentage de la valeur des cours** (règle actuelle : **40 %** pour les professeurs, le studio garde 60 %) ;
  - montant fixe par cours ;
  - montant par élève ;
  - pas de rémunération (**Pao : 0 %**, le studio garde 100 %).
- Base de calcul : valeur « professeur » des réservations (§ 3.2), **HT** par défaut (réglable HT/TTC — à confirmer par le studio).
- Comptent dans la rémunération : présentes, réservées non pointées, **annulations tardives et absences** (réglable).
- Seuls les cours **terminés** comptent. Calcul par cours, par semaine, par mois, sur période libre.

---

## 7. Notifications

### 7.1 SMS (Brevo)
- Envoyé à chaque cliente inscrite quand **le studio annule un cours**.
- Texte : « The Body Club : {Prénom}, votre cours {Cours} du {jour jj/mm} a {hh}h{mm} est annule. Votre credit vous a ete rendu. Desolees pour ce changement. »
- **Un seul SMS de 160 caractères maximum**, alphabet SMS standard uniquement (accents hors alphabet retirés pour ne pas doubler le coût). Version courte automatique si le texte est trop long.
- Expéditeur : « BodyClub » (11 caractères max).
- Pas d'envoi si : pas de numéro, cliente opposée aux SMS, numéro fixe. **Chaque envoi est journalisé** (envoyé, échec, non envoyé et pourquoi) et visible sur la fiche du cours dans l'administration.
- Sans clé configurée : envois **simulés** et journalisés (rien n'est envoyé).
- Numéros saisis librement (« 06 12 34 56 78 », « +33… », « 0033… ») et stockés au format international.

### 7.2 Emails (Brevo), aux couleurs du club
- **Confirmation de l'adresse email** à l'inscription (obligatoire pour activer le compte).
- **Mot de passe oublié** : lien valable 1 heure, à usage unique.
- À prévoir : confirmation de réservation, rappel avant le cours, place libérée (liste d'attente), reçu de paiement.

---

## 8. Comptes et sécurité des mots de passe

- Inscription : prénom, nom, email, **mobile (obligatoire)**, mot de passe + confirmation, case « Me prévenir par SMS si un de mes cours est annulé » (cochée par défaut), acceptation obligatoire des CGV et de la politique de confidentialité.
- Mot de passe : **8 caractères minimum, avec au moins une lettre et un chiffre**.
- Connexion refusée tant que l'email n'est pas confirmé (un nouveau lien est envoyé).
- Les mots de passe sont stockés sous forme d'**empreinte irréversible** : **personne ne peut les lire, pas même l'administratrice** (exigence RGPD — ne jamais proposer de les afficher). À la place, sur la fiche cliente :
  - **« Envoyer un lien de réinitialisation »** ;
  - **« Créer un mot de passe temporaire »** (format lisible, ex. `Studio-4827-kv`), affiché **une seule fois**, sessions de la cliente fermées, et **obligation de choisir un nouveau mot de passe** à la connexion suivante (accès au compte bloqué d'ici là).
- Changement de mot de passe depuis le compte (mot de passe actuel demandé).
- Ne jamais révéler si un email est inscrit (même réponse pour « mot de passe oublié »).
- Toute redirection après connexion est limitée aux pages internes.

---

## 9. Sécurité, fiabilité, RGPD (directives)

- Rôles cliente / professeur / administratrice vérifiés **côté serveur** sur chaque page et chaque action, avec **cloisonnement des données au niveau des données elles-mêmes** : une cliente ne voit que ses réservations, cartes, crédits, factures ; un professeur ne voit que la liste de ses propres cours (prénom + initiale du nom) et sa propre rémunération.
- Les règles critiques (réservation, annulation, crédits, paiement, remboursement, factures, expiration) sont des **opérations atomiques** : tout ou rien.
- **Historique des crédits inaltérable** (ajout seul) : chaque mouvement (achat, réservation, remboursement d'annulation, cours annulé, expiration, remboursement, ajout/correction manuelle avec motif obligatoire, import) est enregistré ; pour chaque carte, la somme de l'historique égale toujours le solde.
- **Journal d'audit** des opérations sensibles (produits, tarifs, rémunérations, réglages, rôles, mots de passe temporaires — sans jamais le mot de passe).
- Couleurs saisies uniquement au format `#RRGGBB`, liens externes en https uniquement, images JPG/PNG/WebP de 5 Mo maximum (**SVG refusé**), en-têtes de sécurité HTTP.
- Messages d'erreur toujours compréhensibles, jamais techniques.
- RGPD : données hébergées dans l'Union européenne, minimisation, droit d'accès, de rectification, de suppression (anonymisation en conservant les factures 10 ans), opposition aux SMS depuis le compte, politique de confidentialité, sauvegardes régulières et procédure de restauration testée.

---

## 10. Identité visuelle (interface cliente)

Inspirée du site existant du club (thebodyclub-portovecchio.com) : minimaliste, haut de gamme, féminin et élégant, beaucoup d'espace.

**Couleurs**
| Usage | Code |
|---|---|
| Fond crème | `#F0EADB` |
| Fond secondaire | `#FAF6EB` |
| Texte (noir d'encre) | `#131512` |
| Texte discret | `#4F544D` |
| Accent vert sauge | `#4B5C4A` |
| Section foncée (vert profond) | `#29362A` |
| Sauge clair (accents sur fond foncé) | `#95A892` |
| Bordures | `#D8D0BD` |

**Typographies**
- Titres : **Big Shoulders Display**, condensée, grasse, **en capitales**, interlignage serré.
- Mot d'accent : **Instrument Serif italique**, en minuscules, couleur sauge, souvent à la ligne sous le titre (« THE BODY *club* », « RÉSERVER *un cours.* », « LES COACHS *qui vous suivent.* », « PASSEZ QUAND *vous voulez.* »).
- Texte : **Geist**. Étiquettes : **Geist Mono**, petites capitales espacées, numérotées (« 01 / PLANNING », « 02 / MOUVEMENT »).

**Éléments signature**
- Boutons-pilules en capitales (chasse fixe) avec flèche (« RÉSERVER UNE SÉANCE → »), pleins noirs ou contour.
- **Bandeau défilant** « THE BODY CLUB / LAGREE / MOUVEMENT / PORTO-VECCHIO / EST. 2026 » (désactivé si l'utilisatrice préfère réduire les animations).
- Grande photo d'accueil plein écran assombrie, titre géant centré.
- Sections alternées crème / crème clair / **vert profond** (section équipe ou yoga) ; pied de page noir.
- Tarifs présentés comme une carte de restaurant (nom ……… prix).
- Portrait de coach sans photo : initiales sur fond sauge.
- L'**administration** reste sobre et lisible (titres en Geist, pas de capitales condensées), dans les mêmes couleurs.
- Tout est **modifiable depuis l'administration** (§ 12.8) : couleurs (avec palettes prêtes), polices, forme des boutons, textes, photos.

---

## 11. Site et espace cliente — écrans

Navigation : 01 Planning · 02 Cours · 03 Coachs · 04 Tarifs · 05 Le studio · Mon compte · bouton « Réserver ». Menu plein écran sur téléphone.

1. **Accueil** : grande photo + « THE BODY *club* » + accroche + boutons ; bandeau défilant ; « 01 / Le studio » (présentation + photo) ; **« Trois *pratiques.* »** (Lagree, Yoga, Mat Pilates avec leurs cours et intensités) ; « La méthode Lagree » (durée, capacité, niveaux) ; galerie de photos du studio ; « Réserver *un cours.* » avec les prochains créneaux disponibles ; l'équipe (section vert profond) ; tarifs en liste ; **infos pratiques** (adresse + bouton « Itinéraire » vers une carte, horaires, accès, contact, Instagram) ; pied de page « PASSEZ QUAND *vous voulez.* ».
2. **Les cours** : les trois disciplines, chaque cours avec niveau, intensité, durée, places, description et lien « Réserver ce cours ».
3. **Les coachs** : organisés par discipline — « Coachs *Lagree.* », **« Professeurs *de yoga.* »** (section vert profond), « Professeurs *de Pilates.* » ; un professeur multi-disciplines apparaît dans chaque section concernée.
4. **Fiche coach** : grand portrait, titre, disciplines, citation, présentation, spécialités, formation, Instagram, **ses prochains cours** avec places restantes, autres coachs.
5. **Tarifs** : toutes les formules + règles (validité, annulation, illimité).
6. **Planning** : choix du jour (7 jours, défilement horizontal sur téléphone), semaine suivante, **filtres Tous / Lagree / Yoga / Mat Pilates** et par cours ; chaque créneau : heure, durée, cours, coach (photo), niveau, intensité, places restantes (« Complet »), bouton **Réserver / Annuler / Liste d'attente / Quitter** avec retour immédiat (succès, « plus de crédit → choisir une carte »). Réservation en **deux gestes**.
7. **Connexion**, **Inscription**, **Mot de passe oublié**, **Nouveau mot de passe** (lien email, changement volontaire ou mot de passe temporaire).
8. **Mon compte** : « BONJOUR *Prénom.* » ; solde de crédits (ou « ∞ » avec l'illimité et sa date de fin), expiration la plus proche ; prochains cours avec annulation (avertissement si tardive) ; liste d'attente ; cartes actives (crédits, validité) ; historique des cours ; factures téléchargeables ; informations personnelles (prénom, nom, mobile, choix SMS) ; changer de mot de passe ; se déconnecter.
9. **Acheter une carte** (paiement en ligne à brancher).
10. **CGV** et **Politique de confidentialité** (projets générés avec les règles du studio, à faire valider).
11. **Facture / avoir** imprimable.

Les formulaires ne doivent **jamais se vider** après une erreur de saisie.

---

## 12. Administration — écrans

Menu : Tableau de bord · Planning · Cours proposés · Clientes · Cartes & tarifs · Paiements & factures · Professeurs · Site internet · Réglages.

1. **Tableau de bord** : CA encaissé du jour, de la semaine (lundi → dimanche), du mois (TTC, HT, nombre de ventes, remboursements) ; réservations, annulations tardives, absences ; taux de remplissage ; clientes actives ; valeur consommée ; **rémunération de chaque coach** (semaine et mois, nombre de cours et d'élèves) ; **meilleures clientes du mois** (montant payé, puis nombre de cours) ; cartes vendues ; **période personnalisée** (encaissé, remboursements, net TTC/HT, frais Stripe, remises, ventes, réservations, remplissage, crédits et valeur consommés).
2. **Planning** : vue semaine (7 colonnes sur ordinateur, liste sur téléphone), couleur du type de cours, places occupées, cours annulés barrés, professeur manquant signalé ; **création rapide** : type de cours (remplit nom, durée, places), date, heure (heure de Paris, changements d'heure gérés), professeur (ceux de la discipline en premier), note interne, **répétition sur 2 à 52 semaines** ; **dupliquer la semaine** sur N semaines sans doublon.
3. **Fiche cours** : inscrites, pointage des présences, modification (impossible de descendre sous le nombre d'inscrites), **annulation avec motif** (recrédit + SMS, bilan affiché), suppression seulement si aucune réservation, journal des SMS.
4. **Cours proposés** : modifier / ajouter les types de cours (§ 2).
5. **Clientes** : recherche par nom, email ou téléphone ; fiche : cartes (crédits, validité, offerte), **correction de crédits ± avec motif**, cours, achats et factures, **vendre au studio ou offrir une carte**, outils mot de passe (§ 8).
6. **Cartes & tarifs** : § 3.
7. **Paiements & factures** : par mois, encaissé / remboursé / frais / net, liste des paiements (cliente, achat, code promo, statut, facture, lien vers le paiement dans Stripe), onglet factures et avoirs (HT, TVA, TTC), raccourcis Stripe (codes promo, virements), export CSV.
8. **Professeurs** : ajout (nom, discipline, rémunération), rémunération historisée, activer/désactiver, **profil public** (§ 6).
9. **Site internet** : couleurs (7 couleurs + palettes « Porto-Vecchio (club) », « Sable », « Rose poudré », « Sauge », « Noir & or »), polices des titres et du texte, forme des boutons, textes d'accueil (sur-titre, titre, mot en italique, accroche, présentation, méthode), bandeau défilant, logo, photo d'accueil, **galerie de photos du studio** (ajout multiple, légende, ordre, suppression, 24 max), coordonnées, horaires, accès, Instagram ; **aperçu en direct** ; publication immédiate.
10. **Réglages** : mentions légales des factures (raison sociale, forme, adresse, SIRET, n° TVA, taux de TVA, pied de facture), délai d'annulation, ouverture des réservations, limite d'annulations tardives de l'illimité, liste d'attente on/off, base de rémunération HT/TTC, prise en compte des annulations tardives et absences dans la rémunération.

---

## 13. Espace professeur (à réaliser)
Son planning, la liste de ses inscrites (prénom + initiale), le pointage des présences, le détail de sa rémunération par cours et par mois. Aucune donnée financière du studio.

---

## 14. Reste à réaliser (par priorité)

1. **Paiement en ligne Stripe** (Checkout, webhook idempotent, codes promo, remboursements depuis l'administration, frais Stripe, page de retour).
2. **Emails transactionnels** supplémentaires (confirmation de réservation, rappel, place libérée, reçu).
3. **Tâche quotidienne** : expiration des crédits, clôture des listes d'attente, rappels.
4. **Espace professeur** (§ 13).
5. **Import bsport** : clientes, crédits restants, cartes actives et dates d'expiration, réservations futures, professeurs — par fichiers CSV, en trois temps (zone tampon → rapport de contrôle : totaux, doublons, emails invalides → validation), testé à blanc avant la bascule ; invitation des clientes à définir leur mot de passe.
6. **PWA** (installable, icône, écran de démarrage).
7. **Sauvegardes** automatiques + procédure de restauration testée.
8. Suppression de compte à la demande (anonymisation RGPD).

## 15. Points à faire confirmer par le studio
- Base de rémunération des professeurs : **HT** (par défaut) ou TTC.
- Annulations tardives et absences comptées dans la rémunération (oui par défaut).
- Illimité : renouvellement automatique ou non ; valeur d'un cours (25 €) ; conséquence exacte de la 3ᵉ annulation tardive.
- Prix spécifiques pour le Yoga et le Mat Pilates, ou mêmes cartes que le Lagree.
- Durées et capacités des cours de Yoga et Mat Pilates.
- Textes des CGV, de la politique de confidentialité et des descriptions de cours.
- Informations légales (raison sociale, adresse, SIRET, TVA), adresse et horaires du studio, photos réelles.

## 16. Méthode de travail
- Avancer par étapes cohérentes, en privilégiant l'indispensable ; proposer, puis développer le vrai code, les tests et la documentation.
- Toutes les règles critiques couvertes par des **tests automatisés** : concurrence (dernière place, double clic, crédit unique), idempotence des paiements, choix de la carte, activation, expiration, annulations (limite exacte des 12 h), illimité, cartes offertes, rémunérations, factures (numérotation continue), cloisonnement des données par rôle.
- Vérifier chaque écran dans un vrai navigateur, sur ordinateur et téléphone, avant de le déclarer terminé.
- Poser uniquement les questions indispensables ; à défaut, choisir la solution la plus prudente, l'appliquer et la signaler.
- Toujours répondre et documenter **en français**.
