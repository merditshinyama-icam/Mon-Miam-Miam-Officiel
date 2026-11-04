# Changements du 23 octobre 2026

## Réclamations — actions selon le rôle

- Employé : « Proposer au gérant » transmet une réponse interne pour validation.
- Gérant : « Proposer à l’administrateur » transmet la réponse à la direction ; « Valider et publier » publie directement la réponse saisie ou celle proposée par un employé.
- Administrateur : « Valider et publier » permet de répondre directement ou de valider une proposition du gérant.

Une proposition déjà transmise à l’administrateur ne peut plus être modifiée ou validée par un gérant/employé avant sa décision. La réponse reste invisible à l’étudiant jusqu’à publication. Une demande de révision permet ensuite une nouvelle rédaction.

La migration `002_complaint_review_role.sql` ajoute le rôle validateur et conserve les réclamations existantes, attribuées par défaut au circuit de validation du gérant. Les nouvelles actions et interdictions sont couvertes par les tests de l’API. Total après cette correction : 26 tests réussis.

## Restaurants, administrateurs et gérants

Ajout de l’inscription « Créer mon restaurant », du compte administrateur propriétaire, des liens clients séparés, de la personnalisation des visuels/textes/contacts/palette et de la création de gérants par l’administrateur. L’inscription étudiante reste distincte. Les images sont contrôlées et transformées côté serveur. La migration 003 conserve les espaces, utilisateurs et données existants.

Neuf tests supplémentaires couvrent cette création transactionnelle, les identifiants déjà pris, les comptes homonymes, l’isolation des sessions/catalogues/commandes/paramètres, les droits des gérants, les images et la récupération propre au restaurant. Total : 35 tests réussis.

Recette navigateur effectuée sur le restaurant fictif « La Table du Campus · Recette » : création du propriétaire administrateur avec trois images, modification et persistance des textes/palette, création d’un gérant, connexion de ce gérant et consultation des pages client personnalisées. Le format mobile de la connexion ne déborde pas horizontalement à 390 pixels. Les comptes du restaurant Mon Miam Miam ont été conservés.
