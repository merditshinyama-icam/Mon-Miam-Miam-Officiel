# API REST — V0.1

Préfixe `/api`. Corps JSON sauf upload photo. Réponses JSON, erreurs `{ "message": "…" }`. Une session est créée par inscription ou connexion et transmise par cookie HttpOnly. Les requêtes de modification doivent contenir `X-Requested-With: MonMiamMiam` et venir de l’origine `APP_ORIGIN`. Aucun jeton de connexion n’est stocké dans localStorage.

| Méthode et chemin | Accès | Usage |
| --- | --- | --- |
| GET /health | Public | Version et mode de paiement |
| GET /catalog | Public | Articles, disponibilités, paramètres publics |
| POST /auth/register | Public | `name,email,phone,password,referralCode?` ; rôle étudiant imposé |
| POST /auth/login | Public | `email,password` |
| POST /auth/logout | Public/session | Révoquer le cookie courant |
| GET /auth/me | Connecté | Profil courant, sans mot de passe |
| PATCH /auth/me | Connecté | `name,phone,theme,dark,public_ranking` |
| POST /auth/me/photo | Connecté | Multipart, champ fichier `photo`, limite 3 Mo |
| DELETE /auth/me/photo | Connecté | Enlever la photo |
| POST /auth/forgot-password | Public, local | `email` ; lien dans la boîte locale |
| POST /auth/reset-password | Public | `token,password` |
| GET /orders | Connecté | 100 dernières commandes propres ou du restaurant selon rôle |
| GET /orders/:id | Propriétaire/personnel | Une commande et ses lignes/tentatives/avis |
| POST /orders | Étudiant | Panier et service ; prix recalculés |
| POST /orders/:id/cancel | Propriétaire/gérant/admin | Annulation non payée et restitution des points |
| PATCH /orders/:id/status | Personnel | `status` ; transition autorisée uniquement |
| POST /orders/:id/payments | Propriétaire | `phone,operator` ; mode démo uniquement |
| POST /orders/:id/payments/:paymentId/simulate | Propriétaire, démo locale | `outcome: paid ou failed` |
| POST /orders/:id/review | Propriétaire | `rating,message` ; après service, un seul avis |
| GET /loyalty | Étudiant | Solde, lots, code et filleuls |
| GET /ranking?period=week | Connecté | Top 10 ; day/week/month, Kinshasa |
| GET /stats?period=week | Personnel | Semaine imposée aux employés |
| GET /complaints | Connecté | Propres demandes ou restaurant ; brouillons masqués aux étudiants |
| POST /complaints | Étudiant | `orderId,message` |
| POST /complaints/:id/draft | Personnel | `draft` ; employé → gérant, gérant → administrateur |
| POST /complaints/:id/decision | Gérant/admin | `approve` booléen, `draft?` pour publier directement la réponse saisie |
| PATCH /dishes/:id/availability | Personnel | `available` booléen |
| POST /dishes | Admin | Créer un article |
| PUT /dishes/:id | Admin | Modifier nom, description, catégorie, prix, image, disponibilité |
| DELETE /dishes/:id | Admin | Archiver sans toucher aux commandes |
| GET /staff | Gérant/admin | Employés du restaurant |
| POST /staff | Gérant/admin | `name,email,phone,password,role?` ; employee ou manager, ce dernier réservé à l’administrateur |
| PATCH /staff/:id | Admin | `name,phone,active,role?` ; employee ou manager, les changements de rôle révoquent les sessions |
| PUT /settings | Admin | Paramètres complets, validés côté serveur |

## Exemple de création de commande

```json
{
  "requestKey": "5b64b047-ffca-48ee-956b-4e16e81d31aa",
  "items": [{ "dishId": "moambe", "quantity": 1 }],
  "service": "delivery",
  "address": "Kinshasa, avenue de la Paix 10, portail bleu",
  "points": 0
}
```

Pour le service sur place : `service: "onsite"` et `arrivalAt` ISO avec fuseau, par exemple une date future convertie par le navigateur ; aucune adresse requise. Quantités 1 à 20 par article. Un même `requestKey` pour le même étudiant renvoie la commande déjà créée : utiliser une nouvelle clé pour une nouvelle commande.

États sur place : `awaiting_payment → confirmed → preparing → ready → served`.
Livraison : `awaiting_payment → confirmed → preparing → ready → delivering → delivered`.
`confirmed` exige paiement confirmé ou total nul couvert par les points. Un paiement initié reste en attente. L’annulation ne concerne que les commandes non payées avant préparation. Le remboursement est hors V0.1.

Erreurs principales : 400 saisie invalide, 401 connexion requise, 403 droit/origine refusé, 404 ressource absente ou hors accès, 409 conflit métier/doublon, 429 limite de requêtes, 503 intégration non configurée.

Pour une réclamation en attente de l’administrateur (`review_role: "admin"`), seul l’administrateur peut accepter ou refuser. Un gérant peut publier directement une réponse à une demande ouverte ou à une proposition employé. Les brouillons ne sont jamais publiés par le simple envoi d’une proposition.

## Restaurants et identité

Le site initial utilise le contexte par défaut. Les autres espaces appellent l’API avec `X-Restaurant-Slug: identifiant`, dérivé de leur URL `/r/identifiant`. Une session ne peut agir que dans le restaurant auquel appartient son compte. Un identifiant inconnu renvoie 404.

| Route | Accès | Corps / usage |
| --- | --- | --- |
| POST /restaurants | Public, limité en fréquence | restaurantName, slug, location, openingHours, name, email, phone, password ; crée le restaurant et son administrateur dans une transaction |
| PUT /branding | Admin du restaurant | name, authTitle, authSubtitle, heroTitle, defaultTheme, contactEmail, contactPhone |
| POST /branding/images/:slot | Admin du restaurant | Multipart, champ image ; slot logo/authImage/coverImage ; JPEG/PNG/WebP, 3 Mo maximum |
| DELETE /branding/images/:slot | Admin du restaurant | Revenir à l’image par défaut |

GET /catalog retourne également `restaurant: {id,name,slug,branding}`. Les images sont normalisées et les paramètres existants sont conservés lors d’une mise à jour du texte. L’identifiant du lien client est immuable. La réponse de création comprend le chemin du nouvel espace et la session de son propriétaire.


## EasyPay Mobile Money

POST /api/orders/:id/payments : initie la demande Mobile Money côté serveur en mode easypay-sandbox/easypay-live ; le mode demo reste séparé.
POST /api/orders/:id/payments/:paymentId/check : vérification auprès du fournisseur, réservée au propriétaire étudiant ou gérant/admin du restaurant.
POST /api/payments/easypay/ipn : callback public sans session ni en-tête navigateur, références connues et contrôle indépendant auprès d’EasyPay. Statut fourni dans l’IPN non considéré comme preuve.

Le déploiement https://mon-miam-miam-rdc.onrender.com est préparé pour PAYMENT_MODE=easypay-sandbox avec identifiants privés. L’IPN est enregistrée dans l’espace marchand. Aucun débit réel n’a été effectué et la recette fournisseur reste à faire. Voir EASYPAY_IPN.md.


## Affiches et fidélité — 24 octobre 2026

- GET /api/announcements : affiches publiées non terminées ; compte d’inscrits et inscription de la session, sans identité des autres étudiants.
- GET /api/announcements/manage : administrateur, brouillons inclus.
- POST /api/announcements et PUT /api/announcements/:id : administrateur ; kind (promotion/event/game), title, description, startsAt/endsAt (ISO avec fuseau), published, capacity (entier ou null), image facultative (photo locale autorisée). Multipart avec photo facultative ≤3 Mo.
- DELETE /api/announcements/:id : administrateur ; archivage conservant les inscrits.
- POST/DELETE /api/announcements/:id/participation : étudiant ; inscription idempotente ou annulation personnelle. Inscriptions fermées à la fin de l’événement, capacité vérifiée sous transaction.
- GET /api/announcements/:id/participants : administrateur du restaurant uniquement.
- GET /api/students?q= : administrateur ; recherche littérale nom/e-mail de 2 à 80 caractères, au plus 30 résultats, solde disponible.
- GET /api/point-adjustments?userId=UUID : administrateur ; historique des corrections de cet étudiant.
- POST /api/point-adjustments : administrateur ; userId, requestKey (UUID), delta (entier non nul de −10 000 à +10 000), reason (10–500 caractères). Demande répétée identique sans double crédit ; réutilisation de clé avec un autre contenu refusée.
- GET /api/loyalty inclut adjustments (delta, reason, date) pour l’étudiant connecté.

Les mutations nécessitent les protections de session/origine habituelles. Une promotion ne modifie pas les totaux et une inscription ne donne pas automatiquement de points.
