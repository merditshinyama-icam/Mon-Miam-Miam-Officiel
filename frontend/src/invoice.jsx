import { Link, useParams } from 'react-router-dom';
import { api, date, money } from './api';
import { Alert, PageTitle, useResource } from './components';
import { useApp } from './context';
import { paymentNames } from './decision-dashboard';
import './decision.css';
export function Invoice() {
  const { id } = useParams(),
    { user } = useApp();
  const { data, error } = useResource(() => api(`/invoices/${id}`), [id], false);
  const invoice = data?.invoice;
  return (
    <>
      <div className="no-print">
        <PageTitle title="Votre facture">
          <button className="button" onClick={() => window.print()} disabled={!invoice}>
            Imprimer / enregistrer en PDF
          </button>
        </PageTitle>
        <Link to={['manager', 'admin'].includes(user.role) ? '/restaurant/stats' : user.role==='employee'?'/restaurant':'/orders'}>
          Retour aux {['manager', 'admin'].includes(user.role) ? 'statistiques' : 'commandes'}
        </Link>
        <Alert>{error}</Alert>
      </div>
      {!invoice ? (
        !error && <p role="status">Chargement de la facture…</p>
      ) : (
        <article className="invoice-sheet panel">
          {invoice.is_simulated && (
            <p className="invoice-demo">FACTURE DE DÉMONSTRATION · AUCUN ENCAISSEMENT RÉEL</p>
          )}
          <div className="invoice-header">
            <div>
              <p className="eyebrow">{invoice.restaurant_name}</p>
              <h1>{invoice.is_simulated ? 'Facture de démonstration' : 'Facture'}</h1>
            </div>
            <div>
              <p className="invoice-number">{invoice.number}</p>
              <p>{date(invoice.issued_at)}</p>
            </div>
          </div>
          <div className="invoice-parties">
            <section>
              <h2>Client</h2>
              <strong>{invoice.customer_name}</strong>
              <p>{invoice.customer_email}</p>
            </section>
            <section>
              <h2>Règlement</h2>
              <strong>
                {invoice.is_simulated
                  ? 'Simulation'
                  : paymentNames[invoice.payment_method] || invoice.payment_method}
              </strong>
              <p>Commande #{id.slice(0, 8).toUpperCase()}</p>
              <p>Devise : CDF</p>
            </section>
          </div>
          <div className="table-scroll">
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>Désignation</th>
                  <th>Quantité</th>
                  <th>Prix unitaire</th>
                  <th>Montant</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, i) => (
                  <tr key={i}>
                    <td>{item.name}</td>
                    <td>{item.quantity}</td>
                    <td>{money(item.price)}</td>
                    <td>{money(item.price * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="invoice-totals">
            <div>
              <dt>Sous-total des articles</dt>
              <dd>{money(invoice.subtotal)}</dd>
            </div>
            <div>
              <dt>Remise fidélité</dt>
              <dd>−{money(invoice.discount)}</dd>
            </div>
            <div>
              <dt>Livraison</dt>
              <dd>{money(invoice.delivery_fee)}</dd>
            </div>
            <div className="invoice-grand-total">
              <dt>Total {invoice.is_simulated ? 'simulé' : 'réglé'}</dt>
              <dd>{money(invoice.total)}</dd>
            </div>
          </dl>
          <p className="invoice-note">
            Merci de votre confiance. Les montants reprennent les prix de la commande et aucune TVA
            supplémentaire n’est calculée par cette application étudiante.{' '}
            {invoice.is_simulated
              ? 'Ce document teste le parcours complet et ne prouve pas un paiement EasyPay réel.'
              : ''}
          </p>
        </article>
      )}
    </>
  );
}
