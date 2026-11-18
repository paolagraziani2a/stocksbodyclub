-- Données de départ : cartes actuelles du studio (prix TTC, TVA 20 %)
-- Validité : démarre à la première réservation.
insert into public.products (name, description, credits, price_cents, validity_value, validity_unit, sort_order) values
  ('Carte 1 cours',   'Un cours de Lagree.',                  1,  3500, 1, 'month', 1),
  ('Carte 3 cours',   'Trois cours, valable 1 mois.',         3,  9900, 1, 'month', 2),
  ('Carte 5 cours',   'Cinq cours, valable 1 mois.',          5, 15000, 1, 'month', 3),
  ('Carte 10 cours',  'Dix cours, valable 2 mois.',          10, 25000, 2, 'month', 4);

insert into public.class_types (name, description, duration_minutes, default_capacity)
values ('Lagree', 'Cours de Lagree sur Megaformer.', 50, 8);
