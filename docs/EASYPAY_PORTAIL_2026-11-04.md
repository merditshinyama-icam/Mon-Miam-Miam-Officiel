# M6 — Paiement par le portail EasyPay

E.Merdi Tshinyama · Groupe 1 · ULC-Icam · X2 · 4 novembre 2026

## Pourquoi ajouter ce parcours

Le paiement Mobile Money direct reste implémenté. Le portail hébergé devient le choix proposé par défaut afin de comparer les deux parcours officiels EasyPay et de laisser le fournisseur gérer la sélection de l'opérateur et la saisie du numéro.

Le 4 novembre, la version de référence d'Andréa déployée sur Render (`5dcf92e`) a reçu `code: 0`, `message: "Prefix not found."`. Le tableau marchand montre la transaction 189881, référence commande `6bb65c0381ced42e`, pour 11 000 CDF, en `INIT`. Le format du numéro et l'URL d'API directe concordent avec la documentation publique. Ces constats orientent l'investigation vers le routage du préfixe ou l'activation marchande chez EasyPay, sans démontrer leur cause interne.

L'arrivée sur le portail et un enregistrement marchand prouvent les étapes effectivement atteintes. Ni `INIT`, ni un HTTP 200, ni une URL de retour « success » ne prouvent un paiement réussi ou une absence totale de défaut côté intégration. Une confirmation du fournisseur reste nécessaire pour attribuer définitivement la cause du refus.

## Parcours livré

1. L'étudiant choisit « Sur le portail EasyPay », puis « Continuer sur le portail EasyPay ».
2. Le serveur vérifie le propriétaire de la commande, le restaurant, son montant et l'absence d'une tentative en attente. Le navigateur ne fixe jamais le montant ni les URLs de retour.
3. Le serveur appelle `POST https://www.e-com-easypay.com/v1/payment/initialization?cid=…&token=…`, avec les clés privées de Render. En sandbox explicite uniquement, `v1` est remplacé par `sandbox`.
4. Le JSON contient `order_ref`, `amount`, `currency: "CDF"`, `customer_name`, `description`, `language: "FR"`, `channels: [{"channel":"MOBILE MONEY"}]` et les trois URLs de retour. L'exemple officiel utilise le champ `channels` au pluriel.
5. Après `code: 1` et une référence valide, le navigateur va sur `https://www.e-com-easypay.com/v1/payment/initialization?reference=…`. Cette URL ne contient ni token ni Correlation ID.
6. Sur le portail, l'utilisateur choisit son opérateur et confirme sur son téléphone. Le parcours direct reste disponible dans la liste de choix.
7. Les retours succès, annulation et erreur reviennent sur la commande et affichent un avertissement de vérification. Aucun paramètre d'URL ne change son statut.
8. Le bouton de vérification ou l'IPN entraîne une consultation serveur de `payment/{reference}/checking-payment`. Seule une réponse cohérente `SUCCESS` confirme la commande. Une annulation/erreur vérifiée est traitée comme échec.

Une tentative en attente est réutilisée. « Reprendre sur le portail EasyPay » retrouve la même référence, y compris après rechargement. Une réponse incertaine ne provoque aucune nouvelle initialisation automatique. Les aperçus fictifs restent sans effet sur les paiements réels.

## Configuration et données

- `PAYMENT_MODE=easypay-live`, `EASYPAY_TOKEN`, `EASYPAY_CORRELATION_ID` et `EASYPAY_RESTAURANT_ID` restent privés sur Render.
- `APP_ORIGIN` ou `RENDER_EXTERNAL_URL` doit désigner l'origine HTTPS publique correcte pour les retours. Le chemin de restaurant est conservé pour les établissements secondaires.
- IPN inchangée : `https://mon-miam-miam-rdc.onrender.com/api/payments/easypay/ipn`.
- Aucun nouveau schéma ni migration : la référence et le montant utilisent les colonnes existantes ; `operator=easypay-portal` identifie le parcours hébergé.
- Resend, les comptes, les commandes et la base existante sont conservés. Aucun secret dans les sources ou ce document.

## Fichiers concernés et intégration entre membres

| Fichier | Rôle |
| --- | --- |
| backend/src/easypay-client.js | Initialisation hébergée officielle, identifiants serveur et refus filtrés. |
| backend/src/easypay.js | Tentative unique, URL du portail reconstruite sur un domaine fixe et réconciliation existante. |
| backend/src/orders.js | Contrat `{flow:"portal"}` et restitution de la reprise, sans exposer les données privées du paiement. |
| frontend/src/student.jsx | Choix du parcours, redirection, reprise et information au retour. |
| backend/test/easypay-portal.test.js | Tests du contrat et du parcours serveur. |

Les adaptations de `orders.js` (M4) et `student.jsx` (M3) font partie de ce complément de paiement M6. Lors de la fusion des autres lots, conserver à la fois leurs fonctionnalités et ces adaptations. Si Git signale un conflit d'ajout sur un de ces fichiers, comparer les versions ; ne pas recopier aveuglément une ancienne version V5 sur le parcours portail. La branche M6 reste un lot de contribution : les tests complets nécessitent le socle assemblé.

## Vérifications et recette à consigner

L'assemblage local complet avec ce complément passe 109 tests et la compilation. Les six nouveaux tests vérifient les modes production/sandbox, les retours sans secrets, la reprise idempotente, les contrôles d'accès et de paramètres, les IPN non fiables, l'annulation et le timeout. Le fournisseur y est simulé : ces tests ne constituent pas une transaction réseau réelle.

La recette réelle doit consigner séparément : référence de la commande, création locale, code d'initialisation reçu, référence EasyPay, ouverture du portail, état marchand, éventuel message fournisseur, vérification serveur et statut final. Masquer les secrets et les informations de portefeuille sur les captures partagées. L'utilisateur effectue lui-même l'étape de paiement et sa confirmation ; ne pas multiplier les tentatives pour produire une preuve.

Si le portail retourne lui aussi un refus après une initialisation acceptée, transmettre ces références et le message exact au support pour confirmer l'origine. Le diagnostic observé avant ce changement est conservé comme constat daté, pas comme résultat d'une recette du nouveau portail.

Source officielle : https://developper.e-com-easypay.com/ — initialisation, redirection, vérification de transaction et IPN ; consultation le 4 novembre 2026.
