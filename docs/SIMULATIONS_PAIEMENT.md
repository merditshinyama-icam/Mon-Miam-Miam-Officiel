# Simulation intégrale du paiement et fidélité

Le parcours de démonstration couvre le panier, le paiement, la confirmation de commande, la cuisine, le service ou la livraison, la facture, la fidélité et les statistiques. Les pages de résultat restent lisibles après actualisation. Un lien de résultat ne crée jamais de simulation : seul un clic effectué par le propriétaire de la commande enregistre le résultat. La réussite marque la commande payée et confirmée, avec `is_simulated=true` et `payment_method=simulation` ; elle peut ensuite être préparée et honorée normalement. Les interfaces et les factures signalent leur caractère simulé.

## Activation

Sur le site étudiant déployé, `DEMO_PREVIEW=true` active la démonstration séparée, en conservant `PAYMENT_MODE=easypay-live` pour le véritable bouton EasyPay. La règle interdisant le mode de paiement global `demo` en production reste en place. Ne pas activer ce mécanisme de crédit pédagogique sur un futur restaurant commercial : les points de démonstration sont utilisables dans le solde de fidélité de ce projet.

## Points

Une réussite crédite `floor((sous-total − remise) / earnEvery)` points, hors livraison. Le serveur calcule le montant ; le navigateur ne peut pas choisir le nombre de points. Le crédit est identifié par `demo:payment:<commande>` et affiché comme « Paiement simulé » dans la fidélité. Un échec rapporte zéro point. Les clics répétés et les demandes simultanées ne créent pas plusieurs crédits. Une réussite ne peut pas ensuite être changée en échec. Une tentative échouée peut être suivie d’une réussite sur la même commande.

Si la commande est réellement payée puis honorée ultérieurement, sa récompense réutilise le gain déjà accordé : pas de double comptage. Le bonus de parrainage reste lié à la commande effectivement honorée. Les photos, prix, règles et autres comptes ne sont pas modifiés.

## Distinction avec EasyPay

La simulation ne contacte pas EasyPay et ne modifie pas les transactions du prestataire. Elle confirme la commande dans le parcours pédagogique et émet sa facture de démonstration ; elle ne constitue pas une preuve d’encaissement réel. Les tableaux de bord distinguent les montants réels et simulés. Un échec tardif EasyPay ne dégrade pas une commande déjà confirmée. Un paiement EasyPay réel vérifié ultérieurement rapproche cette même commande et sa facture, sans réinitialiser son avancement ni doubler le chiffre d’affaires ou les points. La transaction marchande demeure vérifiée par les mécanismes habituels d’IPN et de rapprochement.

Le mode `demo` local existant conserve son circuit de commandes fictives ; sa simulation accorde désormais également les points immédiatement et utilise les mêmes pages de résultat. Le service de la commande ne les crédite pas une seconde fois.

## Fichiers

- `backend/sql/011_payment_simulations.sql` : résultats persistants, une ligne par commande.
- `backend/sql/012_cash_invoices.sql` : nature du règlement, factures et reprise unique des anciens résultats positifs non annulés.
- `backend/src/settlements.js` : confirmation commune et instantané de facture.
- `backend/src/payment-simulations.js` : accès protégé, calcul des points et enregistrement atomique.
- `backend/src/domain.js` : absence de double récompense lors d’un service ultérieur.
- `frontend/src/payment-simulation.jsx` et `.css` : actions et pages responsive, compatibles avec les thèmes.
- `backend/test/payment-simulations.test.js` : échec, réussite, répétitions, concurrence, droits et conservation des données EasyPay.
- `backend/test/cash-decision.test.js` : service intégral, statistiques, factures, reprise idempotente et rapprochement réel après simulation.

Routes : `POST /api/orders/:id/simulation` avec `outcome=paid|failed`, `GET /api/orders/:id/simulation` pour la lecture ; page `/payment/:id/simulation`. Une session étudiante du restaurant concerné et la propriété de la commande sont obligatoires. Une commande annulée ou déjà réglée réellement ne reçoit pas de simulation. Une réussite simulée peut être relue ou répétée sans nouvel effet.
