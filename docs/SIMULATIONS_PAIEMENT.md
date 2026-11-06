# Simulation du résultat et fidélité

Les boutons de démonstration ouvrent une page de résultat enregistrée côté serveur : réussite ou échec, montant, récapitulatif, points gagnés, solde et actions suivantes. Le résultat reste lisible après actualisation. Un lien de résultat ne crée jamais de simulation : seul un clic de confirmation effectué par le propriétaire de la commande enregistre le résultat.

## Activation

Sur le site étudiant déployé, `DEMO_PREVIEW=true` active la démonstration séparée, en conservant `PAYMENT_MODE=easypay-live` pour le véritable bouton EasyPay. La règle interdisant le mode de paiement global `demo` en production reste en place. Ne pas activer ce mécanisme de crédit pédagogique sur un futur restaurant commercial : les points de démonstration sont utilisables dans le solde de fidélité de ce projet.

## Points

Une réussite crédite `floor((sous-total − remise) / earnEvery)` points, hors livraison. Le serveur calcule le montant ; le navigateur ne peut pas choisir le nombre de points. Le crédit est identifié par `demo:payment:<commande>` et affiché comme « Paiement simulé » dans la fidélité. Un échec rapporte zéro point. Les clics répétés et les demandes simultanées ne créent pas plusieurs crédits. Une réussite ne peut pas ensuite être changée en échec. Une tentative échouée peut être suivie d’une réussite sur la même commande.

Si la commande est réellement payée puis honorée ultérieurement, sa récompense réutilise le gain déjà accordé : pas de double comptage. Le bonus de parrainage reste lié à la commande effectivement honorée. Les photos, prix, règles et autres comptes ne sont pas modifiés.

## Distinction avec EasyPay

La simulation séparée ne contacte pas EasyPay, n’écrit aucun statut payé dans sa transaction et ne confirme pas la commande réelle. Elle ne constitue pas une preuve d’encaissement et ne débloque pas une préparation réelle. La page le précise explicitement. La transaction marchande demeure vérifiée par les mécanismes habituels d’IPN et de rapprochement.

Le mode `demo` local existant conserve son circuit de commandes fictives ; sa simulation accorde désormais également les points immédiatement et utilise les mêmes pages de résultat. Le service de la commande ne les crédite pas une seconde fois.

## Fichiers

- `backend/sql/011_payment_simulations.sql` : résultats persistants, une ligne par commande.
- `backend/src/payment-simulations.js` : accès protégé, calcul des points et enregistrement atomique.
- `backend/src/domain.js` : absence de double récompense lors d’un service ultérieur.
- `frontend/src/payment-simulation.jsx` et `.css` : actions et pages responsive, compatibles avec les thèmes.
- `backend/test/payment-simulations.test.js` : échec, réussite, répétitions, concurrence, droits et conservation des données EasyPay.

Routes : `POST /api/orders/:id/simulation` avec `outcome=paid|failed`, `GET /api/orders/:id/simulation` pour la lecture ; page `/payment/:id/simulation`. Une session étudiante du restaurant concerné et la propriété de la commande sont obligatoires. Une commande annulée ou déjà payée ne reçoit pas de nouvelle simulation.
