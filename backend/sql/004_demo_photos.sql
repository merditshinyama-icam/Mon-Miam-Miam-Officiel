-- Upgrade only the original demo illustrations; preserve imported/custom images.
UPDATE dishes SET image=replace(image,'.svg','.webp')
WHERE restaurant_id='mon-miam-miam-kinshasa'
AND id IN ('moambe','poisson','bissap','samossas')
AND image IN ('/assets/moambe.svg','/assets/poisson.svg','/assets/bissap.svg','/assets/samossas.svg');
