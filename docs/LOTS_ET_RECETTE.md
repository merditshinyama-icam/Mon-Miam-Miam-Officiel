# Lots et essais à réaliser par les membres

Le code initial a été produit avec l’assistant. Les membres doivent exécuter ces parcours, noter le résultat et comprendre le module avant de le présenter. Ne pas cocher une validation qui n’a pas été effectuée.

| Lot | Responsable | Où lire | Essai humain à effectuer |
| --- | --- | --- | --- |
| M1 | Joie Mphoko | database.js, app.js, scripts, workflow | Installer depuis l’archive, démarrer, arrêter, vérifier que les données sont conservées ; expliquer interface/API/base. |
| M2 | S.Joyce Moyemdjim | components.jsx, styles.css, assets | Comparer au Figma ; tester téléphone et ordinateur, six thèmes et modes ; signaler les écarts et préparer les affiches. |
| M3 | Ephrem Matuta | auth.js, security.js, auth.jsx, Profile | Inscrire un e-mail personnel, tester connexion/récupération locale/photo ; tenter une page non autorisée. |
| M4 | Andréa Nandu | orders.js, Menu et Cart | Commander sur place puis en livraison ; épuiser un article, vérifier le total et son historique. |
| M5 | Divin Mushanganya | Kitchen, Complaints, management.js | Préparer, servir/livrer ; proposer une réponse et vérifier sa confidentialité avant approbation. |
| M6 | E.Merdi Tshinyama | domain.js, paiements dans orders.js, Loyalty | Simuler échec/réussite, utiliser des points, annuler un panier non payé, parrainer un nouveau compte et vérifier un seul bonus. |
| M7 | J.Pascal Cirhuza | Stats, Staff, Settings, backend/test | Créer/désactiver un employé, modifier un prix, lire les statistiques, exécuter les tests et documenter les limites. |

## Parcours commun de démonstration

1. Lancer l’application et lire les accès de test dans `data/ACCES_DEMO_LOCAL.txt`.
2. Se connecter comme étudiant. Ajouter poulet et bissap. Livraison : 12 000 + 2 000 CDF ; avec 15 points, 11 000 CDF restent dus.
3. Créer la commande puis démarrer le paiement simulé. Simuler un échec ; vérifier l’absence de confirmation, puis recommencer avec une réussite.
4. Se déconnecter, se connecter comme employé et avancer les étapes jusqu’à la livraison.
5. Revenir comme étudiant, vérifier les 3 points gagnés (9 000 CDF d’articles réglés / 3 000) et publier un avis.
6. Déposer une réclamation. Employé : proposer une réponse. Étudiant : constater l’absence de brouillon visible. Gérant : approuver. Étudiant : lire la réponse.
7. Changer thème, mode et photo, enregistrer puis se reconnecter : vérifier la persistance.
8. Administrateur : consulter les statistiques et désactiver un employé de test.

Ces montants supposent les paramètres initiaux. Les données de test ne doivent pas être confondues avec des commandes du restaurant.

## Trace à ajouter après chaque essai

Date réelle, compte/rôle utilisé, scénario, résultat observé, capture utile, anomalie éventuelle, ticket Jira et nom du validateur. Chaque membre fait ses propres commentaires/revues depuis son compte. Ne pas déplacer artificiellement les dates ni attribuer à un membre une action de l’assistant.
