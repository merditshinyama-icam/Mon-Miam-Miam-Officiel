import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, date } from './api';
import { Alert, BusyButton, Empty, Icon, PageTitle, useResource } from './components';
import './decision.css';

export const paymentNames = {
  cash: 'Espèces',
  easypay: 'EasyPay',
  simulation: 'Simulation',
  points: 'Points de fidélité',
  legacy: 'Ancien règlement',
};
const qs = (values) => new URLSearchParams(values).toString();
export function DecisionDashboard() {
  const [period, setPeriod] = useState('month'),
    [source, setSource] = useState('all');
  const [customer, setCustomer] = useState(null),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false),
    [exportError, setExportError] = useState('');
  const filters = { period, source },
    invoiceFilters = {
      ...filters,
      q: query,
      customer: customer?.user_id || '',
      page: String(page),
    };
  const { data, error } = useResource(
    () => api('/analytics?' + qs(filters)),
    [period, source],
    true,
  );
  const { data: billData, error: billError } = useResource(
    () => api('/invoices?' + qs(invoiceFilters)),
    [period, source, query, customer?.user_id, page],
    true,
  );
  function changePeriod(v) {
    setPeriod(v);
    setPage(1);
  }
  function changeSource(v) {
    setSource(v);
    setPage(1);
  }
  async function exportCsv() {
    setExporting(true);
    setExportError('');
    try {
      const file = await api('/invoices/export?' + qs(invoiceFilters));
      const url = URL.createObjectURL(new Blob([file.csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setExportError(e.message);
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      <PageTitle title="Piloter votre restaurant" eyebrow="GESTION & DÉCISION">
        <span className="live-indicator">Actualisation · 10 s</span>
      </PageTitle>
      <section className="panel decision-filters" aria-label="Filtres du tableau de bord">
        <label className="field">
          <span>Période</span>
          <select value={period} onChange={(e) => changePeriod(e.target.value)}>
            <option value="day">Aujourd’hui</option>
            <option value="week">Cette semaine</option>
            <option value="month">Ce mois-ci</option>
            <option value="all">Tout l’historique</option>
          </select>
        </label>
        <label className="field">
          <span>Données à afficher</span>
          <select value={source} onChange={(e) => changeSource(e.target.value)}>
            <option value="all">Réel et simulations, distingués</option>
            <option value="real">Encaissements réels uniquement</option>
            <option value="simulation">Simulations uniquement</option>
          </select>
        </label>
        <p className="muted">
          Montants en CDF · heure de Kinshasa. Les encaissements suivent la date de confirmation du
          paiement.
        </p>
      </section>
      <Alert>{error}</Alert>
      {!data ? (
        <p role="status">Chargement de votre tableau de bord…</p>
      ) : (
        <>
          <div className="stat-grid section-space">
            {[
              [money(data.summary.real_revenue), 'Encaissements réels', 'chart'],
              [money(data.summary.simulated_revenue), 'Volume simulé · non encaissé', 'chart'],
              [money(data.summary.cash_received), 'Espèces validées', 'bag'],
              [money(data.summary.average_ticket), 'Panier moyen payé', 'bag'],
              [data.summary.customers, 'Clients acheteurs', 'user'],
              [data.summary.returning_customers, 'Clients revenus · au moins 2 achats', 'star'],
            ].map(([value, label, icon]) => (
              <section className="panel stat-card" key={label}>
                <Icon name={icon} />
                <p>{label}</p>
                <strong>{value}</strong>
              </section>
            ))}
          </div>
          <section className="panel decision-operations section-space">
            <h2>Le service en cours</h2>
            <p className="muted">Commandes créées pendant la période sélectionnée.</p>
            <dl>
              {[
                [data.operations.received, 'Reçues'],
                [data.operations.awaiting, 'Paiement attendu'],
                [data.operations.active, 'À préparer / servir'],
                [data.operations.fulfilled, 'Servies / livrées'],
                [data.operations.cancelled, 'Annulées'],
                [
                  data.operations.received
                    ? Math.round((100 * data.operations.paid) / data.operations.received) + '%'
                    : '—',
                  'Taux de paiement',
                ],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <div className="two-columns section-space">
            <section className="panel">
              <h2>L’activité jour après jour</h2>
              <p className="muted">
                Jours avec paiements confirmés · 90 derniers jours au maximum.
              </p>
              {data.trend.length ? (
                <div className="decision-trend">
                  {data.trend.map((day) => (
                    <div className="decision-trend-row" key={day.day}>
                      <div className="row between">
                        <span>
                          {new Date(day.day).toLocaleDateString('fr-CD', {
                            day: 'numeric',
                            month: 'short',
                            timeZone: 'Africa/Kinshasa',
                          })}
                        </span>
                        <strong>{money(day.amount)}</strong>
                      </div>
                      <div
                        className="decision-track"
                        role="img"
                        aria-label={`${day.orders} commande(s), ${money(day.real_amount)} réels, ${money(day.simulated_amount)} simulés`}
                      >
                        <span
                          className="trend-real"
                          style={{
                            width:
                              (100 * day.real_amount) /
                                Math.max(1, ...data.trend.map((d) => d.amount)) +
                              '%',
                          }}
                        />
                        <span
                          className="trend-demo"
                          style={{
                            width:
                              (100 * day.simulated_amount) /
                                Math.max(1, ...data.trend.map((d) => d.amount)) +
                              '%',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty title="Pas encore de paiement sur cette période" icon="chart">
                  Les règlements validés alimenteront cette vue.
                </Empty>
              )}
              <p className="decision-legend">
                <span>■ Réel</span>
                <span>▧ Simulation</span>
              </p>
            </section>
            <section className="panel">
              <h2>Ce qui se vend le mieux</h2>
              <p className="muted">Articles des factures de la sélection, avant remises.</p>
              {data.popular.length ? (
                data.popular.map((dish, i) => (
                  <div className="decision-rank" key={dish.name}>
                    <span className="pill">{i + 1}</span>
                    <div>
                      <strong>{dish.name}</strong>
                      <small>
                        {dish.quantity} vendu(s) · {money(dish.amount)}
                      </small>
                    </div>
                  </div>
                ))
              ) : (
                <p>Aucune vente à afficher.</p>
              )}
            </section>
          </div>
          <section className="panel section-space">
            <h2>Des repères pour décider</h2>
            <div className="decision-insights">
              <div>
                <strong>{data.summary.paid_orders} facture(s)</strong>
                <p>
                  {money(data.summary.discounts)} de réductions fidélité accordées sur la sélection.
                </p>
              </div>
              <div>
                <strong>
                  {data.summary.customers
                    ? Math.round((100 * data.summary.returning_customers) / data.summary.customers)
                    : 0}
                  % de clients revenus
                </strong>
                <p>
                  Part des acheteurs ayant au moins deux règlements sur cette période. À suivre pour
                  évaluer la fidélisation.
                </p>
              </div>
              <div>
                <strong>
                  {data.methods.length
                    ? paymentNames[data.methods[0].method] || data.methods[0].method
                    : 'Aucun moyen dominant'}
                </strong>
                <p>
                  Moyen représentant le plus de volume dans la sélection.{' '}
                  {data.methods.length
                    ? 'Prévoyez l’organisation de l’encaissement en conséquence.'
                    : 'Choisissez une autre période pour comparer.'}
                </p>
              </div>
            </div>
          </section>
          <section className="panel section-space">
            <h2>Vos clients les plus fidèles</h2>
            <p className="muted">
              20 premiers · classés par commandes honorées, nombre d’achats puis dépenses, selon les
              filtres ci-dessus. Les points disponibles représentent le solde courant du client dans
              ce restaurant.
            </p>
            {data.customers.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Achats / honorés</th>
                      <th>Total payé</th>
                      <th>Panier moyen</th>
                      <th>Points disponibles</th>
                      <th>Dernier achat</th>
                      <th>Factures</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.customers.map((c) => (
                      <tr key={c.user_id}>
                        <td>
                          <strong>{c.name}</strong>
                          <small className="decision-email">{c.email}</small>
                        </td>
                        <td>
                          {c.purchases} / {c.fulfilled}
                        </td>
                        <td>{money(c.spent)}</td>
                        <td>{money(c.average_ticket)}</td>
                        <td>{c.balance}</td>
                        <td>{date(c.last_purchase)}</td>
                        <td>
                          <button
                            className="button outline"
                            onClick={() => {
                              setCustomer(c);
                              setQuery('');
                              setPage(1);
                            }}
                          >
                            Voir les factures de {c.name}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>Aucun client acheteur dans cette sélection.</p>
            )}
          </section>
        </>
      )}
      <section className="panel section-space" aria-labelledby="invoices-title">
        <div className="row between">
          <h2 id="invoices-title">Factures par client</h2>
          <BusyButton busy={exporting} className="button outline" onClick={exportCsv}>
            Exporter la sélection en CSV
          </BusyButton>
        </div>
        <label className="field">
          <span>Rechercher une facture ou un client</span>
          <input
            type="search"
            maxLength={100}
            value={query}
            placeholder="Nom, e-mail ou numéro de facture"
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        {customer && (
          <p className="decision-client-filter">
            Client : <strong>{customer.name}</strong>{' '}
            <button
              className="text-button"
              onClick={() => {
                setCustomer(null);
                setPage(1);
              }}
            >
              Afficher tous les clients
            </button>
          </p>
        )}
        <Alert>{billError || exportError}</Alert>
        {!billData ? (
          <p role="status">Chargement des factures…</p>
        ) : billData.invoices.length ? (
          <>
            <p className="muted">
              {billData.total} facture(s) · page {page} sur {Math.ceil(billData.total / 25)}
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Facture / date</th>
                    <th>Client</th>
                    <th>Moyen</th>
                    <th>Total</th>
                    <th>Consulter</th>
                  </tr>
                </thead>
                <tbody>
                  {billData.invoices.map((i) => (
                    <tr key={i.order_id}>
                      <td>
                        <span className="invoice-number-small">{i.number}</span>
                        <small className="decision-email">{date(i.issued_at)}</small>
                      </td>
                      <td>
                        {i.customer_name}
                        <small className="decision-email">{i.customer_email}</small>
                      </td>
                      <td>
                        {i.is_simulated ? (
                          <span className="pill">Simulation</span>
                        ) : (
                          paymentNames[i.payment_method] || i.payment_method
                        )}
                      </td>
                      <td>{money(i.total)}</td>
                      <td>
                        <Link className="button outline" to={`/invoice/${i.order_id}`}>
                          Ouvrir la facture
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row between section-space">
              <button
                className="button outline"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Précédent
              </button>
              <button
                className="button outline"
                disabled={page * 25 >= billData.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
              </button>
            </div>
          </>
        ) : (
          <Empty title="Aucune facture dans cette sélection" icon="bag">
            Modifiez la période, la recherche ou le client.
          </Empty>
        )}
      </section>
    </>
  );
}
