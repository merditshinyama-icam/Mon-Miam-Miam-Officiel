# Affiches, inscriptions et corrections de points

Implémentation du 24 octobre 2026. Le jalon de fidélisation reste prévu au 26 octobre ; l’acceptation humaine n’est pas anticipée.

## Pour l’administrateur

Dans **Affiches**, créer une promotion, un événement ou un jeu. Renseigner le titre, les conditions, les dates et, pour les événements/jeux, le nombre de places éventuel. Les dates du formulaire utilisent le fuseau de l’appareil ; la consultation indique les heures de Kinshasa. Choisir une photo de démonstration ou importer une affiche JPEG/PNG/WebP de 3 Mo maximum. Le serveur réencode les images sans métadonnées et refuse les images distantes.

Laisser décoché « Publier pour les étudiants » pour conserver un brouillon. Une affiche publiée apparaît dans **Rendez-vous**, tant que sa date de fin n’est pas atteinte, et un lien est présenté sur l’accueil. Les dates futures restent visibles pour préparer les inscriptions. Retirer une affiche la masque mais conserve les inscrits. Les participants sont visibles uniquement par l’administrateur du restaurant.

Une promotion est une affiche informative : elle ne déclenche aucune remise automatique. Le prix du panier est celui du menu. Les jeux sont animés par le restaurant, sans tirage ni moteur de mini-jeu en ligne. Préciser les règles, conditions et récompenses sur l’affiche.

Dans **Points**, rechercher un étudiant par son nom ou son e-mail, le sélectionner et saisir un nombre positif (crédit) ou négatif (retrait), accompagné d’une justification d’au moins 10 caractères. La correction est limitée à 10 000 points par demande. Un retrait ne peut dépasser le solde disponible et ne modifie pas les points réservés sur une commande. La durée d’expiration d’un crédit suit les paramètres du restaurant.

## Pour l’étudiant

Ouvrir **Rendez-vous** (dans le menu ⋯ sur téléphone), filtrer les affiches et choisir « Je participe ». Seuls les comptes étudiants peuvent s’inscrire ; aucun paiement n’est demandé. Une seconde demande ne crée pas de doublon. Les places sont vérifiées au serveur, y compris en cas de demandes simultanées. « Annuler mon inscription » libère une place.

Dans **Fidélité**, consulter les corrections de la direction et leurs justifications. Les lots crédités et leur expiration restent distincts de l’historique des corrections afin de ne pas compter deux fois un même crédit.

## Données et contrôles

Migration réexécutable : backend/sql/006_engagement.sql. Tables announcements, participations et point_adjustments. Toutes les lectures et écritures sont limitées au restaurant de la session. Les brouillons, les coordonnées des inscrits et la recherche d’étudiants ne sont pas publics. Les corrections et changements d’affiches sont journalisés dans audit_log. Une clé de demande protège les corrections contre la double soumission.

La démonstration locale ajoute trois affiches fictives uniquement si les comptes de démonstration sont présents et qu’aucune affiche n’existe déjà. Aucun exemple ni compte local n’est exporté vers Render.

## Recette

62 tests automatiques réussis et compilation réussie. Dix scénarios supplémentaires vérifient les droits, les brouillons et échéances, les dates et capacités, la concurrence sur la dernière place, les inscriptions idempotentes, la confidentialité des participants, l’import d’affiche, l’archivage, les crédits/retraits et leur audit, la protection des points réservés et la séparation des restaurants.

Essais navigateur sur une base locale isolée : création de deux affiches, publication, inscription et annulation, crédit de 5 points avec passage de 45 à 50, justification affichée côté étudiant. Vérification à 390 × 844 : aucun débordement horizontal, navigation fixée en bas. Les captures se trouvent dans Livrables/05_Recette. La validation par les sept membres reste attendue.
