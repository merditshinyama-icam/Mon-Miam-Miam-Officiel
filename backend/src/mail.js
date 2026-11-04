import { AppError, requireCondition } from './domain.js';
export function createResetMailer({ resendApiKey, mailFrom, mailReplyTo }, transport = fetch) {
  return async ({ to, url }) => {
    requireCondition(resendApiKey && mailFrom, 503, 'L’envoi des e-mails n’est pas configuré.');
    try {
      const response = await transport('https://api.resend.com/emails', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: mailFrom,
          ...(mailReplyTo ? { reply_to: mailReplyTo } : {}),
          to: [to],
          subject: 'Mon Miam Miam · Réinitialiser votre mot de passe',
          text: `Vous avez demandé un nouveau mot de passe. Ouvrez ce lien valable 30 minutes :\n${url}\n\nSi vous n’avez pas fait cette demande, ignorez cet e-mail. Ne partagez pas ce lien.`,
        }),
      });
      if (!response.ok || !(await response.json()).id) throw new Error('MAIL_REFUSED');
    } catch {
      throw new AppError(503, 'L’envoi de l’e-mail a échoué. Réessayez plus tard.');
    }
  };
}
