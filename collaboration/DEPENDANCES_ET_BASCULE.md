# Conservation des services existants

Référence complète : a2814e8eeb267801b0fb54573869e7f04460cc4d, branche archive/version-assistee-2026-10-24 du dépôt andreanandu0925-bit/Mon_miam_miam.
Dépôt officiel privé créé : https://github.com/merditshinyama-icam/Mon-Miam-Miam-Officiel. Le service Render reste lié au dépôt de référence pendant l’assemblage.

Render existant : mon-miam-miam-rdc, Frankfurt, PostgreSQL mon-miam-miam-db. Il suit l’archive et doit y rester pendant l’assemblage. Ne pas recréer la base ni réimporter des données. Le changement vers le nouveau dépôt exigera son autorisation dans Render. Conserver service, URL, base et variables privées. Vérifier les migrations et prévoir une sauvegarde avant bascule. Ne pas déployer un lot incomplet.

Construction : npm ci --include=dev && npm run build
Démarrage : npm start
Santé : /api/health
CI : npm ci puis npm run check. Node.js >=22.12 ; workflow Node 22.

Variables existantes à conserver sans les copier dans Git : DATABASE_URL, NODE_ENV, HOST, TRUST_PROXY, PAYMENT_MODE, EASYPAY_TOKEN, EASYPAY_CORRELATION_ID, EASYPAY_RESTAURANT_ID, RESEND_API_KEY, MAIL_FROM, MAIL_REPLY_TO, MAIL_TEST_RECIPIENT, DEMO_PREVIEW. APP_ORIGIN est facultatif si RENDER_EXTERNAL_URL est fourni ; conserver l’origine publique exacte. L’absence d’une variable optionnelle ne justifie pas d’inventer une valeur.

État enregistré : PAYMENT_MODE=easypay-sandbox ; EASYPAY_RESTAURANT_ID=mon-miam-miam-kinshasa ; DEMO_PREVIEW=true. IPN : https://mon-miam-miam-rdc.onrender.com/api/payments/easypay/ipn. Pas de paiement fournisseur complet déclaré réussi ; ne pas basculer automatiquement en production. Les aperçus ne changent pas un paiement réel.

Resend : clé dédiée Sending access, stockée uniquement dans Render. MAIL_FROM=onboarding@resend.dev ; MAIL_REPLY_TO et MAIL_TEST_RECIPIENT=merdi.tshinyama@2030.ulc-icam.com. Aucun domaine vérifié. Message de configuration marqué Delivered le 24 octobre ; parcours complet de récupération publique encore à tester. scripts/test-mail.mjs n’appartient PAS au démarrage ou à la construction habituelle.

render.yaml est une recette de création, pas un export complet de l’état du service. Ne pas l’appliquer pour recréer les ressources : il utilise PAYMENT_MODE=disabled par défaut et ne décrit pas toutes les variables Resend. L’état privé existant est la référence lors d’une bascule.

Local : aucune clé fournisseur requise. node scripts/launch.mjs crée des comptes fictifs sur un nouveau poste et utilise le mode demo. Les données et mots de passe locaux ne se transportent pas dans les lots. frontend/dist est reconstruit ; node_modules n’est pas distribué.
