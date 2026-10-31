# Déployer sur Render

Documentation Render : https://render.com/docs/deploy-node-express-app et https://render.com/docs/blueprint-spec

Le dépôt doit contenir le code à sa racine (`package.json`, `backend/`, `frontend/`, `render.yaml`). Le fichier `render.yaml` prépare un service Node et une base PostgreSQL privés entre eux, dans la région Frankfurt.

## Service web

- Build : `npm ci --include=dev && npm run build`
- Démarrage : `npm start`
- Health check : `/api/health`
- `NODE_ENV=production`, `HOST=0.0.0.0`, `TRUST_PROXY=1`
- `DATABASE_URL` : URL interne de la base Render
- `PAYMENT_MODE=disabled` au premier déploiement
- `APP_ORIGIN` : origine publique exacte, sinon `RENDER_EXTERNAL_URL` est utilisée automatiquement.

Le frontend et le backend sont servis ensemble ; les cookies de session restent sur la même origine. Les images importées sont conservées dans PostgreSQL. Aucune base locale PGlite n’est utilisée en production. Les comptes et commandes du PC ne sont pas publiés avec le code.

## Premier administrateur

Configurer temporairement `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PHONE` (format +243…), `ADMIN_PASSWORD` (au moins 10 caractères, majuscule et chiffre). Le premier démarrage crée ce compte dans le restaurant principal uniquement s’il n’a encore aucun administrateur. Le mot de passe est haché, jamais affiché et n’écrase aucun compte. Retirer ensuite ces quatre variables privées et redémarrer. On peut aussi créer un établissement indépendant via `/restaurants/new` ; il faut alors configurer `EASYPAY_RESTAURANT_ID` sur ce nouvel établissement avant tout paiement.

## IPN

Après démarrage réussi, tester l’URL publique `/api/health`. L’IPN à enregistrer chez EasyPay sera cette même origine suivie de `/api/payments/easypay/ipn` (POST). Les secrets restent dans les variables privées Render. Consulter EASYPAY_IPN.md pour l’activation progressive.

## Limites de l’offre gratuite

Selon https://render.com/docs/free, le service gratuit s’endort après 15 minutes d’inactivité et peut mettre environ une minute à redémarrer. La base gratuite expire après 30 jours. Cela convient à une démonstration encadrée, mais ne garantit pas la disponibilité d’un IPN de paiement réel. Aucun abonnement payant ne doit être engagé sans accord explicite.

La récupération de mot de passe utilise encore une boîte locale de développement : aucun e-mail n’est réellement envoyé. Ne pas annoncer la récupération par e-mail sur l’environnement public avant configuration d’un transport mail. Garder le paiement désactivé pour une simple prévisualisation.


## Déploiement vérifié — 23 octobre 2026

- Application : https://mon-miam-miam-rdc.onrender.com
- IPN à déclarer chez EasyPay : https://mon-miam-miam-rdc.onrender.com/api/payments/easypay/ipn (POST)
- Service : srv-dbdqagd9fdbs738a4gi0 ; déploiement dep-dbdqagt9fdbs738a4hgg.
- Version du code déployé : 64de04b8fba4c8729163344c17edcf14098e3e4b (main).
- Render confirme « Deploy succeeded | Live » ; compilation distante réussie, démarrage sur PostgreSQL 18, mode paiement disabled.
- /api/health : HTTP 200 ; /api/catalog : HTTP 200, quatre articles ; /api/auth/me sans session : HTTP 401.
- POST de contrôle vide vers l’IPN : HTTP 503 « EasyPay n’est pas activé ». L’URL est créée, mais ne traite pas encore les paiements réels.
- PostgreSQL : Frankfurt, Free ; connexions externes bloquées, connexion privée interne uniquement. Expiration annoncée : 22 novembre 2026.
- Déploiement automatique désactivé (Off). Les mises à jour du dépôt ne sont pas publiées automatiquement.
- Les données et comptes du PC n’ont pas été copiés dans PostgreSQL Render. Le premier administrateur public du restaurant principal reste à configurer, ou un nouvel établissement peut être créé via /restaurants/new.

L’URL interne de PostgreSQL a été utilisée exclusivement dans la variable privée DATABASE_URL du service, après autorisation du propriétaire. Elle n’est conservée dans aucun fichier de livraison ni dans GitHub. Les identifiants EasyPay fournis par le propriétaire sont désormais configurés uniquement dans EASYPAY_TOKEN et EASYPAY_CORRELATION_ID du service. Le passage au sandbox utilise PAYMENT_MODE=easypay-sandbox ; aucun appel de paiement réel n’est réalisé. La clé n’est pas refusée sur la seule base de ses champs JWT.


Mise à jour suivante : IPN enregistrée chez EasyPay ; identifiants privés fournis configurés pour le sandbox ; suppression de la validation locale des dates du token. La recette fournisseur reste à effectuer, sans passage automatique au mode réel.
