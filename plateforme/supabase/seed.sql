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

insert into public.class_types (name, description, duration_minutes, default_capacity)
values ('Lagree', 'Cours de Lagree sur Megaformer.', 50, 8);
