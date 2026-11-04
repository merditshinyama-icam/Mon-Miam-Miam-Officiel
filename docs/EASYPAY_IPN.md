# EasyPay Mobile Money et IPN

Documentation officielle consultée le 23 octobre 2026 : https://developper.e-com-easypay.com/

## État de l’intégration

L’adaptateur Mobile Money et l’IPN sont implémentés et testés avec un faux fournisseur local. Aucun paiement réel et aucun test réseau authentifié EasyPay n’ont été effectués. À la demande explicite du propriétaire, le token est traité comme un identifiant opaque : ses champs JWT non vérifiés ne constituent plus un refus local. Seule une réponse d’EasyPay permettra d’établir son acceptation. Les identifiants fournis sont configurés uniquement dans les variables privées Render, jamais dans le dépôt ou les archives.

- POST `https://www.e-com-easypay.com/{sandbox|v1}/mobile-money/payment?cid=…&token=…`
- POST `https://www.e-com-easypay.com/{sandbox|v1}/payment/{reference}/checking-payment`
- IPN de notre application : POST `/api/payments/easypay/ipn`.

L’application est déployée et vérifiée sur Render. URL IPN : `https://mon-miam-miam-rdc.onrender.com/api/payments/easypay/ipn` (POST). L’URL a été enregistrée dans l’espace marchand, avec confirmation « IPN mis à jour avec succès ». Le mode visé est easypay-sandbox, avec les identifiants privés fournis par le propriétaire. Aucun paiement réel n’est activé ; l’acceptation du token et la recette fournisseur restent à vérifier.

## Configuration privée

`PAYMENT_MODE` : `disabled`, `demo` (local uniquement), `easypay-sandbox`, `easypay-live`.
`EASYPAY_TOKEN`, `EASYPAY_CORRELATION_ID` : variables privées côté serveur, sans préfixe VITE_.
`EASYPAY_RESTAURANT_ID` : identifiant du seul restaurant bénéficiaire du compte marchand (défaut : mon-miam-miam-kinshasa). Les autres restaurants ont le paiement désactivé.

Le serveur utilise exclusivement la devise CDF et le total qu’il a lui-même calculé. Le numéro +243 est converti aux neuf chiffres attendus par l’API. Le nom du client est transmis ; son e-mail facultatif n’est pas transmis. Aucun PIN n’est collecté. Les secrets sont placés dans les variables privées Render, jamais dans GitHub/Jira ou le navigateur client.

## Confirmation et cohérence

Chaque tentative a une référence marchande distincte, alphanumérique. Une seule tentative en attente par commande. Le fournisseur est appelé hors transaction SQL après enregistrement de la tentative. Les appels réseau ont un délai limite de 20 secondes et interdisent les redirections.

L’IPN ne nécessite pas de session ni d’en-tête de navigateur. Son statut n’est jamais accepté comme preuve : le backend recherche une tentative connue et revérifie sa référence auprès de l’API HTTPS EasyPay. Les références de transaction, de commande et de paiement doivent toutes correspondre. Si le fournisseur renvoie montant/devise, ils sont également contrôlés ; la documentation actuelle du checking ne garantit pas leur présence.

SUCCESS confirme la commande ; CANCELED et DECLINED font échouer la tentative. Les statuts inconnus ne confirment rien. Un succès déjà enregistré ne peut pas être rétrogradé, et une notification répétée n’accorde pas de points supplémentaires. La fidélité reste créditée uniquement après le service/livraison.

En cas de timeout ou réponse illisible, la tentative reste en attente/incertaine : aucune relance automatique, aucune annulation. Si la référence a été obtenue, le client peut demander une vérification depuis la page de paiement. Si aucune référence n’a été obtenue, il faut une vérification dans l’espace marchand avant toute nouvelle demande. Une notification arrivée avant l’enregistrement de la référence reçoit 503 ; ne présumez pas qu’EasyPay la renverra automatiquement, utilisez la vérification manuelle si nécessaire.

La documentation publique ne décrit pas de signature IPN. Notre contrôle repose sur la relecture auprès du fournisseur ; faire confirmer ce contrat et les moyens de récupérer une référence après timeout par EasyPay avant l’usage réel. Aucun mécanisme de remboursement n’est implémenté.

## Recette avant activation réelle

1. Obtenir des identifiants sandbox valides et les numéros de test officiels auprès d’EasyPay.
2. Déployer, vérifier `/api/health`, configurer l’IPN dans l’espace marchand.
3. Activer `easypay-sandbox` et tester attente, réussite, refus, notification répétée, interruption réseau et vérification manuelle.
4. Vérifier le montant CDF, la référence du compte bénéficiaire et les journaux marchand.
5. Activer `easypay-live` seulement après cette recette. Un essai réel se fait avec l’utilisateur qui valide lui-même sur son téléphone.


## Disponibilité avant commande

En mode disabled, une commande dont le total reste supérieur à zéro est refusée dès sa création : aucune réservation de points et aucun enregistrement d’une commande impossible à payer. Le panier conserve ses articles et explique l’indisponibilité. Les commandes à total zéro restent possibles avec les contrôles habituels de solde et de validité des points.


## Vérification de l’espace marchand — 23 octobre 2026

La lecture locale des champs du token avait motivé un blocage conservateur. Ce blocage est supprimé à la demande du propriétaire : il ne prouvait pas que le fournisseur refusait la clé. Les identifiants fournis sont maintenant utilisés tels quels, côté serveur uniquement, sans régénération et sans demande de débit.

La documentation intégrée au compte précise une référence marchande unique de 6 à 16 caractères alphanumériques. Les nouvelles tentatives utilisent désormais 16 caractères hexadécimaux aléatoires, et le client contrôle cette borne avant le réseau.

Deux points doivent être clarifiés avec EasyPay avant la recette fournisseur :
- L’espace marchand mentionne checking-status, tandis que la documentation publique developper.e-com-easypay.com mentionne checking-payment. L’adaptateur reste aligné sur la documentation publique (checking-payment) ; aucun succès réel n’est revendiqué.
- Le lien « Voir la documentation officielle » de l’espace marchand, sandbox-developper.e-com-easypay.com, a renvoyé un site PCE-Core et pas une documentation EasyPay lors de la vérification. Aucun secret n’a été transmis à ce site et il n’est pas utilisé par l’adaptateur.

À la demande du propriétaire, le callback marchand a été remplacé par https://mon-miam-miam-rdc.onrender.com/api/payments/easypay/ipn, avec confirmation de réussite. Les numéros de test sandbox et le contrat de vérification en vigueur doivent être confirmés avec EasyPay. Aucune demande de paiement n’a été envoyée pour tester la clé.
