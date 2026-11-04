# État réel — 24 octobre 2026

Cette livraison démarre la phase de code. Elle ne constitue pas la version finale du 29 octobre ni la validation des sept membres.

| Domaine | État |
| --- | --- |
| React, Express, PostgreSQL embarqué persistant | Implémenté localement |
| Authentification, rôles, thèmes, photo | Implémenté ; tests API |
| Catalogue, panier, sur place/livraison, suivi | Implémenté ; tests API et recette visuelle à consigner |
| Mobile Money | Adaptateur EasyPay Mobile Money/IPN implémenté, testé avec faux fournisseur ; recette EasyPay externe à faire |
| Fidélité, réservation, expiration, parrainage | Implémenté ; tests métier/API |
| Réclamations approuvées, avis, classement | Implémenté ; tests API |
| Employés, catalogue, statistiques, paramètres | Première version implémentée |
| E-mails de récupération | Boîte locale ; envoi réel à développer |
| Affiches promotions/événements/jeux et participation | Implémenté ; brouillons, publication, import image, capacité, inscriptions et annulation |
| Ajustement manuel des points et justification | Implémenté ; administrateur uniquement, crédit/retrait, audit et historique étudiant |
| Création administrateur / restaurant et personnalisation | Implémenté localement ; nom, images, textes, contacts et palette |
| Multi-restaurants | Liens clients séparés et isolation des accès vérifiés par les tests API |
| Création de gérants | Accessible à l’administrateur depuis l’équipe |
| Déploiement Render/API et PostgreSQL externe | Réalisé : application HTTPS, PostgreSQL 18, santé et catalogue vérifiés ; configuration sandbox privée déployée, IPN enregistrée |
| GitHub Actions | Fichier préparé ; aucune exécution distante attestée |
| GitHub et Jira | Code publié sur le dépôt privé ; aucune validation humaine Jira revendiquée |
| Guides définitifs, budget, risques, aspects juridiques, soutenance | À finaliser selon la roadmap |

Le connecteur Figma n’a pas pu lire le fichier importé courant faute de droits côté connecteur. Le code réutilise les sources locales des maquettes et leurs illustrations originales. Il s’agit d’une interface React responsive ; ce n’est pas un SVG de maquette affiché comme application.

## EasyPay

La [documentation officielle](https://developper.e-com-easypay.com/) a été récupérée et le contrat Mobile Money direct implémenté côté serveur. La simulation reste active localement ; le déploiement utilise EasyPay sandbox. L’IPN est revérifié auprès d’EasyPay, les notifications sont idempotentes, les timeouts ne déclenchent pas de nouvelle demande. Les scénarios sont testés avec un faux fournisseur ; aucun paiement réel ni essai sandbox authentifié n’a été effectué. Voir [EasyPay/IPN](EASYPAY_IPN.md) et [Render](DEPLOIEMENT_RENDER.md).

Aucun identifiant réel n’est conservé dans le dépôt ou les archives. Les clés sont exclusivement des variables serveur privées.

## Vérifications à compléter

Recette par M1–M7, Firefox/Safari et téléphones réels ; persistance/restauration PostgreSQL externe ; HTTPS ; réception réelle des e-mails ; EasyPay test ; accessibilité clavier/lecteur d’écran ; finalisation des informations de confidentialité et des durées de conservation. Les dates de livraison de la roadmap restent des engagements planifiés, distincts des dates de réalisation et d’acceptation.


## Lot fidélisation et affiches — 24 octobre

62 tests réussis, 0 échec et compilation réussie. Les promotions sont des affiches informatives : les conditions sont affichées sans modification automatique des prix du panier. Les jeux sont organisés par le restaurant sur inscription ; pas de moteur de mini-jeu automatique. Une éventuelle récompense en points peut être attribuée par l’administrateur avec justification. Trois affiches fictives sont proposées uniquement au lancement local d’une base de démonstration vide. Voir ENGAGEMENT.md.
