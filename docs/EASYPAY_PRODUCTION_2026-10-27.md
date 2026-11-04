# EasyPay : production et diagnostic des refus

Changement demandé par Merdi le 27 octobre 2026, préparé avec Codex.

La documentation publique consultée le 27 octobre indique `v1` pour la production et `sandbox` pour le développement : https://developper.e-com-easypay.com/ (API paiement par Mobile money).

Sur le service Render existant `mon-miam-miam-rdc`, `PAYMENT_MODE=easypay-live` sélectionne :

- POST `https://www.e-com-easypay.com/v1/mobile-money/payment` ; identifiants marchands dans les paramètres `cid` et `token`, exclusivement côté serveur.
- POST `https://www.e-com-easypay.com/v1/payment/{reference}/checking-payment` pour vérifier la réponse.
- IPN inchangée : `https://mon-miam-miam-rdc.onrender.com/api/payments/easypay/ipn`.

Le numéro transmis contient neuf chiffres, sans zéro initial ni indicatif pays. Les identifiants sont débarrassés des espaces accidentels au début et à la fin. Leur validité reste décidée par EasyPay ; aucun changement de clé ni contournement de contrôle n'est effectué.

## Refus initial

Le message signalé correspond à une réponse EasyPay `code: 0`. L'ancien adaptateur supprimait le champ `message` documenté par EasyPay : le motif précis de cette tentative ne peut pas être reconstitué à partir de ce message seul. Le mode Render observé avant modification était `easypay-sandbox` ; cela ne prouve pas à lui seul la cause du refus.

Le correctif traduit les motifs reconnus en catégories fixes : identifiants, compte marchand, téléphone, montant/devise ou référence. Il retourne une explication adaptée et journalise uniquement la catégorie dans l'audit métier. Aucun message brut du fournisseur, URL avec identifiants, numéro ou clé n'est publié. Un motif inconnu reste générique. Aucun changement automatique de mode ni nouvelle tentative automatique n'est réalisé. Un résultat incertain reste en attente pour prévenir un double débit.

## Vérification

Cinq nouveaux tests isolés contrôlent les routes v1, le format du téléphone, les refus et l'absence de fuite des données. La référence locale complète, incluant les sept tests complémentaires M6 du 26 octobre, a réussi 82 tests et la compilation. La branche de référence d'Andréa ne contient pas ces sept tests supplémentaires : son nombre de tests après ce correctif peut être différent.

Le déploiement et le mode réellement exposé sont à confirmer sur Render après publication. Aucun paiement réel n'est initié par cette vérification. Le propriétaire déclenche lui-même un essai et valide sur son téléphone ; la mise en production ne constitue pas une preuve d'acceptation des clés ou de réussite d'un paiement.

Les boutons d'aperçu positif/négatif restent fictifs et n'acquittent jamais une commande réelle. Les variables privées, la base PostgreSQL et la configuration Resend sont conservées.


## Complément du 4 novembre 2026

Le parcours hébergé est ajouté en complément du Mobile Money direct. Voir [Paiement par le portail EasyPay](EASYPAY_PORTAIL_2026-11-04.md) pour les endpoints, les adaptations M3/M4 nécessaires au paiement, les 109 tests locaux et les limites des preuves. Une transaction INIT reste distincte d’un paiement confirmé.
