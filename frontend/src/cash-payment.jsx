import { useState } from 'react';
import { api, money } from './api';
import { Alert, BusyButton, Modal } from './components';

export function CashChoice({ order, onRequested }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = order.payments.find((p) => p.status === 'pending');
  if (order.payment_status === 'paid' || order.status === 'cancelled' || pending?.mode === 'cash')
    return null;
  async function choose() {
    setBusy(true);
    setError('');
    try {
      await api(`/orders/${order.id}/cash`, { method: 'POST', body: {} });
      onRequested();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel section-space cash-choice">
      <span className="pill">AUTRE MOYEN DE PAIEMENT</span>
      <h2>Payer en espèces</h2>
      <p>
        Réglez {money(order.total)} au restaurant ou au personnel de livraison. Un employé, le
        gérant ou l’administrateur confirmera la somme effectivement reçue.
      </p>
      <p className="muted">
        Choisir les espèces ne valide pas encore le paiement ni la préparation.
      </p>
      {pending && (
        <Alert type="info">
          Une demande Mobile Money est encore en attente. Le restaurant doit en vérifier le statut
          avant un changement de moyen de paiement.
        </Alert>
      )}
      <Alert>{error}</Alert>
      <BusyButton busy={busy} disabled={!!pending} className="button outline" onClick={choose}>
        Choisir le paiement en espèces
      </BusyButton>
    </section>
  );
}
export function CashValidation({ order, onConfirmed }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if (
    !order.payments.some((p) => p.mode === 'cash' && p.status === 'pending') ||
    order.status === 'cancelled' ||
    order.payment_status === 'paid'
  )
    return null;
  async function confirm(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api(`/orders/${order.id}/cash/confirm`, {
        method: 'POST',
        body: { amount: Number(form.get('amount')), received: form.get('received') === 'on' },
      });
      setOpen(false);
      onConfirmed();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <BusyButton className="button full" busy={busy} onClick={() => setOpen(true)}>
        Valider les espèces reçues
      </BusyButton>
      {open && (
        <Modal title="Confirmer l’encaissement en espèces" onClose={() => !busy && setOpen(false)}>
          <form onSubmit={confirm}>
            <p>
              Commande #{order.id.slice(0, 8).toUpperCase()} · {order.customer_name}
            </p>
            <p>
              Total à recevoir : <strong>{money(order.total)}</strong>
            </p>
            <label className="field">
              <span>Montant effectivement reçu (CDF)</span>
              <input
                name="amount"
                type="number"
                min="0"
                step="1"
                required
                defaultValue={order.total}
              />
            </label>
            <label className="check">
              <input type="checkbox" name="received" required />
              Je confirme avoir reçu la totalité de cette somme.
            </label>
            <Alert>{error}</Alert>
            <BusyButton className="button full" busy={busy}>
              Confirmer l’encaissement
            </BusyButton>
          </form>
        </Modal>
      )}
    </>
  );
}
