import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, money } from './api';
import { Alert, BusyButton, Icon, PageTitle, useResource } from './components';
import './payment-simulation.css';

export function PaymentSimulationActions() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function simulate(outcome) {
    setBusy(true);
    setError('');
    try {
      await api(`/orders/${id}/simulation`, { method: 'POST', body: { outcome } });
      navigate(`/payment/${id}/simulation`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel simulation-actions section-space">
      <span className="pill">ESPACE DE DÉMONSTRATION</span>
      <h2>Tester le résultat d’un paiement</h2>
      <p>
        Aucun argent n’est débité et la transaction EasyPay reste inchangée. Une réussite ajoute les
        points de cette commande à votre fidélité, une seule fois.
      </p>
      <Alert>{error}</Alert>
      <div className="simulation-buttons">
        <BusyButton className="button" busy={busy} onClick={() => simulate('paid')}>
          Simuler une réponse positive
        </BusyButton>
        <BusyButton className="button outline" busy={busy} onClick={() => simulate('failed')}>
          Simuler une réponse négative
        </BusyButton>
      </div>
    </section>
  );
}

export function PaymentSimulationResult() {
  const { id } = useParams();
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const { data, error } = useResource(() => api(`/orders/${id}/simulation`), [id, refresh], false);
  async function retry() {
    setBusy(true);
    setActionError('');
    try {
      await api(`/orders/${id}/simulation`, { method: 'POST', body: { outcome: 'paid' } });
      setRefresh((n) => n + 1);
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <>
        <PageTitle title="Résultat de la simulation" />
        <Alert>{error}</Alert>
        {!error && <p role="status">Chargement de votre résultat…</p>}
        <Link to={`/payment/${id}`}>Revenir au paiement</Link>
      </>
    );
  const { simulation, order } = data;
  if (!simulation)
    return (
      <>
        <PageTitle title="Aucune simulation enregistrée" />
        <p>
          Choisissez un résultat depuis la page de paiement. Ouvrir cette page ne crée aucun
          paiement et n’accorde aucun point.
        </p>
        <Link className="button" to={`/payment/${id}`}>
          Choisir une simulation
        </Link>
      </>
    );
  const success = simulation.outcome === 'paid';
  return (
    <>
      <PageTitle title="Résultat de la simulation" />
      <section
        className={`simulation-result panel ${success ? 'simulation-success' : 'simulation-failure'}`}
        aria-labelledby="simulation-title"
      >
        <header className="simulation-result-header">
          <span className="pill">DÉMONSTRATION · AUCUN DÉBIT RÉEL</span>
          <div className="simulation-symbol">
            <Icon name={success ? 'check' : 'close'} size={38} />
          </div>
          <h2 id="simulation-title" tabIndex={-1}>
            {success ? 'Simulation réussie !' : 'Le paiement simulé a échoué'}
          </h2>
          <p>
            {success
              ? 'Votre résultat est enregistré et vos points de fidélité ont été ajoutés.'
              : 'Aucun point n’a été ajouté pour cet essai. Vous pouvez tester une réussite ou revenir au paiement.'}
          </p>
        </header>
        <dl className="simulation-metrics" aria-live="polite">
          <div>
            <dt>Montant simulé</dt>
            <dd>{money(order.total)}</dd>
          </div>
          <div>
            <dt>Points de cette simulation</dt>
            <dd>
              +{simulation.points_earned} <small>points</small>
            </dd>
          </div>
          <div>
            <dt>Solde de fidélité actuel</dt>
            <dd>
              {data.balance} <small>points</small>
            </dd>
          </div>
        </dl>
        <div className="simulation-receipt">
          <div className="row between">
            <h3>Votre récapitulatif</h3>
            <span className="muted">#{id.slice(0, 8).toUpperCase()}</span>
          </div>
          <ul>
            {order.items.map((item, i) => (
              <li key={i}>
                <span>
                  {item.quantity} × {item.name}
                </span>
                <strong>{money(item.price * item.quantity)}</strong>
              </li>
            ))}
          </ul>
          <p className="simulation-note">
            Ce résultat n’est pas une preuve d’encaissement. Le paiement EasyPay et la commande
            réelle conservent leur statut.{' '}
            {success && 'Actualiser la page ne crédite pas de points supplémentaires.'}
          </p>
        </div>
        <Alert>{actionError}</Alert>
        <div className="simulation-result-footer">
          {success ? (
            <Link className="button" to="/loyalty">
              <Icon name="gift" />
              Voir mes points de fidélité
            </Link>
          ) : (
            <BusyButton className="button" busy={busy} onClick={retry}>
              Simuler une réussite
            </BusyButton>
          )}
          <Link className="button outline" to={`/payment/${id}`}>
            Revenir au paiement
          </Link>
          <Link className="text-button" to="/">
            Retourner au menu
          </Link>
        </div>
      </section>
    </>
  );
}
