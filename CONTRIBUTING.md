# Contribuer au projet

1. Prendre connaissance de son lot dans `docs/LOTS_ET_RECETTE.md` et du ticket Jira correspondant.
2. Créer une branche depuis le dépôt réel, par exemple `MMM-28-preparation-commandes`. Ne pas partager les mots de passe des comptes.
3. Faire une modification compréhensible : correction, amélioration, test ou documentation après essai réel. Exécuter `npm run check` et `npm run format`.
4. Ouvrir une pull request, décrire le résultat et les vérifications. Citer le ticket Jira. Le relecteur prévu dans la répartition réalise sa revue avec son propre compte.
5. Ajouter le lien de la pull request et la preuve d’essai au ticket. Marquer « Terminé » seulement après validation réelle.

Le travail initial produit avec Codex est indiqué dans le README. Ne pas changer l’auteur des commits, inventer des réunions, antidater des activités ou attribuer des clics de l’assistant aux membres. Les dates prévues des livrables restent distinctes des dates réelles.

Les fichiers `.env`, `data/`, les mots de passe et les clés EasyPay ne doivent jamais être ajoutés à Git. L’archive de code source exclut également ces éléments.
