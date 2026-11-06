-- Photographies des deux cartes : fichiers locaux et licences dans /credits-images.txt.
-- Préserve les illustrations importées, les prix, les commandes et les autres restaurants.
DO $photos$
DECLARE
 target TEXT;
BEGIN
 FOR target IN SELECT id FROM restaurants WHERE
  (id='mon-miam-miam-kinshasa' AND slug='mon-miam-miam-kinshasa') OR
  (id='694096c7-070b-4650-9ec3-115ceae45b3a' AND slug='la-table-etoilee')
 LOOP
  IF NOT EXISTS (SELECT 1 FROM app_data_migrations WHERE id='010-menu-photos-' || target) THEN
   UPDATE dishes AS dish SET image=photo.image
   FROM (VALUES
    ('moambe','mon-miam-miam-kinshasa','/assets/menu-moambe.webp'),
    ('poisson','mon-miam-miam-kinshasa','/assets/menu-poisson.webp'),
    ('menu-20261106-mon-miam-miam-kinshasa-pondu','mon-miam-miam-kinshasa','/assets/menu-pondu.webp'),
    ('menu-20261106-mon-miam-miam-kinshasa-fumbwa','mon-miam-miam-kinshasa','/assets/menu-fumbwa.webp'),
    ('menu-20261106-mon-miam-miam-kinshasa-madesu','mon-miam-miam-kinshasa','/assets/menu-madesu.webp'),
    ('menu-20261106-mon-miam-miam-kinshasa-liboke','mon-miam-miam-kinshasa','/assets/menu-liboke.webp'),
    ('menu-20261106-mon-miam-miam-kinshasa-makayabu','mon-miam-miam-kinshasa','/assets/menu-makayabu.webp'),
    ('menu-20261106-mon-miam-miam-kinshasa-mbika','mon-miam-miam-kinshasa','/assets/menu-mbika.webp'),
    ('menu-20261106-mon-miam-miam-kinshasa-ntaba','mon-miam-miam-kinshasa','/assets/menu-ntaba.webp'),
    ('menu-20261106-mon-miam-miam-kinshasa-loso','mon-miam-miam-kinshasa','/assets/menu-loso.webp'),
    ('menu-20261106-694096c7-070b-4650-9ec3-115ceae45b3a-moambe','694096c7-070b-4650-9ec3-115ceae45b3a','/assets/menu-moambe.webp'),
    ('menu-20261106-694096c7-070b-4650-9ec3-115ceae45b3a-liboke','694096c7-070b-4650-9ec3-115ceae45b3a','/assets/menu-capitaine.webp'),
    ('menu-20261106-694096c7-070b-4650-9ec3-115ceae45b3a-tilapia','694096c7-070b-4650-9ec3-115ceae45b3a','/assets/menu-tilapia.webp'),
    ('menu-20261106-694096c7-070b-4650-9ec3-115ceae45b3a-ntaba','694096c7-070b-4650-9ec3-115ceae45b3a','/assets/menu-ntaba.webp'),
    ('menu-20261106-694096c7-070b-4650-9ec3-115ceae45b3a-fumbwa','694096c7-070b-4650-9ec3-115ceae45b3a','/assets/menu-ravioli.webp'),
    ('menu-20261106-694096c7-070b-4650-9ec3-115ceae45b3a-croquettes','694096c7-070b-4650-9ec3-115ceae45b3a','/assets/menu-croquettes.webp'),
    ('menu-20261106-694096c7-070b-4650-9ec3-115ceae45b3a-pondu','694096c7-070b-4650-9ec3-115ceae45b3a','/assets/menu-cannelloni.webp'),
    ('menu-20261106-694096c7-070b-4650-9ec3-115ceae45b3a-canard-moambe','694096c7-070b-4650-9ec3-115ceae45b3a','/assets/menu-duck.webp'),
    ('menu-20261106-694096c7-070b-4650-9ec3-115ceae45b3a-crevettes-coco','694096c7-070b-4650-9ec3-115ceae45b3a','/assets/menu-prawns.webp'),
    ('menu-20261106-694096c7-070b-4650-9ec3-115ceae45b3a-boeuf-chikwangue','694096c7-070b-4650-9ec3-115ceae45b3a','/assets/menu-steak.webp'),
    ('menu-20261106-694096c7-070b-4650-9ec3-115ceae45b3a-rossini','694096c7-070b-4650-9ec3-115ceae45b3a','/assets/menu-rossini.webp'),
    ('menu-20261106-694096c7-070b-4650-9ec3-115ceae45b3a-saumon','694096c7-070b-4650-9ec3-115ceae45b3a','/assets/menu-salmon.webp'),
    ('menu-20261106-694096c7-070b-4650-9ec3-115ceae45b3a-risotto','694096c7-070b-4650-9ec3-115ceae45b3a','/assets/menu-risotto.webp'),
    ('menu-20261106-694096c7-070b-4650-9ec3-115ceae45b3a-tagliatelles','694096c7-070b-4650-9ec3-115ceae45b3a','/assets/menu-pasta.webp'),
    ('menu-20261106-694096c7-070b-4650-9ec3-115ceae45b3a-morilles','694096c7-070b-4650-9ec3-115ceae45b3a','/assets/menu-morels.webp'),
    ('menu-20261106-694096c7-070b-4650-9ec3-115ceae45b3a-agneau','694096c7-070b-4650-9ec3-115ceae45b3a','/assets/menu-lamb.webp'),
    ('menu-20261106-694096c7-070b-4650-9ec3-115ceae45b3a-canard-orange','694096c7-070b-4650-9ec3-115ceae45b3a','/assets/menu-orange.webp'),
    ('menu-20261106-694096c7-070b-4650-9ec3-115ceae45b3a-dorade','694096c7-070b-4650-9ec3-115ceae45b3a','/assets/menu-dorade.webp'),
    ('menu-20261106-694096c7-070b-4650-9ec3-115ceae45b3a-tikka','694096c7-070b-4650-9ec3-115ceae45b3a','/assets/menu-tikka.webp'),
    ('menu-20261106-694096c7-070b-4650-9ec3-115ceae45b3a-porc','694096c7-070b-4650-9ec3-115ceae45b3a','/assets/menu-pork.webp')
   ) AS photo(id,restaurant_id,image)
   WHERE dish.id=photo.id AND dish.restaurant_id=photo.restaurant_id
    AND dish.restaurant_id=target
    AND dish.image IN ('/assets/moambe.webp','/assets/poisson.webp','/assets/samossas.webp');
   INSERT INTO app_data_migrations(id) VALUES ('010-menu-photos-' || target);
  END IF;
 END LOOP;
END
$photos$;
