import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, date, labels, money, roleLabels } from './api';
import { RestaurantBranding } from './onboarding';
import { useApp } from './context';
import { Alert, BusyButton, Empty, Field, Icon, Modal, PageTitle, useResource } from './components';
import { Period } from './student';
import { CashValidation } from './cash-payment';
import { DecisionDashboard } from './decision-dashboard';

const nextFor = (order) =>
  ({
    confirmed: ['preparing', 'Commencer la préparation'],
    preparing: ['ready', 'Marquer prête'],
    ready:
      order.service === 'onsite'
        ? ['served', 'Confirmer le service']
        : ['delivering', 'Départ en livraison'],
    delivering: ['delivered', 'Confirmer la livraison'],
  })[order.status];
export function Kitchen() {
  const [refresh, setRefresh] = useState(0),
    [filter, setFilter] = useState('active'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  const { data, error: loadError } = useResource(() => api('/orders'), [refresh], true);
  const orders =
    data?.orders.filter(
      (o) =>
        filter === 'all' ||
        (filter === 'active' &&
          ['confirmed', 'preparing', 'ready', 'delivering'].includes(o.status)) ||
        (filter === 'pending' && o.status === 'awaiting_payment') ||
        (filter === 'cash' &&
          o.status === 'awaiting_payment' &&
          o.payments.some((p) => p.mode === 'cash' && p.status === 'pending')),
    ) || [];
  async function advance(order) {
    setBusy(order.id);
    setError('');
    try {
      await api(`/orders/${order.id}/status`, {
        method: 'PATCH',
        body: { status: nextFor(order)[0] },
      });
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <PageTitle title="Une bonne pause se prépare." eyebrow="ESPACE RESTAURANT">
        <span className="live-indicator">Actualisation · 10 s</span>
      </PageTitle>
      <div className="chips">
        {[
          ['active', 'À préparer / servir'],
          ['pending', 'Paiement attendu'],
          [
            'cash',
            `Espèces à valider (${data?.orders.filter((o) => o.status === 'awaiting_payment' && o.payments.some((p) => p.mode === 'cash' && p.status === 'pending')).length || 0})`,
          ],
          ['all', 'Toutes les commandes'],
        ].map(([v, label]) => (
          <button
            key={v}
            className={`chip ${filter === v ? 'selected' : ''}`}
            onClick={() => setFilter(v)}
          >
            {label}
          </button>
        ))}
      </div>
      <Alert>{error || loadError}</Alert>
      {!data ? (
        <p role="status">Chargement de la cuisine…</p>
      ) : orders.length === 0 ? (
        <Empty title="Tout est à jour en cuisine.">
          Les nouvelles commandes confirmées arriveront ici.
        </Empty>
      ) : (
        <div className="orders-grid">
          {orders.map((order) => (
            <article className="panel order-card" key={order.id}>
              <div className="row between">
                <h2>#{order.id.slice(0, 8).toUpperCase()}</h2>
                <span className={`status ${order.status}`}>{labels[order.status]}</span>
              </div>
              <p className="muted">Reçue le {date(order.created_at)}</p>
              <p>
                <strong>{order.customer_name}</strong>
              </p>
              {order.is_simulated && <p className="pill">Simulation · aucun encaissement réel</p>}
              <ul className="order-lines">
                {order.items.map((i) => (
                  <li key={i.dish_id}>
                    <strong>
                      {i.quantity} × {i.name}
                    </strong>
                    <span>{money(i.price * i.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="service-note">
                <Icon name="clock" />
                <span>
                  {order.service === 'onsite'
                    ? `Sur place · ${date(order.arrival_at)}`
                    : `Livraison · ${order.address}`}
                </span>
              </div>
              <div className="row between">
                <strong>{money(order.total)}</strong>
                <span className={`status ${order.payment_status}`}>
                  {labels[order.payment_status]}
                </span>
              </div>
              {nextFor(order) && (
                <BusyButton
                  busy={busy === order.id}
                  className="button full"
                  onClick={() => advance(order)}
                >
                  {nextFor(order)[1]}
                  <Icon name="arrow" />
                </BusyButton>
              )}
              <CashValidation order={order} onConfirmed={() => setRefresh((n) => n + 1)} />
              {order.payment_status === 'paid' && (
                <Link className="button outline full" to={`/invoice/${order.id}`}>
                  Voir la facture{order.is_simulated ? ' de démonstration' : ''}
                </Link>
              )}
              {order.payment_status !== 'paid' && order.status !== 'cancelled' && (
                <p className="muted">La préparation attend la confirmation du paiement.</p>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
export function ManageMenu() {
  const { catalog, refreshCatalog, user } = useApp();
  const [edit, setEdit] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const admin = user.role === 'admin';
  async function action(fn, close = false) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await refreshCatalog();
      if (close) setEdit(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    const body = new FormData();
    for (const key of ['name', 'description', 'category', 'price']) body.set(key, values[key]);
    body.set('available', String(values.available === 'on'));
    if (values.image) body.set('image', values.image);
    if (values.photo?.size) body.set('photo', values.photo);
    await action(
      () =>
        api(edit.id ? `/dishes/${edit.id}` : '/dishes', { method: edit.id ? 'PUT' : 'POST', body }),
      true,
    );
  }
  return (
    <>
      <PageTitle
        title={admin ? 'Menu du restaurant' : 'Disponibilité du menu'}
        eyebrow="ESPACE RESTAURANT"
      >
        {admin && (
          <button
            className="button"
            onClick={() => {
              setError('');
              setEdit({
                name: '',
                description: '',
                category: 'Plats',
                price: 9000,
                image: '/assets/moambe.webp',
                available: true,
              });
            }}
          >
            <Icon name="plus" />
            Ajouter un article
          </button>
        )}
      </PageTitle>
      <Alert>{error}</Alert>
      <section className="panel section-space">
        <h2>Le plat du jour</h2>
        <label className="field">
          <span>Article à mettre en avant sur l’accueil</span>
          <select
            value={catalog?.featuredDishId || ''}
            disabled={busy}
            onChange={(e) =>
              action(() =>
                api('/featured-dish', { method: 'PUT', body: { dishId: e.target.value || null } }),
              )
            }
          >
            <option value="">Sélection par défaut</option>
            {catalog?.dishes
              .filter((d) => d.available)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        </label>
        <p className="muted">
          L’équipe peut changer cette sélection à tout moment. Un article épuisé n’est pas mis en
          avant.
        </p>
      </section>
      <section className="panel">
        <p className="muted">
          Les modifications de prix concernent les prochaines commandes. Les prix des commandes déjà
          enregistrées sont conservés.
        </p>
        <div className="menu-management">
          {catalog?.dishes.map((d) => (
            <article className="manage-dish" key={d.id}>
              <img src={d.image} width="80" height="80" alt="" />
              <div>
                <h3>{d.name}</h3>
                <p>
                  {d.category} · {money(d.price)}
                </p>
                <span className={`status ${d.available ? 'paid' : 'failed'}`}>
                  {d.available ? 'Disponible' : 'Épuisé'}
                </span>
              </div>
              <div className="manage-actions">
                <button
                  className="button outline"
                  disabled={busy}
                  onClick={() =>
                    action(() =>
                      api(`/dishes/${d.id}/availability`, {
                        method: 'PATCH',
                        body: { available: !d.available },
                      }),
                    )
                  }
                >
                  {d.available ? 'Marquer épuisé' : 'Rendre disponible'}
                </button>
                {admin && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setError('');
                      setEdit(d);
                    }}
                  >
                    Modifier l’article
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
      {edit && (
        <Modal
          title={edit.id ? 'Modifier l’article' : 'Un nouveau plat à partager'}
          onClose={() => setEdit(null)}
        >
          <form onSubmit={save}>
            <Field
              label="Nom"
              name="name"
              defaultValue={edit.name}
              required
              minLength="2"
              maxLength="100"
            />
            <Field
              label="Description"
              name="description"
              defaultValue={edit.description}
              required
              minLength="3"
              maxLength="250"
            />
            <Field
              label="Prix en CDF"
              name="price"
              type="number"
              defaultValue={edit.price}
              required
              min="100"
              max="10000000"
              step="1"
            />
            <label className="field">
              <span>Catégorie</span>
              <select name="category" defaultValue={edit.category}>
                {['Plats', 'Boissons', 'Snacks'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Illustration</span>
              <select
                name="image"
                defaultValue={
                  edit.image.startsWith('/assets/') ? edit.image.replace('.svg', '.webp') : ''
                }
                onChange={(e) => setEdit({ ...edit, preview: e.target.value || edit.image })}
              >
                <option value="">Conserver l’image actuelle</option>
                {[
                  ['moambe', 'Poulet et riz — photo d’illustration'],
                  ['poisson', 'Poisson'],
                  ['bissap', 'Bissap'],
                  ['samossas', 'Samossas'],
                ].map(([v, l]) => (
                  <option value={`/assets/${v}.webp`} key={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Importer une image</span>
              <input
                type="file"
                name="photo"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (!file) {
                    setEdit({ ...edit, preview: null });
                    return;
                  }
                  if (file.size > 3 * 1024 * 1024) {
                    setError('La photo dépasse la limite de 3 Mo.');
                    e.target.value = '';
                    return;
                  }
                  setError('');
                  const reader = new FileReader();
                  reader.onload = () =>
                    setEdit((current) =>
                      current ? { ...current, preview: reader.result } : current,
                    );
                  reader.readAsDataURL(file);
                }}
              />
              <small>
                JPEG, PNG ou WebP · 3 Mo maximum. L’image importée remplace le choix ci-dessus.
              </small>
            </label>
            <img
              className="dish-preview"
              src={edit.preview || edit.image}
              alt="Aperçu de l’illustration de l’article"
            />
            <label className="check-field">
              <input name="available" type="checkbox" defaultChecked={edit.available} />
              <span>Disponible à la commande</span>
            </label>
            <Alert>{error}</Alert>
            <BusyButton className="button full" busy={busy}>
              Enregistrer l’article
            </BusyButton>
          </form>
          {edit.id && (
            <button
              className="text-button danger-text"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    `Retirer « ${edit.name} » du menu ? Les commandes existantes seront conservées.`,
                  )
                )
                  action(() => api(`/dishes/${edit.id}`, { method: 'DELETE' }), true);
              }}
            >
              Retirer cet article du menu
            </button>
          )}
        </Modal>
      )}
    </>
  );
}
export function Stats() {
  const { user } = useApp();
  return user.role === 'employee' ? <OperationalStats /> : <DecisionDashboard />;
}
function OperationalStats() {
  const { user } = useApp();
  const [period, setPeriod] = useState('week');
  const { data, error } = useResource(() => api(`/stats?period=${period}`), [period], true);
  return (
    <>
      <PageTitle title="Votre restaurant, en un regard." eyebrow="ESPACE RESTAURANT">
        <span className="live-indicator">Actualisation · 10 s</span>
      </PageTitle>
      {user.role !== 'employee' ? (
        <Period value={period} onChange={setPeriod} />
      ) : (
        <p className="muted">Vue employé · semaine en cours, heure de Kinshasa.</p>
      )}
      <Alert>{error}</Alert>
      {!data ? (
        <p role="status">Chargement des statistiques…</p>
      ) : (
        <>
          <div className="stat-grid">
            {[
              [money(data.stats.revenue), 'Commandes payées · simulations comprises', 'chart'],
              [data.stats.orders, 'Commandes reçues', 'bag'],
              [data.stats.active, 'En préparation ou à servir', 'clock'],
              [data.stats.points, 'Points fidélité attribués', 'gift'],
              [data.loyalty.redeemed, 'Points utilisés sur commandes payées', 'gift'],
              [money(data.loyalty.discounts), 'Réductions fidélité', 'chart'],
              [data.referrals.invited, 'Filleuls inscrits sur la période', 'user'],
              [data.referrals.rewarded, 'Ces filleuls ayant déclenché un bonus', 'star'],
              [data.loyalty.expired, 'Points non utilisés expirés sur la période', 'clock'],
            ].map(([value, label, icon]) => (
              <section className="panel stat-card" key={label}>
                <Icon name={icon} />
                <p>{label}</p>
                <strong>{value}</strong>
              </section>
            ))}
          </div>
          <div className="two-columns section-space">
            <section className="panel">
              <h2>Les préférés du moment</h2>
              <p className="muted">Quantités des articles dans les commandes payées.</p>
              {data.popular.length ? (
                data.popular.map((d) => (
                  <div className="popular-item" key={d.name}>
                    <div className="row between">
                      <strong>{d.name}</strong>
                      <span>{d.quantity}</span>
                    </div>
                    <div className="bar-track">
                      <div
                        style={{
                          width: `${(d.quantity / Math.max(...data.popular.map((p) => p.quantity))) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <Empty title="Les premières ventes arrivent." icon="chart">
                  Les commandes payées alimenteront ce tableau.
                </Empty>
              )}
            </section>
            <section className="panel">
              <h2>La pause en chiffres</h2>
              <div className="big-stat">
                <strong>{data.stats.completed}</strong>
                <span>commandes servies ou livrées</span>
              </div>
              <p className="muted">
                Les commandes en attente de paiement ne sont pas comptées dans le montant encaissé.
                Les simulations sont incluses dans cette vue opérationnelle et signalées sur les
                commandes. Le tableau de bord de direction distingue les encaissements réels du
                volume simulé.
              </p>
              <Link className="button outline" to="/restaurant">
                Ouvrir le suivi des commandes <Icon name="arrow" />
              </Link>
            </section>
          </div>
        </>
      )}
    </>
  );
}
export function Staff() {
  const { user } = useApp();
  const [refresh, setRefresh] = useState(0),
    [edit, setEdit] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [includeRemoved, setIncludeRemoved] = useState(false),
    [removing, setRemoving] = useState(null);
  const { data, error: loadError } = useResource(
    () => api(`/staff?includeRemoved=${includeRemoved}`),
    [refresh, includeRemoved],
  );
  async function removeOrRestore(member, restore = false) {
    setBusy(true);
    setError('');
    try {
      await api(`/staff/${member.id}${restore ? '/restore' : ''}`, {
        method: restore ? 'POST' : 'DELETE',
      });
      setRemoving(null);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(edit.id ? `/staff/${edit.id}` : '/staff', {
        method: edit.id ? 'PATCH' : 'POST',
        body: edit.id
          ? {
              name: values.name,
              phone: values.phone,
              active: values.active === 'on',
              role: values.role,
            }
          : values,
      });
      setEdit(null);
      setRefresh((r) => r + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle title="Une équipe, de bonnes pauses." eyebrow="ESPACE RESTAURANT">
        <button
          className="button"
          onClick={() => {
            setError('');
            setEdit({});
          }}
        >
          <Icon name="plus" />
          {user.role === 'admin' ? 'Ajouter un membre' : 'Créer un employé'}
        </button>
      </PageTitle>
      <Alert>{loadError}</Alert>
      <section className="panel">
        <h2>L’équipe du restaurant</h2>
        {user.role === 'admin' && (
          <label className="check-field">
            <input
              type="checkbox"
              checked={includeRemoved}
              onChange={(e) => setIncludeRemoved(e.target.checked)}
            />
            Afficher aussi les comptes retirés
          </label>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>E-mail</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data?.staff.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.email}</td>
                  <td>{roleLabels[s.role]}</td>
                  <td>
                    <span className={`status ${s.active ? 'paid' : 'cancelled'}`}>
                      {s.removed_at ? 'Retiré' : s.active ? 'Actif' : 'Désactivé'}
                    </span>
                  </td>
                  <td>
                    {user.role === 'admin' ? (
                      <div className="row">
                        {s.removed_at ? (
                          <BusyButton
                            className="button outline"
                            busy={busy}
                            onClick={() => removeOrRestore(s, true)}
                          >
                            Restaurer
                          </BusyButton>
                        ) : (
                          <>
                            <button
                              className="text-button"
                              onClick={() => {
                                setError('');
                                setEdit(s);
                              }}
                            >
                              Modifier
                            </button>
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() => {
                                setError('');
                                setRemoving(s);
                              }}
                            >
                              Supprimer
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="muted">Employé</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && !data.staff.length && (
          <p className="muted">Créez le premier membre de votre équipe.</p>
        )}
      </section>
      {removing && (
        <Modal title="Supprimer ce membre de l’équipe ?" onClose={() => setRemoving(null)}>
          <p>
            {removing.name} perdra son accès et disparaîtra de la liste active. L’historique est
            conservé ; le compte pourra être restauré.
          </p>
          <Alert>{error}</Alert>
          <BusyButton busy={busy} className="button" onClick={() => removeOrRestore(removing)}>
            Confirmer la suppression
          </BusyButton>
        </Modal>
      )}
      {edit && (
        <Modal
          title={
            edit.id
              ? 'Modifier un membre'
              : user.role === 'admin'
                ? 'Ajouter un gérant ou un employé'
                : 'Créer un employé'
          }
          onClose={() => setEdit(null)}
        >
          <form onSubmit={save}>
            {user.role === 'admin' && (
              <label className="field">
                <span>Rôle du membre</span>
                <select name="role" defaultValue={edit.role || 'employee'}>
                  <option value="employee">Employé</option>
                  <option value="manager">Gérant</option>
                </select>
              </label>
            )}
            <Field
              label="Nom complet"
              name="name"
              defaultValue={edit.name}
              required
              minLength="2"
              maxLength="80"
            />
            {!edit.id && (
              <Field label="E-mail" name="email" type="email" autoComplete="off" required />
            )}
            <Field
              label="Téléphone"
              name="phone"
              type="tel"
              placeholder="+243810000000"
              defaultValue={edit.phone}
              pattern="\+243[0-9]{9}"
              required
            />
            {!edit.id ? (
              <>
                <Field
                  label="Mot de passe initial"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength="10"
                  maxLength="128"
                  required
                />
                <p className="muted small">
                  10 caractères minimum, une majuscule et un chiffre.{' '}
                  {user.role === 'admin'
                    ? 'Choisissez le rôle employé ou gérant.'
                    : 'Le rôle créé est toujours employé.'}
                </p>
              </>
            ) : (
              <label className="check-field">
                <input type="checkbox" name="active" defaultChecked={edit.active} />
                <span>Compte actif</span>
              </label>
            )}
            <Alert>{error}</Alert>
            <BusyButton busy={busy} className="button full">
              {edit.id ? 'Enregistrer les changements' : 'Créer le compte'}
            </BusyButton>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Settings() {
  const { catalog, refreshCatalog } = useApp();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  if (!catalog) return <p>Chargement des paramètres…</p>;
  async function save(e) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    for (const key of [
      'deliveryFee',
      'earnEvery',
      'redeemPoints',
      'redeemValue',
      'referralBonus',
      'pointValidityDays',
    ])
      values[key] = Number(values[key]);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/settings', { method: 'PUT', body: values });
      await refreshCatalog();
      setMessage('Paramètres enregistrés pour les prochaines opérations.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle title="Les règles de la maison" eyebrow="ADMINISTRATION" />
      <RestaurantBranding />
      <form className="panel settings-form" onSubmit={save} key={JSON.stringify(catalog.settings)}>
        <h2>Le restaurant</h2>
        <Field
          label="Localisation"
          name="location"
          defaultValue={catalog.settings.location}
          required
          minLength="3"
          maxLength="150"
        />
        <Field
          label="Horaires affichés"
          name="openingHours"
          defaultValue={catalog.settings.openingHours}
          required
          minLength="3"
          maxLength="150"
        />
        <Field
          label="Frais de livraison (CDF)"
          name="deliveryFee"
          type="number"
          min="0"
          max="100000"
          required
          defaultValue={catalog.settings.deliveryFee}
        />
        <hr />
        <h2>Fidélité et parrainage</h2>
        <p className="muted">
          Le gain est calculé sur les articles réglés, hors remise et livraison, une fois la
          commande honorée.
        </p>
        <div className="two-columns">
          {[
            ['earnEvery', 'CDF dépensés pour gagner 1 point', 10000000],
            ['redeemPoints', 'Points à utiliser par lot', 10000],
            ['redeemValue', 'Valeur d’un lot en CDF', 1000000],
            ['referralBonus', 'Bonus de parrainage en points', 10000],
            ['pointValidityDays', 'Validité des futurs points en jours', 3650],
          ].map(([key, label, max]) => (
            <Field
              label={label}
              name={key}
              key={key}
              type="number"
              min="1"
              max={max}
              required
              defaultValue={catalog.settings[key]}
            />
          ))}
        </div>
        <Alert>{error}</Alert>
        <Alert type="success">{message}</Alert>
        <BusyButton busy={busy} className="button">
          Enregistrer les paramètres <Icon name="check" />
        </BusyButton>
      </form>
    </>
  );
}
