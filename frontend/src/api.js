export const restaurantSlug =
  window.location.pathname.match(/^\/r\/([a-z0-9-]+)(?:\/|$)/)?.[1] || '';
export const restaurantBase = restaurantSlug ? `/r/${restaurantSlug}` : '';
export const cartStorageKey = restaurantSlug ? `mmm-cart:${restaurantSlug}` : 'mmm-cart';
export async function api(url, { body, ...options } = {}) {
  const form = body instanceof FormData;
  const response = await fetch(`/api${url}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'X-Requested-With': 'MonMiamMiam',
      ...(restaurantSlug ? { 'X-Restaurant-Slug': restaurantSlug } : {}),
      ...(!form && body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    body: body ? (form ? body : JSON.stringify(body)) : undefined,
  });
  const data =
    response.status === 204
      ? null
      : await response.json().catch(() => ({ message: 'Réponse du serveur illisible.' }));
  if (!response.ok) {
    const error = new Error(data?.message || 'Le serveur est indisponible.');
    error.status = response.status;
    throw error;
  }
  return data;
}
export const money = (amount) => `${new Intl.NumberFormat('fr-CD').format(amount)} CDF`;
export const date = (value) =>
  new Intl.DateTimeFormat('fr-CD', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Kinshasa',
  }).format(new Date(value));
export const labels = {
  awaiting_payment: 'À payer',
  confirmed: 'Confirmée',
  preparing: 'En préparation',
  ready: 'Prête',
  delivering: 'En livraison',
  served: 'Servie',
  delivered: 'Livrée',
  cancelled: 'Annulée',
  pending: 'En attente',
  paid: 'Payé',
  failed: 'Échec',
  open: 'Ouverte',
  revise: 'À revoir',
  resolved: 'Résolue',
};
export const roleLabels = {
  student: 'Étudiant',
  employee: 'Employé',
  manager: 'Gérant',
  admin: 'Administrateur',
};
