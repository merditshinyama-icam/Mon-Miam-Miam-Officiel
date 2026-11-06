-- Cartes demandées le 6 novembre 2026 pour les deux établissements existants.
-- Une application par établissement : les modifications ultérieures du gérant sont conservées.
-- Les photos locales sont des illustrations ; voir les crédits du site.
CREATE TABLE IF NOT EXISTS app_data_migrations (
 id TEXT PRIMARY KEY,
 applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $menus$
DECLARE
 target TEXT;
BEGIN
 SELECT id INTO target FROM restaurants
 WHERE id='mon-miam-miam-kinshasa' AND slug='mon-miam-miam-kinshasa';
 IF target IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM app_data_migrations WHERE id='009-student-menu-' || target
 ) THEN
  -- Le poulet à la moambé et le poisson braisé existants sont conservés : 2 + 8 = 10 plats.
  INSERT INTO dishes(id,restaurant_id,name,description,category,price,image)
  SELECT 'menu-20261106-' || target || '-' || menu.code,target,menu.name,menu.description,
         'Plats',menu.price,menu.image
  FROM (VALUES
   ('pondu','Pondu au fufu','Feuilles de manioc mijotées à l’huile de palme, servies avec une portion de fufu.',6500,'/assets/moambe.webp'),
   ('fumbwa','Fumbwa à l’arachide','Fumbwa mijoté dans une sauce aux arachides, accompagné de chikwangue.',7500,'/assets/moambe.webp'),
   ('madesu','Madesu au riz','Haricots rouges mijotés à la tomate et aux oignons, avec riz blanc.',5500,'/assets/moambe.webp'),
   ('liboke','Liboké de poisson','Poisson cuit en papillote avec tomate, oignon et aromates, servi avec chikwangue.',10000,'/assets/poisson.webp'),
   ('makayabu','Makayabu et pondu','Morue salée dessalée, sauce tomate maison, pondu et riz blanc.',8500,'/assets/poisson.webp'),
   ('mbika','Mbika et chikwangue','Préparation de graines de courge à l’étouffée, accompagnée de chikwangue.',6500,'/assets/moambe.webp'),
   ('ntaba','Ntaba braisé','Chèvre marinée et braisée, oignons frais et bananes plantains.',12000,'/assets/moambe.webp'),
   ('loso','Loso ya bulayi','Riz cuisiné à la tomate et aux légumes, avec morceaux de poulet.',7000,'/assets/moambe.webp')
  ) AS menu(code,name,description,price,image)
  ON CONFLICT(id) DO NOTHING;
  INSERT INTO app_data_migrations(id) VALUES('009-student-menu-' || target);
 END IF;

 target := NULL;
 SELECT id INTO target FROM restaurants
 WHERE id='694096c7-070b-4650-9ec3-115ceae45b3a' AND slug='la-table-etoilee';
 IF target IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM app_data_migrations WHERE id='009-gourmet-menu-' || target
 ) THEN
  INSERT INTO dishes(id,restaurant_id,name,description,category,price,image)
  SELECT 'menu-20261106-' || target || '-' || menu.code,target,menu.name,menu.description,
         'Plats',menu.price,menu.image
  FROM (VALUES
   ('moambe','Suprême de poulet, moambé revisitée','Inspiration congolaise : suprême de poulet, sauce moambé soyeuse, riz parfumé et chips de plantain.',30000,'/assets/moambe.webp'),
   ('liboke','Capitaine en liboké gastronomique','Inspiration congolaise : filet de capitaine en papillote, légumes fondants et chikwangue grillée.',35000,'/assets/poisson.webp'),
   ('tilapia','Filet de tilapia, émulsion citronnelle','Inspiration congolaise : tilapia rôti, émulsion à la citronnelle et purée de patate douce.',28000,'/assets/poisson.webp'),
   ('ntaba','Noisettes de chèvre au gingembre','Inspiration congolaise : chèvre longuement mijotée, réduction au gingembre et plantain confit.',34000,'/assets/moambe.webp'),
   ('fumbwa','Ravioles de fumbwa, crème d’arachide','Fusion congolaise : ravioles garnies de fumbwa, crème d’arachide et huile aux herbes.',25000,'/assets/samossas.webp'),
   ('croquettes','Croquettes de ntaba et plantain confit','Fusion congolaise : croquettes croustillantes de chèvre braisée, plantain confit et salade fraîche.',28000,'/assets/samossas.webp'),
   ('pondu','Cannelloni de pondu et mbika','Fusion congolaise : cannelloni farcis au pondu et aux graines de courge, gratin léger et sauce tomate.',26000,'/assets/moambe.webp'),
   ('canard-moambe','Magret de canard, sauce moambé','Fusion congolaise : magret de canard, sauce aux noix de palme et mousseline de manioc.',42000,'/assets/moambe.webp'),
   ('crevettes-coco','Crevettes au coco et pili-pili','Inspiration congolaise : crevettes sautées, sauce coco au pili-pili doux et riz parfumé.',38000,'/assets/poisson.webp'),
   ('boeuf-chikwangue','Filet de bœuf et chikwangue croustillante','Fusion congolaise : filet de bœuf grillé, chikwangue croustillante, jus au poivre et légumes.',45000,'/assets/moambe.webp'),
   ('rossini','Filet de bœuf Rossini','Cuisine française : filet de bœuf, escalope de foie gras, jus réduit et pommes fondantes.',65000,'/assets/moambe.webp'),
   ('saumon','Pavé de saumon, sauce béarnaise','Cuisine française : saumon rôti, béarnaise aux herbes, pommes vapeur et légumes de saison.',50000,'/assets/poisson.webp'),
   ('risotto','Risotto crémeux aux champignons','Cuisine italienne : riz arborio, champignons poêlés, parmesan et herbes fraîches.',28000,'/assets/moambe.webp'),
   ('tagliatelles','Tagliatelles aux crevettes','Cuisine italienne : tagliatelles, crevettes sautées, sauce crémeuse au citron et parmesan.',35000,'/assets/poisson.webp'),
   ('morilles','Suprême de poulet aux morilles','Cuisine française : suprême de poulet, crème aux morilles et écrasé de pommes de terre.',40000,'/assets/moambe.webp'),
   ('agneau','Carré d’agneau en croûte d’herbes','Cuisine française : carré d’agneau rôti, croûte d’herbes, gratin de pommes de terre et jus corsé.',58000,'/assets/moambe.webp'),
   ('canard-orange','Magret de canard à l’orange','Cuisine française : magret de canard, sauce à l’orange, purée de patate douce et légumes glacés.',45000,'/assets/moambe.webp'),
   ('dorade','Dorade rôtie au beurre citronné','Cuisine méditerranéenne : dorade rôtie, beurre citronné, légumes grillés et riz aux herbes.',42000,'/assets/poisson.webp'),
   ('tikka','Poulet tikka masala','Cuisine indo-britannique : poulet mariné aux épices, sauce tomate crémeuse et riz basmati.',26000,'/assets/moambe.webp'),
   ('porc','Filet mignon de porc à la moutarde','Cuisine française : filet mignon de porc, sauce moutarde à l’ancienne et pommes sautées.',34000,'/assets/moambe.webp')
  ) AS menu(code,name,description,price,image)
  ON CONFLICT(id) DO NOTHING;
  INSERT INTO app_data_migrations(id) VALUES('009-gourmet-menu-' || target);
 END IF;
END;
$menus$;
