import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, money, date, labels, roleLabels } from './api';
import { useApp } from './context';
import { AnnouncementTeaser } from './engagement';
import { projectTeam } from './team';
import {
  Alert,
  Avatar,
  BusyButton,
  Empty,
  Field,
  Icon,
  Modal,
  PageTitle,
  useResource,
} from './components';

export function Menu() {
  const { user, catalog, changeCart, cart } = useApp();
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState('Tout'),
    [detail, setDetail] = useState(null),
    [added, setAdded] = useState('');
  const { data: loyalty } = useResource(
    () => (user?.role === 'student' ? api('/loyalty') : Promise.resolve(null)),
    [user?.id],
  );
  const dishes = catalog?.dishes || [],
    featured =
      dishes.find((d) => d.id === catalog?.featuredDishId && d.available) ||
      dishes.find((d) => d.id === 'moambe' && d.available) ||
      dishes.find((d) => d.available);
  const branding = catalog?.restaurant?.branding || {};
  const filtered = dishes.filter(
    (d) =>
      (category === 'Tout' || d.category === category) &&
      `${d.name} ${d.description}`.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr')),
  );
  function add(dish) {
    changeCart(dish.id, 1);
    setAdded(`${dish.name} ajouté au panier.`);
  }
  return (
    <>
      <PageTitle title="Menu du jour" />
      <div className="menu-hero-grid">
        <section
          className={`menu-hero ${branding.coverImage ? 'has-custom-cover' : ''}`}
          style={
            branding.coverImage
              ? {
                  backgroundImage: `linear-gradient(90deg,rgba(13,35,23,.94),rgba(13,35,23,.32)),url("${branding.coverImage}")`,
                }
              : undefined
          }
        >
          <div>
            <span className="pill gold">LE PLAT DU JOUR</span>
            <h2>
              <span className="preserve-lines">
                {branding.heroTitle || 'Bien manger,\nbien étudier.'}
              </span>
            </h2>
            <p>
              {featured
                ? `${featured.name} · ${money(featured.price)}`
                : 'Cuisine locale, bonnes pauses.'}
            </p>
            <button
              className="button secondary"
              disabled={!featured}
              onClick={() => setDetail(featured)}
            >
              Découvrir le plat <Icon name="arrow" size={16} />
            </button>
          </div>
          {!branding.coverImage && (
            <div className="hero-plate">
              <img src={featured?.image || '/assets/moambe.webp'} width="260" height="260" alt="" />
            </div>
          )}
        </section>
        <section className="loyalty-teaser panel">
          <Icon name="gift" size={27} />
          <h2>Chaque pause compte.</h2>
          <p>Votre prochain avantage est peut-être déjà dans vos points.</p>
          <strong>
            {user?.role === 'student'
              ? `${loyalty?.balance ?? '…'} points disponibles`
              : 'Des repas, des points, des sourires.'}
          </strong>
          <Link to={user ? '/loyalty' : '/register'} className="button outline">
            {user ? 'Voir mes avantages' : 'Rejoindre la table'}
          </Link>
        </section>
      </div>
      <AnnouncementTeaser />
      <label className="search-box">
        <Icon name="search" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Un plat, une envie…"
          aria-label="Rechercher un plat"
        />
        <span className="search-hint">Cuisiné avec le sourire</span>
      </label>
      <div className="chips" aria-label="Catégories">
        {['Tout', 'Plats', 'Boissons', 'Snacks'].map((c) => (
          <button
            className={`chip ${category === c ? 'selected' : ''}`}
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            key={c}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="section-heading">
        <div>
          <h2>Vos envies du moment</h2>
          <p>Des recettes locales et de bonnes pauses.</p>
        </div>
        <Link to="/ranking" className="text-link">
          Le top du campus <Icon name="arrow" size={16} />
        </Link>
      </div>
      <span className="sr-only" role="status">
        {added}
      </span>
      {!catalog ? (
        <p role="status">Le menu arrive…</p>
      ) : filtered.length === 0 ? (
        <Empty title={dishes.length ? 'Aucun plat trouvé' : 'Le menu se prépare.'} icon="search">
          {dishes.length
            ? 'Essayez un autre mot ou une autre catégorie.'
            : 'Le restaurant ajoutera bientôt ses plats à cette page.'}
        </Empty>
      ) : (
        <div className="dish-grid">
          {filtered.map((dish, index) => (
            <article className={`dish-card ${!dish.available ? 'sold-out' : ''}`} key={dish.id}>
              <button
                className={`dish-art art-${index % 4}`}
                onClick={() => setDetail(dish)}
                aria-label={`Découvrir ${dish.name}`}
              >
                {dish.id === 'moambe' && <span className="pill white">Populaire</span>}
                {!dish.available && <span className="pill white">Épuisé</span>}
                <img src={dish.image} width="156" height="156" alt="" />
              </button>
              <div className="dish-info">
                <button className="text-button dish-title" onClick={() => setDetail(dish)}>
                  {dish.name}
                </button>
                <p>{dish.description}</p>
                <div className="row between">
                  <strong>{money(dish.price)}</strong>
                  <button
                    className="add-button"
                    onClick={() => add(dish)}
                    disabled={
                      !dish.available ||
                      cart[dish.id] >= 20 ||
                      (user?.role && user.role !== 'student')
                    }
                    aria-label={`Ajouter ${dish.name} au panier`}
                  >
                    <Icon name="plus" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <section className="referral-banner">
        <div>
          <h2>La pause est meilleure ensemble.</h2>
          <p>Invitez un ami et découvrez le parrainage.</p>
        </div>
        <Link className="button outline" to={user ? '/loyalty' : '/register'}>
          Inviter mes amis <Icon name="arrow" size={16} />
        </Link>
      </section>
      {detail && (
        <Modal title={detail.name} onClose={() => setDetail(null)}>
          <div className="detail-art">
            <img src={detail.image} width="260" height="260" alt="" />
          </div>
          <p>{detail.description}</p>
          <p className="price">{money(detail.price)}</p>
          <p className="muted">
            Allergies ou besoin particulier ? Contactez l’équipe avant de commander.
          </p>
          <button
            className="button full"
            disabled={
              !detail.available || cart[detail.id] >= 20 || (user?.role && user.role !== 'student')
            }
            onClick={() => {
              add(detail);
              setDetail(null);
            }}
          >
            {detail.available ? 'Ajouter au panier' : 'Plat épuisé'}
            <Icon name="plus" />
          </button>
        </Modal>
      )}
    </>
  );
}
export function Cart() {
  const { cart, changeCart, setCart, catalog, user } = useApp(),
    navigate = useNavigate();
  const [service, setService] = useState('onsite'),
    [points, setPoints] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const key = useRef({ signature: '', value: '' });
  const { data: loyalty } = useResource(
    () => (user?.role === 'student' ? api('/loyalty') : Promise.resolve(null)),
    [user?.id],
  );
  const dishes = catalog?.dishes || [],
    items = Object.entries(cart).map(([id, quantity]) => ({
      ...dishes.find((d) => d.id === id),
      id,
      quantity,
    }));
  if (!catalog) return <p role="status">Chargement du panier…</p>;
  const rules = catalog.settings;
  const subtotal = items.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0),
    discount = (points / rules.redeemPoints) * rules.redeemValue,
    fee = service === 'delivery' ? rules.deliveryFee : 0;
  const total = Math.max(0, subtotal - discount) + fee;
  const paymentUnavailable = catalog.paymentMode === 'disabled' && total > 0;
  const maxLots = Math.min(
    Math.floor((loyalty?.balance || 0) / rules.redeemPoints),
    Math.floor(subtotal / rules.redeemValue),
  );
  async function submit(event) {
    event.preventDefault();
    if (!user) {
      navigate('/login', { state: { from: '/cart' } });
      return;
    }
    if (paymentUnavailable) {
      setError('Le paiement est temporairement indisponible. Votre panier est conservé.');
      return;
    }
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    try {
      const body = {
        items: items.map((item) => ({ dishId: item.id, quantity: item.quantity })),
        service,
        points,
      };
      if (service === 'onsite') {
        if (!values.arrivalAt) throw new Error('Indiquez votre heure d’arrivée.');
        body.arrivalAt = new Date(values.arrivalAt).toISOString();
      } else body.address = values.address;
      const signature = JSON.stringify(body);
      if (key.current.signature !== signature)
        key.current = { signature, value: crypto.randomUUID() };
      const { order } = await api('/orders', {
        method: 'POST',
        body: { ...body, requestKey: key.current.value },
      });
      setCart({});
      navigate(order.total === 0 ? '/orders' : `/payment/${order.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle title="Mon panier" />
      <div className="steps">
        <span className="active">1. Votre repas</span>
        <span>2. Paiement</span>
        <span>3. À table !</span>
      </div>
      {items.length === 0 ? (
        <Empty title="Votre prochaine pause commence ici">
          <Link className="button" to="/">
            Découvrir le menu
          </Link>
        </Empty>
      ) : (
        <form onSubmit={submit} className="checkout-grid">
          <section className="panel">
            <h2>Une belle pause en préparation.</h2>
            {items.map((item) => (
              <div className="cart-item" key={item.id}>
                <div className="cart-image">
                  <img src={item.image || '/assets/moambe.webp'} width="80" height="80" alt="" />
                </div>
                <div className="cart-description">
                  <strong>{item.name || 'Article retiré du menu'}</strong>
                  <p>{item.price ? money(item.price) : 'Indisponible'}</p>
                  {!item.available && (
                    <small className="error-text">Retirez cet article indisponible.</small>
                  )}
                </div>
                <div className="stepper">
                  <button
                    type="button"
                    onClick={() => changeCart(item.id, -1)}
                    aria-label={`Retirer un ${item.name}`}
                  >
                    <Icon name="minus" size={16} />
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => changeCart(item.id, 1)}
                    disabled={item.quantity >= 20}
                    aria-label={`Ajouter un ${item.name}`}
                  >
                    <Icon name="plus" size={16} />
                  </button>
                </div>
                <strong>{money((item.price || 0) * item.quantity)}</strong>
              </div>
            ))}
            <Link className="text-link" to="/">
              Ajouter une autre envie <Icon name="plus" size={16} />
            </Link>
            <hr />
            <h2>On vous sert comment ?</h2>
            <div className="service-options">
              {[
                ['onsite', 'Sur place', 'Votre table vous attend.'],
                ['delivery', 'Livraison', 'Votre pause vient à vous.'],
              ].map(([value, title, sub]) => (
                <label className={service === value ? 'selected' : ''} key={value}>
                  <input
                    type="radio"
                    name="service"
                    value={value}
                    checked={service === value}
                    onChange={() => setService(value)}
                  />
                  <strong>{title}</strong>
                  <small>{sub}</small>
                </label>
              ))}
            </div>
            {service === 'onsite' ? (
              <Field
                label="Date et heure d’arrivée (heure locale)"
                name="arrivalAt"
                type="datetime-local"
                required
              />
            ) : (
              <Field
                label="Adresse complète et repère · Kinshasa"
                name="address"
                defaultValue={user?.delivery_address || ''}
                placeholder="Commune, avenue, numéro et repère"
                minLength="8"
                maxLength="400"
                required
              />
            )}
          </section>
          <aside className="panel summary">
            <h2>Le récapitulatif</h2>
            <dl>
              <div>
                <dt>Articles</dt>
                <dd>{money(subtotal)}</dd>
              </div>
              <div>
                <dt>Livraison</dt>
                <dd>{fee ? money(fee) : 'Offerte sur place'}</dd>
              </div>
              <div>
                <dt>Avantage fidélité</dt>
                <dd>− {money(discount)}</dd>
              </div>
            </dl>
            {user?.role === 'student' && (
              <label className="field">
                <span>Utiliser mes points · {loyalty?.balance ?? 0} disponibles</span>
                <select value={points} onChange={(e) => setPoints(Number(e.target.value))}>
                  <option value="0">Garder mes points</option>
                  {Array.from({ length: maxLots }, (_, i) => (
                    <option key={i} value={(i + 1) * rules.redeemPoints}>
                      {(i + 1) * rules.redeemPoints} points · −{money((i + 1) * rules.redeemValue)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <hr />
            <div className="row between total">
              <strong>Total</strong>
              <strong>{money(total)}</strong>
            </div>
            <small className="muted">
              Le serveur vérifie les prix, la disponibilité et les points avant la confirmation.
            </small>
            {paymentUnavailable && (
              <Alert type="info">
                Le paiement est temporairement indisponible. Votre panier reste enregistré ; aucune
                commande ni demande de débit ne sera créée. Si vos points couvrent le total, vous
                pouvez les utiliser pour confirmer.
              </Alert>
            )}
            <Alert>{error}</Alert>
            <BusyButton
              busy={busy}
              className="button full"
              disabled={
                paymentUnavailable ||
                items.some((i) => !i.available) ||
                (user && user.role !== 'student')
              }
            >
              {paymentUnavailable
                ? 'Paiement indisponible'
                : user
                  ? total === 0
                    ? 'Confirmer avec mes points'
                    : 'Continuer vers le paiement'
                  : 'Se connecter pour commander'}
              <Icon name="arrow" />
            </BusyButton>
            <p className="summary-note">
              <Icon name="gift" size={16} /> Des points après votre commande honorée.
            </p>
          </aside>
        </form>
      )}
    </>
  );
}
export function Payment() {
  const { id } = useParams(),
    { user, catalog } = useApp();
  const [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [phone, setPhone] = useState(() => (user?.phone || '').replace(/^\+243|^0/, ''));
  const { data, error: loadError } = useResource(() => api(`/orders/${id}`), [id, refresh], true);
  const sandbox = catalog?.paymentMode === 'easypay-sandbox';
  const demo = catalog?.paymentMode === 'demo';
  const order = data?.order,
    payment = order?.payments.find((p) => p.status === 'pending');
  async function run(action) {
    setBusy(true);
    setError('');
    try {
      await action();
      setRefresh((r) => r + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function initiate(e) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    body.phone = `+243${body.phone}`;
    await run(() => api(`/orders/${id}/payments`, { method: 'POST', body }));
  }
  return (
    <>
      <PageTitle title="Paiement Mobile Money" />
      <Alert>{loadError || error}</Alert>
      {!order ? (
        <p role="status">Chargement de la commande…</p>
      ) : (
        <div className="payment-layout panel">
          <span className="pill">ÉTAPE 2 SUR 3</span>
          <h2>Payez en toute simplicité.</h2>
          <p className="muted">Commande #{id.slice(0, 8).toUpperCase()}</p>
          <p className="price">{money(order.total)}</p>
          {order.payment_status === 'paid' ? (
            <>
              <div className="success-circle">
                <Icon name="check" size={38} />
              </div>
              <h2>Votre commande est confirmée.</h2>
              <Alert type="success">
                {demo
                  ? 'Paiement simulé confirmé. Aucun argent n’a été débité.'
                  : sandbox
                    ? 'Paiement de test EasyPay confirmé.'
                    : 'Paiement confirmé par EasyPay.'}
              </Alert>
              <Link className="button full" to="/orders">
                Suivre ma commande
              </Link>
            </>
          ) : order.status === 'cancelled' ? (
            <Empty title="Commande annulée">
              <Link to="/">Retrouver le menu</Link>
            </Empty>
          ) : (
            <>
              <Alert type="info">
                {demo
                  ? 'Démonstration : aucun débit réel. Vous choisissez le résultat de la simulation.'
                  : sandbox
                    ? 'Environnement de test EasyPay. Utilisez uniquement les numéros de test autorisés par EasyPay.'
                    : catalog?.paymentMode === 'disabled'
                      ? 'Le paiement est temporairement indisponible pour ce restaurant.'
                      : 'Validez le paiement sur votre téléphone. Ne communiquez jamais votre code PIN dans ce site.'}
              </Alert>
              {payment ? (
                <>
                  <div className="success-circle pending">
                    <Icon name="clock" size={38} />
                  </div>
                  <h3>En attente de confirmation</h3>
                  <p className="muted">
                    En utilisation réelle, vous validerez sur votre téléphone. Aucun code PIN n’est
                    demandé dans cette application.
                  </p>
                  {demo ? (
                    <div className="demo-actions">
                      <BusyButton
                        className="button full"
                        busy={busy}
                        onClick={() =>
                          run(() =>
                            api(`/orders/${id}/payments/${payment.id}/simulate`, {
                              method: 'POST',
                              body: { outcome: 'paid' },
                            }),
                          )
                        }
                      >
                        Simuler une réussite
                      </BusyButton>
                      <BusyButton
                        className="button outline full"
                        busy={busy}
                        onClick={() =>
                          run(() =>
                            api(`/orders/${id}/payments/${payment.id}/simulate`, {
                              method: 'POST',
                              body: { outcome: 'failed' },
                            }),
                          )
                        }
                      >
                        Simuler un échec
                      </BusyButton>
                    </div>
                  ) : (
                    <>
                      {payment.provider_state === 'uncertain' && (
                        <Alert>
                          La demande n’a pas reçu de réponse certaine. Contactez le restaurant avant
                          de réessayer ; une validation peut encore arriver.
                        </Alert>
                      )}
                      <BusyButton
                        className="button full"
                        busy={busy}
                        onClick={() =>
                          run(() =>
                            api(`/orders/${id}/payments/${payment.id}/check`, { method: 'POST' }),
                          )
                        }
                      >
                        Vérifier le paiement auprès d’EasyPay
                      </BusyButton>
                    </>
                  )}
                </>
              ) : (
                <form onSubmit={initiate}>
                  <label className="field">
                    <span>Votre opérateur</span>
                    <select name="operator">
                      <option value="m-pesa">M-Pesa</option>
                      <option value="airtel">Airtel Money</option>
                      <option value="orange">Orange Money</option>
                    </select>
                  </label>
                  <div className="field">
                    <label htmlFor="payment-phone">Numéro Mobile Money</label>
                    <span className="phone-input">
                      <span className="phone-prefix" aria-hidden="true">
                        +243
                      </span>
                      <input
                        id="payment-phone"
                        type="tel"
                        inputMode="numeric"
                        name="phone"
                        value={phone}
                        onChange={(event) =>
                          setPhone(event.target.value.replace(/\D/g, '').slice(0, 9))
                        }
                        onPaste={(event) => {
                          event.preventDefault();
                          let value = event.clipboardData.getData('text').replace(/\D/g, '');
                          if (value.length === 12 && value.startsWith('243'))
                            value = value.slice(3);
                          else if (value.length === 10 && value.startsWith('0'))
                            value = value.slice(1);
                          if (/^[1-9][0-9]{8}$/.test(value)) setPhone(value);
                          else
                            setError(
                              'Saisissez les 9 chiffres du numéro après +243, sans le 0 initial.',
                            );
                        }}
                        placeholder="9 chiffres"
                        required
                        maxLength={9}
                        pattern="[1-9][0-9]{8}"
                        aria-describedby="payment-phone-help"
                        autoComplete="tel-national"
                      />
                    </span>
                    <small id="payment-phone-help">
                      RDC (+243) : saisissez les 9 chiffres suivants, sans le 0 initial.
                    </small>
                  </div>
                  {order.payment_status === 'failed' && (
                    <Alert>Cette tentative a échoué. Vous pouvez réessayer.</Alert>
                  )}
                  <BusyButton
                    busy={busy}
                    className="button full"
                    disabled={
                      !['demo', 'easypay-sandbox', 'easypay-live'].includes(catalog?.paymentMode)
                    }
                  >
                    {demo
                      ? 'Démarrer la simulation'
                      : sandbox
                        ? 'Tester avec EasyPay'
                        : 'Payer avec Mobile Money'}
                  </BusyButton>
                </form>
              )}
              <button
                className="text-button"
                disabled={busy || (payment && !demo)}
                onClick={() => run(() => api(`/orders/${id}/cancel`, { method: 'POST' }))}
              >
                Annuler cette commande non payée
              </button>
            </>
          )}
        </div>
      )}
      {!demo && catalog?.demoPreview && <PaymentResponsePreview />}
    </>
  );
}
function PaymentResponsePreview() {
  const [result, setResult] = useState('');
  return (
    <section className="panel section-space">
      <h2>Démonstration des réponses</h2>
      <p>
        Ces boutons montrent un résultat fictif pour la présentation. Ils ne modifient ni la
        commande, ni son paiement EasyPay.
      </p>
      <div className="row">
        <button className="button" onClick={() => setResult('paid')}>
          Simuler une réponse positive
        </button>
        <button className="button outline" onClick={() => setResult('failed')}>
          Simuler une réponse négative
        </button>
      </div>
      {result && (
        <Alert type={result === 'paid' ? 'success' : 'error'}>
          {result === 'paid'
            ? 'APERÇU SIMULÉ : paiement accepté. La commande réelle conserve son statut.'
            : 'APERÇU SIMULÉ : paiement refusé. Aucun paiement n’est annulé chez EasyPay.'}
        </Alert>
      )}
    </section>
  );
}
export function Orders() {
  const [refresh, setRefresh] = useState(0),
    [review, setReview] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const { data, error: loadError } = useResource(() => api('/orders'), [refresh], true);
  async function saveReview(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(`/orders/${review.id}/review`, {
        method: 'POST',
        body: { rating: Number(values.rating), message: values.message },
      });
      setReview(null);
      setRefresh((r) => r + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle title="Mes commandes">
        <Link to="/help" className="button outline">
          <Icon name="chat" />
          Besoin d’aide ?
        </Link>
      </PageTitle>
      <Alert>{loadError}</Alert>
      {!data ? (
        <p role="status">Chargement des commandes…</p>
      ) : data.orders.length === 0 ? (
        <Empty title="Votre histoire gourmande commence bientôt">
          <Link className="button" to="/">
            Choisir mon repas
          </Link>
        </Empty>
      ) : (
        <div className="orders-grid">
          {data.orders.map((order) => (
            <article className="panel order-card" key={order.id}>
              <div className="row between">
                <h2>#{order.id.slice(0, 8).toUpperCase()}</h2>
                <span className={`status ${order.status}`}>{labels[order.status]}</span>
              </div>
              <p className="muted">{date(order.created_at)}</p>
              <ul className="order-lines">
                {order.items.map((i) => (
                  <li key={i.dish_id}>
                    <span>
                      {i.quantity} × {i.name}
                    </span>
                    <strong>{money(i.price * i.quantity)}</strong>
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
                <strong className="price-small">{money(order.total)}</strong>
                <span className={`status ${order.payment_status}`}>
                  {labels[order.payment_status]}
                </span>
              </div>
              {order.status === 'awaiting_payment' && (
                <Link className="button full" to={`/payment/${order.id}`}>
                  Payer ma commande
                </Link>
              )}
              {['served', 'delivered'].includes(order.status) && (
                <>
                  <p className="earned">
                    <Icon name="gift" size={16} />
                    {order.points_earned} point(s) gagné(s)
                  </p>
                  {order.review ? (
                    <p>
                      Votre avis : {order.review.rating}/5 · {order.review.message}
                    </p>
                  ) : (
                    <button className="button outline full" onClick={() => setReview(order)}>
                      Donner mon avis
                    </button>
                  )}
                </>
              )}
            </article>
          ))}
        </div>
      )}
      {review && (
        <Modal title="Comment était votre pause ?" onClose={() => setReview(null)}>
          <form onSubmit={saveReview}>
            <label className="field">
              <span>Votre note</span>
              <select name="rating">
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} / 5
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Votre commentaire</span>
              <textarea name="message" required minLength="3" maxLength="1000" />
            </label>
            <Alert>{error}</Alert>
            <BusyButton busy={busy} className="button full">
              Publier mon avis
            </BusyButton>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Loyalty() {
  const [refresh, setRefresh] = useState(0);
  const { data, error } = useResource(() => api('/loyalty'), [refresh]);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [generated, setGenerated] = useState('');
  const [copied, setCopied] = useState(false);
  return (
    <>
      <PageTitle title="Chaque pause compte." />
      <Alert>{error}</Alert>
      {!data ? (
        <p role="status">Chargement de vos avantages…</p>
      ) : (
        <>
          <div className="two-columns">
            <section className="loyalty-card">
              <Icon name="gift" size={34} />
              <p>VOTRE SOLDE FIDÉLITÉ</p>
              <strong>
                {data.balance}
                <small> points</small>
              </strong>
              <h2>Les bonnes habitudes ont du bon.</h2>
              <p>
                {data.rules.redeemPoints} points = {money(data.rules.redeemValue)} de réduction.
                <br />1 point par {money(data.rules.earnEvery)} d’articles réglés et servis.
              </p>
              <Link className="button secondary" to="/">
                Préparer ma prochaine pause <Icon name="arrow" />
              </Link>
            </section>
            <section className="panel">
              <h2>La pause se partage.</h2>
              <p>
                Invitez un ami avec votre code. Sa première commande payée et honorée vous rapporte{' '}
                {data.rules.referralBonus} points.
              </p>
              <div className="referral-code">
                {generated || data.code || 'Votre code vous attend'}
              </div>
              <button
                className="button full"
                disabled={generating}
                onClick={async () => {
                  setGenerating(true);
                  setGenerationError('');
                  setCopied(false);
                  try {
                    const result = await api('/referral/generate', { method: 'POST' });
                    setGenerated(result.code);
                    setRefresh((value) => value + 1);
                  } catch (error) {
                    setGenerationError(error.message);
                  } finally {
                    setGenerating(false);
                  }
                }}
              >
                {generating ? 'Préparation du code…' : 'Générer mon code de parrainage'}
              </button>
              <Alert>{generationError}</Alert>
              {generated && (
                <p role="status">
                  Votre code est prêt à partager. Il reste identique pour préserver vos invitations.
                </p>
              )}
              <button
                className="button outline full"
                disabled={!(generated || data.code)}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(generated || data.code);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? 'Code copié !' : 'Copier mon code'}
              </button>
              <p className="muted">Il pourra saisir ce code à l’inscription.</p>
              <h3>Vos filleuls</h3>
              {data.referrals.length ? (
                data.referrals.map((r, i) => (
                  <p className="row between" key={i}>
                    <span>{r.name}</span>
                    <span className="status">
                      {r.referral_rewarded ? 'Récompense reçue' : 'Première commande attendue'}
                    </span>
                  </p>
                ))
              ) : (
                <p className="muted">Votre première invitation attend son sourire.</p>
              )}
            </section>
          </div>
          <section className="panel section-space">
            <h2>Vos points, en toute transparence</h2>
            <p className="muted">
              Les points réservés au panier sont déduits du solde disponible. Ils sont restitués si
              la commande non payée est annulée. Les points expirés sont exclus du solde.
            </p>
            {data.lots.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Origine</th>
                      <th>Gagnés</th>
                      <th>Restants</th>
                      <th>Expiration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lots.map((l) => (
                      <tr key={l.source}>
                        <td>
                          {l.source.startsWith('referral:')
                            ? 'Parrainage'
                            : l.source.startsWith('demo:')
                              ? 'Crédit de démonstration'
                              : l.source.startsWith('adjustment:')
                                ? 'Correction de la direction'
                                : 'Commande honorée'}
                        </td>
                        <td>+{l.earned}</td>
                        <td>{new Date(l.expires_at) > new Date() ? l.remaining : 0}</td>
                        <td>{date(l.expires_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>Aucun mouvement pour le moment.</p>
            )}
            {!!data.adjustments?.length && (
              <>
                <h3>Corrections de la direction</h3>
                <ul className="adjustment-list">
                  {data.adjustments.map((a) => (
                    <li key={a.id}>
                      <strong>
                        {a.delta > 0 ? '+' : ''}
                        {a.delta} points
                      </strong>
                      <p>{a.reason}</p>
                      <small>{date(a.created_at)}</small>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}
export function Ranking() {
  const [period, setPeriod] = useState('week');
  const { data, error } = useResource(() => api(`/ranking?period=${period}`), [period]);
  return (
    <>
      <PageTitle title="Le top du campus" />
      <p className="muted">
        Les 10 étudiants qui ont le plus de commandes honorées sur la période. Les périodes suivent
        l’heure de Kinshasa.
      </p>
      <Period value={period} onChange={setPeriod} />
      <Alert>{error}</Alert>
      <section className="panel ranking">
        {data?.ranking.length ? (
          data.ranking.map((r) => (
            <div className="ranking-row" key={r.rank}>
              <strong className="rank-number">{String(r.rank).padStart(2, '0')}</strong>
              <span>{r.name}</span>
              <span>{r.count} commande(s)</span>
              <Icon name="star" />
            </div>
          ))
        ) : (
          <Empty
            title={data ? 'Le classement attend vos pauses.' : 'Chargement du classement…'}
            icon="star"
          >
            Les commandes payées et servies ou livrées apparaîtront ici.
          </Empty>
        )}
      </section>
    </>
  );
}
export function Period({ value, onChange }) {
  return (
    <div className="chips">
      {[
        ['day', 'Aujourd’hui'],
        ['week', 'Cette semaine'],
        ['month', 'Ce mois'],
      ].map(([v, label]) => (
        <button
          key={v}
          className={`chip ${v === value ? 'selected' : ''}`}
          aria-pressed={v === value}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
const palettes = [
  ['official', 'Officiel', '#CFBD97'],
  ['forest', 'Forêt', '#215E49'],
  ['burgundy', 'Bordeaux', '#842F41'],
  ['blue', 'Bleu', '#2554A2'],
  ['plum', 'Prune', '#70438A'],
  ['orange', 'Orange', '#B04A17'],
];
export function Profile() {
  const { user, setUser } = useApp();
  const { data: profileLoyalty } = useResource(
    () => (user.role === 'student' ? api('/loyalty') : Promise.resolve(null)),
    [user.id],
  );
  const [form, setForm] = useState(() => ({
    name: user.name,
    phone: user.phone,
    deliveryAddress: user.delivery_address || '',
    theme: user.theme,
    dark: user.dark,
    public_ranking: user.public_ranking,
  }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const update = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  useEffect(() => {
    document.documentElement.dataset.theme = form.theme;
    document.documentElement.dataset.mode = form.dark ? 'dark' : 'light';
    return () => {
      document.documentElement.dataset.theme = user.theme;
      document.documentElement.dataset.mode = user.dark ? 'dark' : 'light';
    };
  }, [form.theme, form.dark, user.theme, user.dark]);
  async function action(fn) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    await action(async () => {
      const body = new FormData();
      body.append('photo', file);
      const { photo } = await api('/auth/me/photo', { method: 'POST', body });
      setUser((old) => ({ ...old, photo }));
      setMessage('Photo de profil enregistrée.');
    });
    e.target.value = '';
  }
  return (
    <>
      <PageTitle title="Mon profil, mon style" />
      {user.role === 'student' && (
        <section className="panel announcement-teaser">
          <div>
            <h2>{profileLoyalty?.balance ?? '…'} points disponibles</h2>
            <p>Consultez vos gains, vos corrections et vos avantages.</p>
          </div>
          <Link className="button outline" to="/loyalty">
            Mes avantages fidélité
          </Link>
        </section>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          action(async () => {
            const { user: saved } = await api('/auth/me', { method: 'PATCH', body: form });
            setUser(saved);
            setMessage('Vos préférences sont enregistrées.');
          });
        }}
      >
        <div className="profile-grid">
          <section className="panel">
            <h2>Votre place à notre table</h2>
            <div className="profile-photo">
              <Avatar user={user} size={96} />
              <div>
                <label className="button outline upload-label">
                  Changer la photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={upload}
                    disabled={busy}
                  />
                </label>
                <p className="muted small">JPEG, PNG, WebP · 3 Mo maximum</p>
                {user.photo && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        await api('/auth/me/photo', { method: 'DELETE' });
                        setUser((old) => ({ ...old, photo: null }));
                        setMessage('Photo supprimée.');
                      })
                    }
                  >
                    Supprimer la photo
                  </button>
                )}
              </div>
            </div>
            <Field
              label="Nom complet"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              required
              minLength="2"
              maxLength="80"
            />
            <Field
              label="Téléphone"
              type="tel"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              required
              pattern="\+243[0-9]{9}"
            />
            <Field label="Adresse e-mail" value={user.email} readOnly />
            {user.role === 'student' && (
              <Field
                label="Adresse habituelle de livraison"
                value={form.deliveryAddress}
                onChange={(e) => update('deliveryAddress', e.target.value)}
                maxLength={400}
                autoComplete="street-address"
                placeholder="Commune, avenue, numéro et repère"
              />
            )}
            <p className="muted">Votre espace : {roleLabels[user.role]}</p>
            <label className="check-field">
              <input
                type="checkbox"
                checked={form.public_ranking}
                onChange={(e) => update('public_ranking', e.target.checked)}
              />
              <span>Afficher mon nom dans le classement public du campus.</span>
            </label>
            <Link className="text-link" to="/privacy">
              Comprendre l’utilisation de mes données <Icon name="arrow" size={16} />
            </Link>
          </section>
          <section className="panel">
            <h2>Une pause à vos couleurs.</h2>
            <p className="muted">Choisissez votre palette et prévisualisez-la ici.</p>
            <div className="theme-grid">
              {palettes.map(([value, label, color]) => (
                <label
                  key={value}
                  className={`theme-choice ${form.theme === value ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="theme"
                    checked={form.theme === value}
                    onChange={() => update('theme', value)}
                  />
                  <span style={{ background: color }} />
                  <strong>{label}</strong>
                  {form.theme === value && <Icon name="check" size={16} />}
                </label>
              ))}
            </div>
            <h3>Lumière d’ambiance</h3>
            <div className="chips">
              <button
                type="button"
                className={`chip ${!form.dark ? 'selected' : ''}`}
                onClick={() => update('dark', false)}
              >
                Clair
              </button>
              <button
                type="button"
                className={`chip ${form.dark ? 'selected' : ''}`}
                onClick={() => update('dark', true)}
              >
                Sombre
              </button>
            </div>
            <div className="theme-preview">
              <span className="pill">VOTRE APERÇU</span>
              <h3>Bien manger, bien étudier.</h3>
              <p>Les mêmes bonnes pauses, votre touche en plus.</p>
              <span className="button">
                C’est tout moi <Icon name="check" />
              </span>
            </div>
          </section>
        </div>
        <div className="save-bar">
          <div>
            <Alert>{error}</Alert>
            <Alert type="success">{message}</Alert>
          </div>
          <BusyButton className="button" busy={busy}>
            Enregistrer mon profil <Icon name="check" />
          </BusyButton>
        </div>
      </form>
    </>
  );
}
export function Complaints({ staff = false }) {
  const { user } = useApp();
  const canPublish = ['manager', 'admin'].includes(user.role);
  const awaitsAdministrator = (complaint) =>
    complaint.status === 'pending' && complaint.review_role === 'admin' && user.role !== 'admin';
  const [refresh, setRefresh] = useState(0),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const { data, error: loadError } = useResource(() => api('/complaints'), [refresh], true);
  const { data: orders } = useResource(
    () => (staff ? Promise.resolve(null) : api('/orders')),
    [staff],
  );
  async function action(fn) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const r = await fn();
      setMessage(r.message || 'Réclamation enregistrée.');
      setRefresh((v) => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle title={staff ? 'Les réclamations' : 'On est là pour vous.'} />
      <Alert>{loadError || error}</Alert>
      <Alert type="success">{message}</Alert>
      {!staff && (
        <section className="panel section-space">
          <h2>Une pause qui ne s’est pas passée comme prévu ?</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const body = Object.fromEntries(new FormData(e.currentTarget));
              const form = e.currentTarget;
              action(async () => {
                const r = await api('/complaints', { method: 'POST', body });
                form.reset();
                return r;
              });
            }}
          >
            <label className="field">
              <span>Commande concernée</span>
              <select name="orderId" required defaultValue="">
                <option value="" disabled>
                  Choisir une commande
                </option>
                {orders?.orders.map((o) => (
                  <option value={o.id} key={o.id}>
                    #{o.id.slice(0, 8).toUpperCase()} · {date(o.created_at)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Expliquez-nous le problème</span>
              <textarea
                name="message"
                required
                minLength="10"
                maxLength="2000"
                placeholder="Dites-nous ce qui s’est passé…"
              />
            </label>
            <BusyButton className="button" busy={busy} disabled={!orders?.orders.length}>
              Envoyer ma réclamation
            </BusyButton>
          </form>
        </section>
      )}
      <div className="complaint-list">
        {data?.complaints.length ? (
          data.complaints.map((c) => (
            <article className="panel" key={c.id}>
              <div className="row between">
                <h2>Commande #{c.order_id.slice(0, 8).toUpperCase()}</h2>
                <span className="status">{labels[c.status] || 'À valider'}</span>
              </div>
              <p className="muted">
                {staff ? `${c.name} · ` : ''}
                {date(c.created_at)}
              </p>
              <p className="preserve-lines">{c.message}</p>
              {c.response && (
                <div className="approved-response">
                  <strong>La réponse de notre équipe</strong>
                  <p className="preserve-lines">{c.response}</p>
                </div>
              )}
              {!staff && c.status !== 'resolved' && (
                <p className="muted">
                  Notre équipe prépare une réponse qui sera validée par la direction.
                </p>
              )}
              {staff && c.status !== 'resolved' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const { draft } = Object.fromEntries(new FormData(e.currentTarget));
                    const publish = e.nativeEvent.submitter?.value === 'publish';
                    action(() =>
                      api(`/complaints/${c.id}/${publish ? 'decision' : 'draft'}`, {
                        method: 'POST',
                        body: publish ? { approve: true, draft } : { draft },
                      }),
                    );
                  }}
                >
                  <label className="field">
                    <span>Proposition de réponse (interne)</span>
                    <textarea
                      name="draft"
                      defaultValue={c.draft || ''}
                      key={`${c.id}-${c.draft}`}
                      minLength="10"
                      maxLength="2000"
                      required
                      readOnly={awaitsAdministrator(c)}
                    />
                  </label>
                  {c.status === 'pending' && c.review_role === 'admin' && (
                    <p className="muted">En attente de validation par l’administrateur.</p>
                  )}
                  <div className="row decision-actions">
                    {user.role !== 'admin' && (
                      <BusyButton
                        type="submit"
                        value="propose"
                        className="button outline"
                        busy={busy}
                        disabled={awaitsAdministrator(c)}
                      >
                        {user.role === 'manager'
                          ? 'Proposer à l’administrateur'
                          : 'Proposer au gérant'}
                      </BusyButton>
                    )}
                    {canPublish && (
                      <BusyButton
                        type="submit"
                        value="publish"
                        className="button"
                        busy={busy}
                        disabled={awaitsAdministrator(c)}
                      >
                        Valider et publier
                      </BusyButton>
                    )}
                  </div>
                </form>
              )}
              {staff && c.status === 'pending' && canPublish && !awaitsAdministrator(c) && (
                <div className="row decision-actions">
                  <BusyButton
                    className="button outline"
                    busy={busy}
                    onClick={() =>
                      action(() =>
                        api(`/complaints/${c.id}/decision`, {
                          method: 'POST',
                          body: { approve: false },
                        }),
                      )
                    }
                  >
                    Demander une révision
                  </BusyButton>
                </div>
              )}
            </article>
          ))
        ) : (
          <Empty title={data ? 'Aucune réclamation pour le moment' : 'Chargement…'} icon="chat">
            Les demandes et leurs réponses apparaîtront ici.
          </Empty>
        )}
      </div>
    </>
  );
}
export function Privacy() {
  const { catalog } = useApp();
  const mode = catalog?.paymentMode;
  return (
    <>
      <PageTitle title="Confidentialité et mentions du projet" />
      <article className="panel prose">
        <p className="notice">
          Version du 27 octobre 2026. Démonstration pédagogique réservée aux étudiants. Les
          simulations ne constituent ni un encaissement ni une commande à livrer réellement.
        </p>
        <h2>Conditions d’utilisation et de commande</h2>
        <p>
          Utilisez une adresse e-mail qui vous appartient, ne partagez pas votre mot de passe et ne
          publiez pas de données concernant un tiers sans son accord. Les photos doivent vous
          appartenir ou être utilisées avec une autorisation suffisante. Les contenus injurieux,
          frauduleux ou portant atteinte à la vie privée peuvent être retirés par l’équipe après
          vérification.
        </p>
        <p>
          Le menu indique les prix en CDF. Avant validation, le récapitulatif précise les quantités,
          la réduction éventuelle et les frais de livraison. Le serveur recalcule le total. Vérifiez
          votre adresse et votre heure d’arrivée. Une commande en attente ne prouve pas un paiement
          ; seule une confirmation vérifiée du fournisseur peut le confirmer en mode réel.
        </p>
        <p>
          Une commande non payée peut être annulée lorsque son état le permet. Une commande payée ne
          peut pas être remboursée automatiquement depuis cette application : contactez le
          restaurant avec sa référence. Une erreur ou un refus ne justifie pas de répéter un débit.
          Le règlement d’un litige de paiement ou un remboursement réel doit être confirmé avec le
          restaurant et le fournisseur.
        </p>
        <p>
          Les points, leur expiration et les seuils de réduction sont affichés dans « Fidélité ».
          Les récompenses sont attribuées après une commande payée et servie ou livrée. Les
          invitations utilisent un code personnel stable ; le bonus du parrain dépend de la première
          commande éligible du filleul. Les points ne sont pas une somme d’argent retirable.
        </p>
        <p>
          Pour une réclamation, utilisez l’aide du site ou le contact ci-dessous en indiquant la
          référence de commande, la date et le problème, sans communiquer de mot de passe ni de code
          PIN. L’équipe examine la demande ; une réponse proposée par un employé est soumise à
          validation avant publication.
        </p>
        <h2>Éditeur pédagogique</h2>
        <p>
          Mon Miam Miam est un projet de cours de Développement Web réalisé par le groupe
          ci-dessous, pour un restaurant étudiant adapté au contexte de la RDC. Cette version sert à
          la démonstration et à la recette du groupe.
        </p>
        <p>
          Contact du projet et demandes concernant les données :{' '}
          <a href="mailto:merdi.tshinyama@2030.ulc-icam.com">merdi.tshinyama@2030.ulc-icam.com</a>.
        </p>
        <h2>L’équipe du projet</h2>
        <ul>
          {projectTeam.map(([name, email]) => (
            <li key={email}>
              <strong>{name}</strong> · <a href={`mailto:${email}`}>{email}</a>
            </li>
          ))}
        </ul>
        <h2>Informations utilisées et finalités</h2>
        <p>
          Nom, e-mail, téléphone et mot de passe protégé servent à gérer votre compte. Une adresse
          habituelle de livraison peut être enregistrée ; l’adresse de chaque livraison est
          conservée avec sa commande. Les commandes, points, parrainages, réclamations, avis et
          inscriptions aux événements permettent de fournir les fonctions choisies. Photo et
          publication de votre nom au classement sont facultatives.
        </p>
        <h2>Cookies et préférences</h2>
        <p>
          Le cookie de session est nécessaire à la connexion. Le panier, le choix d’information sur
          les cookies et certaines préférences sont conservés sur votre appareil. Aucun traceur
          publicitaire ou analytique tiers n’est intégré. Les images importées sont réencodées sans
          métadonnées.
        </p>
        <h2>Destinataires et hébergement</h2>
        <p>
          L’équipe du restaurant accède aux données nécessaires au traitement des commandes selon
          son rôle. Le site déployé et sa base utilisent Render, dans la région de Francfort.
          L’installation locale conserve ses données sur le PC ; celles-ci ne sont pas
          automatiquement copiées sur le site déployé. Si l’envoi de récupération est configuré,
          Resend reçoit l’adresse destinataire et le lien temporaire demandé.
        </p>
        <p>
          Dans cette version étudiante, l’envoi de récupération est limité à
          merdi.tshinyama@2030.ulc-icam.com. Les liens ne sont pas redirigés vers cette adresse pour
          les autres comptes. Leur propriétaire doit contacter le responsable pour une assistance.
        </p>
        <p>
          Vos avis et votre nom au classement peuvent être visibles selon vos choix ; les
          réclamations et les données de commande restent accessibles aux personnes habilitées. Le
          groupe ne vend pas les données et n’utilise pas de publicité ciblée.
        </p>
        <h2>Paiements</h2>
        <p>
          {mode === 'demo'
            ? 'Cette installation utilise des paiements simulés, sans débit réel.'
            : mode === 'easypay-sandbox'
              ? 'Cette installation utilise le sandbox EasyPay. Une réponse fictive de démonstration ne vaut pas confirmation du fournisseur.'
              : mode === 'easypay-live'
                ? 'Le paiement Mobile Money est transmis à EasyPay. La confirmation dépend du fournisseur et de la validation sur votre téléphone.'
                : 'Le paiement externe est désactivé pour ce restaurant.'}{' '}
          Aucun code PIN n’est collecté sur le site. Le numéro, le nom, le montant et la référence
          de commande nécessaires à une demande EasyPay sont transmis au fournisseur lorsque vous la
          déclenchez.
        </p>
        <h2>Accès, rectification et retrait</h2>
        <p>
          Vous pouvez corriger votre profil, remplacer ou retirer votre photo et choisir l’affichage
          de votre nom au classement. Pour demander l’accès, la correction ou l’effacement d’autres
          données, écrivez au contact du projet depuis l’adresse du compte. L’équipe vérifie la
          demande avant toute opération et précise les éléments devant éventuellement être
          conservés. La suppression d’un membre du personnel retire son accès tout en conservant la
          traçabilité ; elle n’efface pas toutes ses données.
        </p>
        <h2>Conservation et fin de démonstration</h2>
        <p>
          Les sessions expirent après sept jours ; les liens de récupération après trente minutes.
          Les points ont une validité définie par le restaurant. La base gratuite de démonstration
          Render annonce une expiration le 22 novembre 2026. Le groupe doit organiser l’export, la
          suppression ou l’anonymisation des données de test à la fin de la recette. Aucune
          suppression automatique générale des comptes ou commandes n’est actuellement promise.
        </p>
        <h2>Cadre et limites de cette version</h2>
        <p>
          Le cadre de référence en RDC est l’ordonnance-loi n° 23/010 du 13 mars 2023 portant Code
          du numérique, notamment les dispositions relatives aux données personnelles. L’hébergement
          à l’étranger doit faire l’objet d’une vérification des formalités et conditions de
          transfert applicables avant une ouverture au public. Le consentement seul ne remplace pas
          ces démarches.
        </p>
        <p>
          <a
            href="https://are.gouv.cd/download/ordonnance-loi-23-010-du-13-mars-portant-code-du-numerique/"
            target="_blank"
            rel="noreferrer"
          >
            Consulter le Code du numérique sur le site de l’ARE
          </a>
          . Le guide juridique du projet distingue les mesures en place, les opérations manuelles et
          les validations restant à obtenir. Aucune autorisation administrative ni immatriculation
          commerciale n’est revendiquée.
        </p>
        <p>
          Les photos d’illustration et leurs sources sont indiquées dans les crédits. Le code et les
          documents ont été produits avec l’assistance de Codex ; les membres assurent leur revue,
          leurs essais et leur présentation. Le passage à une exploitation commerciale nécessite la
          confirmation de l’exploitant, de ses coordonnées, des durées de conservation et des
          démarches juridiques applicables. Cette présentation pédagogique ne constitue pas une
          certification de conformité.
        </p>
      </article>
    </>
  );
}
