# Version 0.2 — 24 octobre 2026

Compléments : adresse de livraison dans le profil, sélection du plat du jour, retrait réversible du personnel et révocation des sessions, statistiques de fidélité/parrainage, affiches, coordonnées de l’équipe, récupération par Resend et aperçus visuels de réponse EasyPay.

Validation locale : **70 tests réussis, zéro échec**, compilation React réussie. Le relevé est livré dans `Livrables/05_Recette/tests-complements-2026-10-24.txt`.

La branche `integration/complements-cahier` porte la proposition : https://github.com/andreanandu0925-bit/Mon_miam_miam/pull/1. Les sept branches `collab/m1-socle`, `collab/m2-interface`, `collab/m3-comptes`, `collab/m4-commandes`, `collab/m5-operations`, `collab/m6-easypay`, `collab/m7-statistiques` sont préparées. Les membres doivent synchroniser l’intégration, réaliser leurs essais et changements puis pousser et faire relire leurs propres contributions. Les paquets ne constituent pas la preuve d’une action humaine.

Render utilise la branche d’intégration pour la démonstration, avec les clés privées hors dépôt. Resend est en test : `MAIL_FROM=onboarding@resend.dev`, réponse au contact M6, destinataire limité par `MAIL_TEST_RECIPIENT`. Aucun domaine n’est vérifié. La réception d’un lien reste à confirmer.

EasyPay reste en sandbox ; IPN : https://mon-miam-miam-rdc.onrender.com/api/payments/easypay/ipn. Aucun débit fournisseur réussi n’est revendiqué. Les aperçus positif/négatif n’altèrent pas la transaction réelle.

Maquette interactive : https://mon-miam-miam-maquette.vercel.app/. Les interactions natives Figma restent à finaliser : le connecteur n’a pas obtenu les droits d’édition du fichier existant.

Les documents académiques sont livrés en LaTeX et PDF : dossier professionnel, support de soutenance et fiches des sept lots. Les dates d’acceptation prévues restent celles de la roadmap, même quand le code est produit en avance. Recette humaine, revue des membres et essais fournisseur restent nécessaires.
