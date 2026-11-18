-- Données de départ : cartes actuelles du studio (prix TTC, TVA 20 %)
-- Validité : démarre à la première réservation.
insert into public.products (name, description, credits, price_cents, validity_value, validity_unit, sort_order) values
  ('Carte 1 cours',   'Un cours de Lagree.',                  1,  3500, 1, 'month', 1),
  ('Carte 3 cours',   'Trois cours, valable 1 mois.',         3,  9900, 1, 'month', 2),
  ('Carte 5 cours',   'Cinq cours, valable 1 mois.',          5, 15000, 1, 'month', 3),
  ('Carte 10 cours',  'Dix cours, valable 2 mois.',          10, 25000, 2, 'month', 4);

-- Abonnement illimité : valable 1 mois dès le paiement.
-- class_value_cents = valeur d'un cours pour le CA consommé et la rémunération des
-- professeurs (par défaut 25 €, le prix par cours de la carte 10).
-- Règle : pas plus de 2 annulations tardives (< 12 h) d'affilée.
insert into public.products (name, description, credits, price_cents, validity_value, validity_unit,
                             is_unlimited, class_value_cents, sort_order)
values ('Illimité', 'Cours illimités pendant 1 mois.', 0, 28000, 1, 'month', true, 2500, 5);

-- Séance d'essai (tarif affiché sur le site du club) : une seule par cliente
insert into public.products (name, description, credits, price_cents, validity_value, validity_unit, max_per_client, sort_order)
values ('Séance d''essai', 'Votre premier cours de Lagree.', 1, 1500, 1, 'month', 1, 0);

-- Catalogue des cours du studio (descriptions modifiables dans Admin → Cours proposés)
-- intensité : 1 à 3 « piments » ; durées et capacités par défaut à confirmer par le studio
insert into public.class_types (name, discipline, level, intensity, duration_minutes, default_capacity, color, sort_order, description) values
  ('Lagree Full Body Débutant', 'lagree', 'debutant', 1, 50, 8, '#95a892', 1,
   'Pour découvrir le Megaformer en confiance : les mouvements fondamentaux, expliqués pas à pas, et tout le corps travaillé en douceur.'),
  ('Lagree Sculpt', 'lagree', 'intermediaire', 2, 50, 8, '#4b5c4a', 2,
   'Renforcement ciblé et galbe : bras, fessiers et abdominaux sollicités en continu, à rythme lent et contrôlé.'),
  ('Lagree Avancé Doux', 'lagree', 'avance', 2, 50, 8, '#7d8b74', 3,
   'La technique d''un cours avancé, à un rythme plus posé : précision, contrôle et gainage profond.'),
  ('Lagree Full Body Avancé Intense', 'lagree', 'avance', 3, 50, 8, '#29362a', 4,
   'Le cours le plus exigeant : enchaînements soutenus, transitions minimales, tout le corps engagé du début à la fin.'),
  ('Lagree Disco Night', 'lagree', 'tous', 2, 50, 8, '#a8875a', 5,
   'Le Lagree version soirée : lumière tamisée, playlist disco et énergie de groupe.'),
  ('Yoga Vinyasa', 'yoga', 'tous', 2, 60, 12, '#b98a86', 6,
   'Un yoga dynamique où le mouvement suit le souffle, pour gagner en force, en souplesse et en clarté.'),
  ('Yoga Doux', 'yoga', 'tous', 1, 60, 12, '#d6b9ad', 7,
   'Une pratique lente et restauratrice pour relâcher les tensions, respirer et retrouver de l''espace.'),
  ('Mat Pilates Sculpt', 'mat_pilates', 'tous', 2, 50, 12, '#80706f', 8,
   'Le Pilates au sol, version sculptante : posture, gainage et renforcement profond, sur tapis.');
