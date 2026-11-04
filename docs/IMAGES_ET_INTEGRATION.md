# Images et changement de dépôt source

## Images du code
Toutes les illustrations de démonstration sont livrées dans `frontend/public/assets` (lot M2). Conserver leurs noms, leur casse et `docs/CREDITS_IMAGES.md` (lot M7). Vite copie ces fichiers dans `dist/assets` pendant `npm run build`. Le dossier `dist` est régénéré et ne doit pas remplacer les sources.

Le test `backend/test/assets.test.js` recherche les références d’images dans les sources et migrations, vérifie la présence de chaque ressource et des crédits des cinq photographies. Lancer `npm run check` après assemblage des lots. Ne pas copier des chemins `C:\...` ou `file:///...` dans les données publiques.

## Images importées dans l’application
Les formulaires de profil, menu, annonces et personnalisation réencodent les fichiers avec Sharp et stockent un contenu WebP en base PostgreSQL (data URI). Ces images survivent à un redéploiement si la même base est conservée. Un push Git transporte le code, pas les données de la base.

## Passer sur integration/complements-cahier
1. Assembler tous les lots et appliquer le complément V4, sans réappliquer ensuite une ancienne version.
2. Vérifier `npm ci` puis `npm run check` sur l’assemblage propre.
3. Conserver le service Render existant, sa DATABASE_URL privée et les autres variables EasyPay/Resend. Changer uniquement la source Git quand le responsable décide la bascule.
4. Vérifier menu, connexion, branding et une image déjà importée après déploiement ; ne pas déclencher un paiement pour ce contrôle.
5. Ne pas recréer le service ni une nouvelle base à partir du blueprint pour réaliser cette bascule. Prévoir une sauvegarde autorisée et un retour à la référence si la recette échoue.

Les crédits autorisent la traçabilité des photos de démonstration. Une personne qui importe sa propre photo doit disposer des autorisations nécessaires. Ne jamais exporter de photos personnelles dans un lot de code sans autorisation.
