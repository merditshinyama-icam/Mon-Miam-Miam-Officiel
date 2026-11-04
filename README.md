# Mon Miam Miam — Groupe 1, ULC-Icam X2

Application de restauration étudiante adaptée à la RDC, avec prix en CDF. Les sept lots et les compléments V4/V5 sont assemblés : comptes et restaurants, interface responsive et thèmes, catalogue et commandes, réclamations et annonces, fidélité et parrainage, paiements EasyPay, administration et statistiques.

## Démarrer en local

Prérequis : Node.js 22.12 ou supérieur et npm.

```sh
npm ci
```

Copier `.env.example` vers `.env`, puis exécuter :

```sh
npm run build
npm start
```

Ouvrir http://localhost:3001. Sans DATABASE_URL, la base PostgreSQL embarquée est créée dans `data/postgres` et les migrations sont appliquées au démarrage. La création d’un restaurant depuis l’interface crée son administrateur. Les comptes de démonstration ne sont pas créés automatiquement : en développement uniquement, définir DEMO_PASSWORD dans .env puis lancer `npm run seed`. Les adresses sont student@demo.miam.test, employee@demo.miam.test, manager@demo.miam.test et admin@demo.miam.test ; le mot de passe est celui choisi dans DEMO_PASSWORD. Ne jamais publier .env ni les données locales.

Pour travailler sur l’interface avec rechargement automatique : `npm run dev`.

## Vérifications

```sh
npm run check
```

Cette commande exécute les tests puis compile le frontend. L’assemblage vérifié le 4 novembre 2026 a réussi 109 tests et la compilation locale. Les fichiers modifiés depuis l’archive d’intégration ont été relus depuis la branche de livraison GitHub. Les tests utilisent des bases isolées et des réponses de prestataires simulées ; ils ne prouvent pas un débit EasyPay réel. GitHub Actions exécute aussi npm ci et npm run check sur l’application complète. Au moment de la livraison, ses exécutions étaient en attente pendant l’incident Actions/Webhooks signalé par GitHub : https://www.githubstatus.com/incidents/xr3myzj7ms51.

## Hébergement et services externes

Le service Render existant mon-miam-miam-rdc est relié à merditshinyama-icam/Mon-Miam-Miam-Officiel, branche main, depuis le 4 novembre 2026. Le premier déploiement officiel a publié le commit 67d98cd avec succès, en conservant la base PostgreSQL et toutes les variables privées existantes. Le site et son IPN gardent la même URL : https://mon-miam-miam-rdc.onrender.com et https://mon-miam-miam-rdc.onrender.com/api/payments/easypay/ipn (POST). Les prochaines mises à jour de main suivent le déploiement automatique après réussite des contrôles CI. Ne pas recréer les ressources à partir du Blueprint. La maquette reste disponible séparément sur https://mon-miam-miam-maquette.vercel.app/.

- Render : DATABASE_URL obligatoire en production ; conserver APP_ORIGIN ou RENDER_EXTERNAL_URL, TRUST_PROXY et les paramètres privés existants. Voir [Déploiement](docs/DEPLOIEMENT_RENDER.md).
- EasyPay : portail hébergé par défaut, parcours Mobile Money direct conservé et confirmation uniquement côté serveur. Voir [Portail et recette](docs/EASYPAY_PORTAIL_2026-11-04.md) et [IPN](docs/EASYPAY_IPN.md). Les clés restent côté serveur. INIT et une page de retour ne confirment pas un paiement. La réussite réelle chez le prestataire reste à vérifier.
- Resend : conserver RESEND_API_KEY, MAIL_FROM, MAIL_REPLY_TO et MAIL_TEST_RECIPIENT dans Render. La récupération de démonstration reste limitée à l’adresse autorisée de Merdi.

## Organisation du code

- backend/src : API, règles métier et services externes ; backend/sql : migrations ; backend/test : tests.
- frontend/src : React ; frontend/public/assets : images locales et icônes, livrées avec le dépôt.
- scripts : développement, récupération des comptes et outils opérateurs.
- docs : [architecture](docs/ARCHITECTURE.md), [API](docs/API.md), [recette par lot](docs/LOTS_ET_RECETTE.md), [crédits des images](docs/CREDITS_IMAGES.md) et [cadre juridique](docs/CADRE_JURIDIQUE.md).

## Historique de l’intégration

Les commits des membres sont conservés. Les PR #8, #10 et #11 complètent l’intégration ; #13 assemble celle-ci sur une branche de livraison qui rétablit explicitement le socle retiré par #9. La PR #12 livre ensuite l’ensemble vers main sans réécriture d’historique. Les anciens échecs de branches incomplètes ne constituent pas le résultat des tests de la version assemblée.

Le code a été préparé avec l’assistance de Codex puis intégré et revu par le groupe. Les dates Git reflètent les opérations réelles ; les échéances Jira restent des dates de planification.
