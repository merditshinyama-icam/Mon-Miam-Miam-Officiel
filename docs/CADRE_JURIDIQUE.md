# Cadre juridique - démonstration étudiante

Situation du 27 octobre 2026.

## Périmètre retenu et identité

Cette version est une démonstration de cours destinée aux étudiants, adaptée à la RDC. Mon Miam Miam est le nom du projet ; il ne constitue pas une société immatriculée revendiquée. Le groupe est identifié ci-dessous. Le point de contact opérationnel est E.Merdi Tshinyama : merdi.tshinyama@2030.ulc-icam.com. La préparation technique et documentaire est assistée par Codex. La publication d’un nom ne prouve pas que son titulaire a réalisé ou relu chaque fichier.

## Conditions utilisables pour la démonstration

Le visiteur utilise une adresse qui lui appartient et garde ses accès personnels. Les actions simulées n’entraînent ni encaissement ni livraison réelle. Les montants sont affichés en CDF avec récapitulatif avant validation. La commande est calculée au serveur. L’état INIT n’atteste pas un paiement. En mode réel, le visiteur déclenche lui-même EasyPay et valide sur son téléphone. Le projet ne collecte aucun PIN Mobile Money.

## Annulation, réclamations et fidélité

L’annulation autonome est limitée aux commandes non payées dans un état autorisé. Aucun remboursement automatique d’une commande payée n’est promis. Le restaurant et le prestataire doivent traiter une demande avec sa référence. Les réclamations passent par l’aide du site ou le contact du projet. Une réponse du personnel peut nécessiter une validation. Les points ne sont pas une monnaie retirable : seuils, taux et expiration dépendent des paramètres affichés. Le bonus de parrainage requiert une première commande éligible payée puis servie/livrée ; il ne doit pas être crédité deux fois.

## Données et usages réellement prévus

Le compte comprend nom, e-mail, téléphone, mot de passe haché, préférences et éventuellement photo et adresse. Les commandes, paiements, points, avis, réclamations et participations permettent les parcours choisis. Le classement public dépend du choix de visibilité du nom. Les images sont réencodées sans métadonnées avant leur stockage. Les données ne doivent pas être réutilisées pour une publicité ou une vente de fichiers. Les données fictives sont à privilégier pour les répétitions.

## Destinataires, transfert et sous-traitants

Le personnel accède selon ses droits aux informations utiles. Render héberge application et PostgreSQL dans la région de Francfort : il s’agit d’un hébergement hors RDC. Resend reçoit seulement l’adresse autorisée du responsable et le lien temporaire de récupération. EasyPay reçoit les données de paiement nécessaires lorsque le visiteur déclenche une demande réelle. Vercel héberge la maquette statique avec des données fictives ; ne pas y importer une copie de la base ou les secrets Render. Les fournisseurs peuvent traiter des journaux techniques selon leurs propres conditions.

## Cookies et sécurité

Le cookie HttpOnly de session sert à la connexion. Le panier et les préférences sont conservés sur l’appareil ; aucun traceur publicitaire ou analytique tiers n’est intégré volontairement. Le chiffrement HTTPS protège le transport, sans rendre une application invulnérable. Les contrôles comprennent validation serveur, rôles, isolation du restaurant, limite de tentatives et requêtes SQL paramétrées. Les clés doivent être conservées dans les variables privées. Les captures de recette doivent masquer les liens de récupération et les secrets.

## Conservation : mesures présentes et procédure

Les sessions expirent après sept jours ; les liens de récupération après trente minutes. Les points expirés ne sont plus disponibles mais leur historique reste conservé. Le retrait du personnel désactive l’accès sans effacer toutes ses traces. Il n’existe pas de purge automatique générale. À la fin de la recette, le groupe doit identifier les données nécessaires à l’évaluation, anonymiser les exports de preuve et supprimer les données personnelles de démonstration devenues inutiles après accord du responsable. Un point de contrôle est à planifier avant le 22 novembre 2026, date d’expiration annoncée de la base gratuite. Ne pas confondre cette échéance technique avec une politique légale de conservation.

## Traitement d’une demande de droits

Recevoir la demande à l’adresse du projet depuis l’adresse du compte. Accuser réception manuellement et relever la date, la portée et le restaurant concerné. Vérifier l’identité avec une méthode proportionnée, sans demander de PIN ou mot de passe. Déterminer ce qui peut être corrigé au profil, exporté, anonymisé ou supprimé et expliquer une éventuelle conservation nécessaire. Faire une sauvegarde autorisée si une opération est requise, limiter les accès et vérifier le résultat. Répondre au demandeur puis conserver une trace minimale de clôture. Ces opérations sont manuelles ; aucun bouton d’effacement universel n’est revendiqué.

## Incident et contenu contesté

En cas d’exposition d’une clé : limiter son accès, révoquer ou remplacer la clé chez son fournisseur, vérifier les usages et ne pas publier le secret dans un ticket. En cas de donnée ou image contestée : suspendre sa publication si nécessaire, examiner l’autorisation et traiter la demande avec le responsable. Consigner faits, dates, périmètre et décisions, sans inventer de notification envoyée. Évaluer les obligations de notification avec un interlocuteur juridique compétent.

## Images et propriété intellectuelle

Les cinq photographies de démonstration proviennent de Pexels et leurs auteurs, URLs et transformations figurent dans docs/CREDITS_IMAGES.md. Elles illustrent des plats et un décor : elles ne prouvent ni la recette exacte ni l’existence d’un établissement. Conserver les crédits dans le dépôt et le livrable. La licence autorise de nombreuses utilisations mais conserve ses restrictions ; aucune caution des photographes n’est impliquée. Pour une photo personnelle importée, la personne qui la fournit doit disposer des droits nécessaires et éviter la publication de tiers identifiables sans accord.

## Vérifications nécessaires avant exploitation ouverte

Désigner l’exploitant réel et compléter son identité, adresse de service, statut et immatriculations applicables ; ne pas inventer un RCCM, un numéro fiscal ou une adresse. Vérifier les formalités de traitement et les conditions d’hébergement/transfert hors RDC auprès de l’autorité compétente. Faire confirmer les conditions marchandes EasyPay, remboursements, preuve de paiement et assistance. Définir des durées adaptées aux commandes réelles et obligations comptables, une procédure de purge et des sauvegardes testées. Vérifier les contrats fournisseurs et l’information/consentement requis. La case de lecture présente dans le formulaire n’est pas une preuve complète de consentement historisée : si cette preuve est requise, implémenter et tester son enregistrement versionné avant ouverture commerciale.

## Références et limites

Référence principale : ordonnance-loi n° 23/010 du 13 mars 2023 portant Code du numérique, publiée par l’ARE. Les articles 192-193 encadrent le traitement et l’information ; l’article 201 prévoit des conditions spécifiques pour le transfert hors RDC. Il faut vérifier les démarches applicables et ne pas déduire une autorisation du seul recours à un prestataire international. Ce document organise le travail du groupe ; il n’atteste ni autorisation administrative obtenue, ni consultation juridique effectuée, ni conformité commerciale acquise.

Source officielle : https://are.gouv.cd/download/ordonnance-loi-23-010-du-13-mars-portant-code-du-numerique/
