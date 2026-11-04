# Rapport de vérification — 23 octobre 2026

Version 0.1.0. Contrôles effectués par Codex sur le code initial. Les validations humaines M1–M7 restent à effectuer.

## Contrôles automatisés réalisés

`npm run check` : **62 tests réussis, 0 échec**, puis compilation Vite réussie. Les tests fonctionnels démarrent Express sur des ports locaux temporaires, avec une base PostgreSQL PGlite isolée en mémoire. Ils ne modifient pas les commandes de démonstration persistantes.

| Groupe | Scénarios contrôlés |
| --- | --- |
| Comptes et accès | Menu public, session obligatoire, cookie HttpOnly/SameSite, absence de mot de passe dans les réponses, refus des rôles interdits et des requêtes intersites, inscription avec e-mail personnel, refus d’une promotion par formulaire. |
| Profil | Thème et mode persistants, upload PNG transformé en WebP, rejet d’un faux fichier image, suppression de photo. |
| Commandes | Totaux serveur, frais/remise, double demande simultanée, double annulation, dépenses concurrentes de points, conservation des prix historiques, refus de prix fourni par le client, article épuisé et solde insuffisant, isolation entre étudiants. |
| Paiement et service | Initialisation distincte de confirmation, échec puis nouvelle tentative, double confirmation sans double récompense, étapes livraison/sur place, refus de remboursement non implémenté, refus d’étape prématurée. |
| Fidélité et parrainage | Points après service uniquement, points expirés exclus, commande couverte par points sans paiement externe, bonus de parrainage attribué une seule fois. |
| Relation client | Avis après service uniquement et un seul par commande, brouillon d’employé caché à l’étudiant, approbation réservée au gérant/admin, classement anonymisé. |
| Administration | Création d’employé, refus de rôle supérieur, désactivation invalidant une session. |
| Récupération | Jeton absent de la réponse API, boîte locale, lien utilisable une fois, anciennes sessions invalidées. |
| Exploitation | Simulation désactivable, interdiction du mode paiement démo en production. |

L’audit npm a signalé une dépendance de traitement d’image vulnérable. Sharp a été mis à jour en **0.35.5** ; l’audit après installation signale **0 vulnérabilité connue**. Cela ne constitue pas une certification de sécurité.

## Recette réelle dans le navigateur intégré

- Connexion avec un compte fictif étudiant ; ajout de poulet et bissap, choix livraison et 15 points : total observé **11 000 CDF**.
- Démarrage du paiement de démonstration puis confirmation explicite ; la commande reste non payée avant cette confirmation. Aucun argent réel n’a été utilisé.
- Connexion avec le compte fictif employé ; préparation → prête → départ en livraison → livraison confirmée.
- Retour étudiant : solde **33 points** après 45 points initiaux, 15 utilisés et 3 gagnés.
- Profil : choix Forêt/sombre, enregistrement et rechargement ; préférences conservées. Remplacement de la photo par l’icône fictive locale réussi et image présente après rechargement.
- Douze combinaisons de palettes/modes parcourues dans le profil à une largeur demandée de 390 pixels. Les contrôles de largeur n’ont pas constaté de débordement horizontal du profil. Les fonds et textes changent selon les modes.
- Menu contrôlé en format ordinateur 1440 pixels et téléphone 390 pixels ; illustrations chargées. Un chevauchement dans la carte fidélité mobile a été corrigé. Le visuel du plat du jour a été repositionné pour préserver le titre.

Les captures et le relevé des thèmes sont conservés dans les livrables de recette. Le contrôle de largeur est un contrôle ciblé ; il ne couvre pas toutes les pages, tous les navigateurs ni toute l’accessibilité.

## Non vérifié à ce stade

EasyPay réel, réception d’e-mails, PostgreSQL externe et restauration de sauvegarde, Firefox/Safari, téléphones physiques, montée en charge, audit d’accessibilité complet, exécution réelle de GitHub Actions et déploiement public. Aucun taux de couverture de code n’est revendiqué.

## Correction du circuit gérant / administrateur

Trois tests supplémentaires vérifient la publication directe par le gérant, la transmission à l’administrateur avec refus des contournements et la publication directe par l’administrateur. Voir `CHANGEMENTS.md`.

## Restaurants et administrateurs

Neuf scénarios d’API supplémentaires vérifient la création d’un propriétaire administrateur, son espace distinct, les doublons d’identifiant, l’isolation des comptes/sessions/commandes/catalogues/paramètres, la création des gérants, les images et la récupération avec un compte e-mail homonyme. Total consolidé : 37 tests réussis, 0 échec.

Recette navigateur complémentaire : création réelle d’un espace fictif et de son administrateur, upload des trois images, sauvegarde/rechargement de l’identité, création d’un gérant et connexion avec ce compte. Les pages de connexion et d’inscription affichent le nom/logo/textes/image du restaurant ; la connexion mobile a été contrôlée à 390 pixels sans débordement. Les captures sont conservées dans `Livrables/05_Recette`.


## Photos et navigation — mise à jour du 23 octobre

37 tests réussis et compilation Vite réussie. Import d’images d’articles lors de la création/modification : JPEG/PNG/WebP décodés puis réencodés WebP, limite 3 Mo/16 millions de pixels, permissions administrateur, conservation de l’image si aucune nouvelle n’est choisie. Un fichier refusé ne crée pas l’article. Le choix d’une image externe arbitraire est refusé.

Navigation principale unique, menu ⋯ sous 1240 px, toutes les rubriques selon le rôle.
Photos locales Pexels pour les quatre aliments et le décor d’authentification. Voir CREDITS_IMAGES.md.

Recette dans le navigateur : compte administrateur, import de la photo bissap depuis le disque, aperçu visible puis enregistrement ; réouverture du formulaire avec l’option « Conserver l’image actuelle ». À 390 px, un seul élément de navigation et six liens accessibles dans le menu ⋯ ; quatre photos décodées correctement, pas de débordement horizontal observé. Vérification complémentaire à 1440 px. Captures : Navigation_mobile_photos.png, Navigation_unique_photos_ordinateur.png et Import_photo_article.png.


## Ajustement de navigation et accès restaurant

Navigation unique : toutes les rubriques en haut au-delà de 1200 px ; trois premières rubriques et bouton ⋯ pour le reste sur écran compact ; cette même navigation est fixée en bas jusqu’à 760 px. L’accès « Créer mon restaurant » figure parmi les options restantes et dans un encart placé avant le formulaire de connexion/inscription.

Compilation Vite réussie. Vérification navigateur à 390, 900 et 1440 px : aucune largeur excessive observée ; à 390 px, une seule navigation, bord inférieur à 844 px pour une fenêtre haute de 844 px ; ouverture des options restantes, fermeture et ouverture du formulaire de création depuis le bouton vérifiées. Aucun changement du serveur métier pour cet ajustement ; les 37 tests de la vérification précédente restent le dernier contrôle automatisé du serveur.


## EasyPay et préparation Render

48 tests réussis, 0 échec, et compilation Vite réussie. Onze nouveaux scénarios couvrent l’adaptateur CDF/numéro local, l’expiration locale JWT, l’absence de fuite des secrets dans les erreurs, les demandes concurrentes, la relecture indépendante des IPN, les succès répétés/non rétrogradables, les références/montants falsifiés, les contrôles d’accès et d’annulation, les timeouts sans double débit, les refus explicites, l’isolation du compte marchand et le premier administrateur sans écrasement. Plusieurs assertions sont regroupées dans un même scénario.

Les tests utilisent uniquement des identifiants fictifs, une base isolée et un faux transport/fournisseur. Ils ne prouvent pas la compatibilité du compte marchand ni la réception d’un véritable IPN EasyPay. Le code Render et la configuration PostgreSQL sont préparés ; le déploiement doit encore être constaté sur le tableau de bord.


## Recette du déploiement Render

Déploiement réussi du commit 64de04b8fba4c8729163344c17edcf14098e3e4b : compilation distante et démarrage avec PostgreSQL externe 18. Origine HTTPS https://mon-miam-miam-rdc.onrender.com. /api/health et /api/catalog renvoient HTTP 200 (quatre articles, mode disabled) ; /api/auth/me sans session renvoie 401. Le contrôle de présence de l’IPN renvoie le 503 attendu tant qu’EasyPay est désactivé. Aucune transaction financière n’a été déclenchée.

Recette visuelle publique à 1440 × 1000 puis 390 × 844 : images chargées, navigation unique, menu ⋯ et barre au bas du téléphone, aucun débordement horizontal observé. Connexions externes PostgreSQL bloquées et connexion interne du serveur vérifiée par le catalogue. Les comptes locaux n’ont pas été exportés. Tests métiers multiutilisateurs sur PostgreSQL externe et tests EasyPay fournisseur toujours à effectuer.


## Paiement désactivé : éviter les commandes impossibles à encaisser

50 tests réussis, 0 échec, et compilation Vite réussie. Le panier annonce l’indisponibilité et désactive la confirmation si un montant reste dû. Le backend refuse également la création d’une commande payante lorsque le paiement effectif du restaurant est disabled : aucune commande ni réservation de points n’est créée. Une commande à total zéro, entièrement couverte par des points valides, reste possible. Deux tests API contrôlent le nombre de commandes, la conservation du solde et la confirmation à total zéro.


## Références marchandes EasyPay

51 tests réussis et compilation Vite réussie. Référence fournisseur générée sur 16 caractères alphanumériques, en cohérence avec la borne publiée dans l’espace marchand ; validation du client avant tout appel réseau. Un test supplémentaire refuse les références trop courtes, trop longues ou contenant des tirets. Le test de demandes concurrentes vérifie aussi la longueur/forme de la référence enregistrée. Aucun test financier réel n’a été effectué.


## Utilisation du token fourni et IPN

52 tests réussis, 0 échec, compilation Vite réussie. Le contrôle local des champs exp/nbf non vérifiés du token marchand a été supprimé conformément à la demande du propriétaire. Le test correspondant vérifie désormais la transmission inchangée d’une clé fictive contenant ces champs et laisse le faux fournisseur refuser la demande. Un test supplémentaire maintient le refus d’identifiants absents avant tout appel réseau. Les protections contre les références incohérentes, faux IPN, doublons et fuites d’erreurs restent actives.

IPN enregistrée dans l’espace marchand : https://mon-miam-miam-rdc.onrender.com/api/payments/easypay/ipn, confirmation de succès observée. Identifiants fournis configurés exclusivement dans les variables privées Render, mode sandbox ; aucun appel de paiement réel et aucune preuve d’acceptation du token par le fournisseur ne sont revendiqués.


## Lot du 24 octobre — affiches et corrections

62 tests réussis, 0 échec, compilation Vite réussie. Dix tests du module engagement couvrent brouillons/échéances, validations, capacité concurrente, idempotence, confidentialité des inscrits, image réencodée, retrait d’affiche, corrections justifiées/auditées, points réservés, isolation des restaurants et peuplement local sans écrasement. La première exécution dans le bac à sable a été empêchée par une restriction réseau locale ; la suite a ensuite été exécutée avec l’autorisation nécessaire aux tests HTTP locaux et a réussi.

Recette visuelle : base isolée sur le port 3002, deux affiches fictives créées par l’interface, inscription puis annulation étudiante, crédit administrateur de 5 points visible dans l’historique étudiant. Vue mobile 390 × 844 sans débordement, barre de navigation en bas. Aucune clé EasyPay et aucun paiement utilisés pour ces essais.
