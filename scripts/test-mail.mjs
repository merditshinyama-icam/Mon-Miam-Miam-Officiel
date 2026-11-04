// Operator-only test, never part of the normal application startup.
// Keep the private key in Render; do not copy it into a local command.
if (!process.env.RENDER || !process.argv.includes('--send-approved-test'))
  throw new Error('Exécuter explicitement ce test autorisé depuis le service Render.');
const { RESEND_API_KEY, MAIL_FROM, MAIL_REPLY_TO, MAIL_TEST_RECIPIENT } = process.env;
if (!RESEND_API_KEY || MAIL_FROM !== 'onboarding@resend.dev' || MAIL_TEST_RECIPIENT !== 'merdi.tshinyama@2030.ulc-icam.com')
  throw new Error('Configuration de test limitée au destinataire autorisé requise.');
try {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: {'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type':'application/json', 'Idempotency-Key':'mon-miam-miam/configuration-mail/2026-10-24'},
    body:JSON.stringify({from:MAIL_FROM,to:[MAIL_TEST_RECIPIENT],...(MAIL_REPLY_TO?{reply_to:MAIL_REPLY_TO}:{}),subject:'Mon Miam Miam — Test de messagerie',text:'Bonjour Merdi,\n\nCe message vérifie la configuration de Resend depuis le service Render Mon Miam Miam. Il ne change aucun compte ni mot de passe et ne déclenche aucun paiement.\n\nL’envoi reste limité à votre adresse pendant la phase de test.\n\nÉquipe Mon Miam Miam'}),
  });
  if(!response.ok)throw new Error(`MAIL_TEST_HTTP_${response.status}`);
  const result=await response.json();
  if(!result.id)throw new Error('MAIL_TEST_NO_ID');
  console.log(`MAIL_TEST_ACCEPTED ${result.id}`);
} catch(error) {
  console.error(/^MAIL_TEST_/.test(error.message)?error.message:'MAIL_TEST_NETWORK_ERROR');
  process.exitCode=1;
}
