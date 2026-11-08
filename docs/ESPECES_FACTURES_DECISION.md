# Espèces, factures et aide à la décision

## Encaissement en espèces

Le client choisit les espèces dans le panier ou avant une tentative Mobile Money. Sa commande reste en attente. La cuisine dispose d’une file « Espèces à valider », avec le client, le numéro et le montant dû. Un employé, le gérant ou l’administrateur saisit le montant effectivement reçu et confirme la réception. Le serveur exige le total exact et conserve le validateur, la date et un événement d’audit. La validation confirme la commande et émet une facture ; une répétition ne crée pas de second règlement.

Le client ne peut pas se déclarer payé. Une commande annulée, déjà payée autrement ou sans demande d’espèces ne peut pas être encaissée par cette action. Une demande EasyPay en attente doit être vérifiée avant un changement de moyen. Les espèces fonctionnent aussi pour un restaurant dont le Mobile Money n’est pas configuré. Les points ordinaires sont attribués au service ou à la livraison ; la simulation constitue l’exception pédagogique documentée séparément.

## Factures et droits

Chaque commande réglée possède une facture unique et un numéro stable. Son instantané conserve client, e-mail, restaurant, articles, quantités, prix, remise, livraison et total. Un changement ultérieur du menu ou du profil ne réécrit pas ces valeurs. La facture est imprimable ou enregistrable en PDF par le navigateur, au format A4. Les simulations comportent un préfixe et une mention explicites. Aucune TVA supplémentaire ni donnée fiscale absente n’est inventée.

Le client voit ses propres factures. Le personnel peut consulter la facture de la commande qu’il traite. La liste globale, la recherche par client et l’export sont réservés au gérant et à l’administrateur. Les restaurants sont isolés côté serveur. Les anciens règlements sont repris d’après leurs dates disponibles ; les nouveaux suivent la date de confirmation.

## Tableau de bord de direction

Filtres : aujourd’hui, semaine, mois ou tout l’historique ; réel, simulations ou ensemble distingué. Heure de Kinshasa. Les encaissements suivent la confirmation du paiement, les indicateurs opérationnels la création des commandes.

- Encaissements réels, volume simulé, espèces validées, panier moyen, clients acheteurs et clients revenus.
- Commandes reçues, en attente, actives, honorées, annulées et taux de paiement.
- Activité quotidienne, distinction réel/simulation, jusqu’à 90 jours d’affichage.
- Plats les plus vendus : quantités et valeur avant remises.
- Clients fidèles : classement par commandes honorées, achats puis dépenses ; panier moyen, dernier achat, solde courant et accès aux factures.
- Factures recherchables par nom, e-mail ou numéro, filtre client et pagination de 25 lignes.
- CSV de la sélection : jusqu’à 10 000 factures, cellules protégées contre les formules de tableur, dates indiquées en UTC.

Les simulations ne constituent pas du chiffre d’affaires encaissé. Les achats clients suivent les filtres ; les points disponibles représentent le solde courant du restaurant. Une confirmation EasyPay réelle après une simulation rapproche la facture existante : pas de double comptage.

## Routes et fichiers

`POST /api/orders/:id/cash` : choix du client. `POST /api/orders/:id/cash/confirm` : personnel, corps `{ "received": true, "amount": 9000 }` avec le total exact.

`GET /api/analytics?period=month&source=all` : direction. `GET /api/invoices?period=all&source=real&q=...&customer=...&page=1` : liste. `GET /api/invoices/export` : CSV, mêmes filtres. `GET /api/invoices/:orderId` : facture autorisée.

Interfaces : `/restaurant`, `/restaurant/stats`, `/invoice/:orderId`. Les commandes concernent le lot M4, paiement et fidélité le lot M6, statistiques et recette le lot M7.

La migration `012_cash_invoices.sql` est appliquée au démarrage. La base Render et les variables privées EasyPay/Resend restent en place. Aucun nouveau service ni clé n’est requis. Les essais doivent vérifier les trois rôles d’encaissement, les montants, la concurrence, le service, la fidélité, les factures, les filtres, les exports et l’isolation des restaurants.
