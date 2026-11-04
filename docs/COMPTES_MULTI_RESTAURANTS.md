# Connexion et restaurants - complément V5

## Ce que voit l’utilisateur

Un propriétaire peut se déconnecter et se reconnecter depuis `/login` : son e-mail et son mot de passe retrouvent son espace, puis l’interface le redirige vers `/r/son-slug/restaurant`. Le personnel reste autorisé uniquement dans son restaurant.

Un étudiant se connecte une fois puis arrive sur `/restaurants`. Il recherche un établissement et ouvre son menu. Le lien Restaurants permet de changer d’établissement ; la session est conservée. Les paniers sont déjà rangés séparément dans le navigateur par slug.

Si plusieurs anciens comptes valident le même e-mail et le même mot de passe, le serveur propose leurs espaces après validation des identifiants. L’utilisateur choisit un espace puis confirme la connexion. Aucune liste de comptes n’est révélée pour un mot de passe incorrect.

## Pourquoi une identité et des adhésions ?

Le compte étudiant original authentifie la personne. La première visite connectée dans un autre restaurant crée, si nécessaire, une adhésion technique liée par `users.student_identity_id`. Cette adhésion reste de rôle étudiant et possède son propre identifiant, son code de parrainage et ses relations métier. Les commandes et points existants restent donc séparés sans réécriture de leur historique.

Le profil personnel (nom, téléphone, adresse, photo et préférences) est synchronisé entre les adhésions de la même identité. Une réinitialisation demandée par le titulaire concerne l’identité et ses adhésions et révoque leurs sessions. La restriction d’envoi de récupération à l’adresse du responsable reste en place.

Les deux lignes ne sont pas deux connexions indépendantes : le mot de passe est vérifié sur l’identité originale, et la session désigne celle-ci. Désactiver cette identité ferme l’accès à ses adhésions. Une adhésion inactive reste bloquée dans son restaurant.

## Anciens comptes utilisant déjà le même e-mail

La migration ne fusionne pas les comptes sur la seule égalité de leur e-mail. Un conflit avec un ancien compte dans le restaurant choisi affiche un message explicite. Il faut utiliser les identifiants de cet ancien compte ou préparer séparément un rapprochement vérifié avec le responsable. Le personnel et les administrateurs ne sont jamais transformés automatiquement en étudiants ni promus par cette fonctionnalité.

## Fichiers et API

- M1 : `backend/sql/008_student_identity.sql`, colonne nullable et index. Migrations 001 à 007 conservées.
- M2 : navigation dans `frontend/src/components.jsx` et route dans `frontend/src/main.jsx`.
- M3 : `backend/src/student-identity.js`, `auth.js`, `restaurants.js`, formulaires `frontend/src/auth.jsx`, annuaire `restaurants.jsx` et information dans `student.jsx`.
- M7 : `backend/test/multi-restaurants.test.js` et adaptation de `restaurants.test.js`.
- `GET /api/restaurants` expose uniquement les informations publiques utiles aux cartes (nom, slug, adresse, horaires, images et chemin).
- `POST /api/auth/login` accepte les identifiants et éventuellement `accountId` choisi après validation. La réponse contient soit `accounts`, soit `user` et `path`.
- `GET /api/auth/me` résout l’adhésion étudiante du restaurant courant ; les requêtes du personnel restent limitées à leur restaurant.

## Validation et mise en ligne

103 tests passent sur une base en mémoire ; compilation réussie. Recette visuelle locale : arrivée sur l’annuaire, changement de restaurant sans reconnexion, ouverture du bon espace propriétaire depuis la connexion générale. Aucun débit ni envoi de mail réel pour ces contrôles.

La mise en ligne a été explicitement autorisée par le responsable après présentation du prototype isolé. La migration ajoute une colonne et deux index, sans supprimer ni fusionner de compte et sans réécrire de mot de passe existant. Conserver le service Render et sa base. En cas de retour au code V4, conserver les colonnes ajoutées ; ne pas effectuer de suppression de données pour revenir à l’ancienne version.

## Intégration du groupe

Appliquer V3 puis V4 puis le complément V5, dans cet ordre. Ne pas recopier une version de `auth.js`, `restaurants.js`, des formulaires ou des tests provenant de V3/V4 après V5. Les membres concernés relisent leurs fichiers et créent eux-mêmes leurs commits, avec une note transparente sur l’assistance et leurs vérifications réelles. Le complément V5 ne modifie pas les paramètres EasyPay, Resend ou DATABASE_URL.
