import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { api, roleLabels } from './api';
import { useApp } from './context';

const paths = {
  home: 'M3 10L12 3L21 10V21H15V14H9V21H3Z',
  bag: 'M5 7H19L21 21H3ZM9 8V6A3 3 0 0 1 15 6V8',
  gift: 'M3 9H21V14H3ZM5 14V22H19V14M12 9V22M12 9C4 9 5 1 9 3L12 9C20 9 19 1 15 3Z',
  user: 'M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8ZM4 22v-2a8 8 0 0 1 16 0v2',
  search: 'M10 3a7 7 0 1 1 0 14a7 7 0 0 1 0-14ZM15 15L21 21',
  arrow: 'M5 12H20M14 6L20 12L14 18',
  clock: 'M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18ZM12 7V12L16 15',
  plus: 'M12 5V19M5 12H19',
  minus: 'M5 12H19',
  check: 'M4 12L10 18L21 5',
  chat: 'M3 3H21V17H9L3 22Z',
  chart: 'M3 21H22M6 17V12M12 17V5M18 17V9',
  settings: 'M4 7H20M4 17H20M8 3V11M16 13V21',
  logout: 'M10 3H3V21H10M8 12H22M17 7L22 12L17 17',
  star: 'M12 2L15 8L22 9L17 14L18 21L12 18L6 21L7 14L2 9L9 8Z',
  close: 'M5 5L19 19M19 5L5 19',
};
export function Icon({ name, size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name] || paths.home} />
    </svg>
  );
}
export function Brand() {
  const { catalog } = useApp();
  const restaurant = catalog?.restaurant;
  return (
    <Link to="/" className="brand" aria-label={`${restaurant?.name || 'Mon Miam Miam'}, accueil`}>
      <img
        src={restaurant?.branding?.logo || '/assets/mon-miam-miam.svg'}
        width="44"
        height="44"
        alt=""
      />
      <span title={restaurant?.name || 'Mon Miam Miam'}>{restaurant?.name || 'Mon Miam Miam'}</span>
    </Link>
  );
}
export function Avatar({ user, size = 42 }) {
  return user?.photo ? (
    <img
      className="avatar"
      style={{ width: size, height: size }}
      src={user.photo}
      alt="Votre photo de profil"
    />
  ) : (
    <span className="avatar" style={{ width: size, height: size }}>
      {user?.name
        .split(' ')
        .slice(0, 2)
        .map((s) => s[0])
        .join('')
        .toUpperCase() || '?'}
    </span>
  );
}
export function Alert({ children, type = 'error' }) {
  return children ? (
    <div className={`alert ${type}`} role={type === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  ) : null;
}
export function Empty({ title, children, icon = 'bag' }) {
  return (
    <div className="empty">
      <Icon name={icon} size={36} />
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function PageTitle({ eyebrow = 'LA PAUSE QUI FAIT DU BIEN', title, children }) {
  return (
    <div className="page-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
export function Field({ label, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}
export function BusyButton({ busy, children, ...props }) {
  return (
    <button {...props} disabled={busy || props.disabled}>
      {busy ? 'Un instant…' : children}
    </button>
  );
}
export function useResource(load, deps = [], poll = true) {
  const [data, setData] = useState(null),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    let busy = false;
    const run = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const value = await load();
        if (live) {
          setData(value);
          setError('');
        }
      } catch (e) {
        if (live) setError(e.message);
      } finally {
        busy = false;
      }
    };
    run();
    const timer = poll ? setInterval(run, 10000) : null;
    return () => {
      live = false;
      if (timer) clearInterval(timer);
    };
    // Callers declare all dependencies explicitly, including their refresh counter.
  }, deps);
  return { data, error };
}
export function Modal({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} className="modal">
      <div className="row between">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Fermer" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function CookieNotice() {
  const [open, setOpen] = useState(() => !localStorage.getItem('mmm-cookie-choice'));
  if (!open) return null;
  const choose = (value) => {
    localStorage.setItem('mmm-cookie-choice', value);
    setOpen(false);
  };
  return (
    <aside className="cookie-notice" aria-label="Confidentialité">
      <div>
        <strong>Une pause, en toute confiance.</strong>
        <p>
          Un cookie protège votre connexion. Aucun traceur publicitaire ou analytique n’est utilisé.
          Vos choix d’apparence et votre panier sont conservés sur cet appareil.
        </p>
      </div>
      <div className="row">
        <button className="button secondary" onClick={() => choose('essential')}>
          Essentiels uniquement
        </button>
        <button className="button" onClick={() => choose('acknowledged')}>
          J’ai compris
        </button>
      </div>
    </aside>
  );
}
export function Layout({ user, cartCount, onLogout, children }) {
  const { catalog } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    function close(e) {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'keydown' || !menuRef.current?.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, []);
  const staff = user && user.role !== 'student';
  const nav = staff
    ? [
        ['/restaurant', 'Commandes', 'bag'],
        ['/restaurant/menu', 'Menu', 'home'],
        ['/restaurant/complaints', 'Réclamations', 'chat'],
        ['/restaurant/stats', 'Statistiques', 'chart'],
        ...(user.role !== 'employee' ? [['/restaurant/staff', 'Équipe', 'user']] : []),
        ...(user.role === 'admin'
          ? [
              ['/restaurant/events', 'Affiches', 'gift'],
              ['/restaurant/points', 'Points', 'star'],
              ['/restaurant/settings', 'Paramètres', 'settings'],
            ]
          : []),
      ]
    : [
        ['/', 'Menu', 'home'],
        ['/orders', 'Commandes', 'bag'],
        ['/loyalty', 'Fidélité', 'gift'],
        ['/profile', 'Profil', 'user'],
        ['/events', 'Rendez-vous', 'gift'],
      ];
  return (
    <>
      <a className="skip-link" href="#main">
        Aller au contenu
      </a>
      <header className="site-header">
        <Brand />
        <nav className="unified-nav" aria-label="Navigation principale" ref={menuRef}>
          <div className="nav-primary">
            {nav.slice(0, 3).map(([to, label, icon]) => (
              <NavLink key={to} to={to} end onClick={() => setMenuOpen(false)}>
                <Icon name={icon} />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
          <button
            className="icon-button nav-overflow"
            type="button"
            aria-label="Plus d’options"
            aria-expanded={menuOpen}
            aria-controls="remaining-links"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <span aria-hidden="true">⋯</span>
            <span className="overflow-label">Plus</span>
          </button>
          <div id="remaining-links" className={`nav-remaining ${menuOpen ? 'is-open' : ''}`}>
            {nav.slice(3).map(([to, label, icon]) => (
              <NavLink key={to} to={to} end onClick={() => setMenuOpen(false)}>
                <Icon name={icon} />
                <span>{label}</span>
              </NavLink>
            ))}
            <a href="/restaurants/new" onClick={() => setMenuOpen(false)}>
              <Icon name="plus" />
              <span>Créer mon restaurant</span>
            </a>
          </div>
        </nav>
        <div className="row header-actions">
          {staff ? (
            <span className="pill">{roleLabels[user.role]}</span>
          ) : (
            <Link className="button secondary cart-link" to="/cart">
              <Icon name="bag" />
              <span>Panier · {cartCount}</span>
            </Link>
          )}
          {user ? (
            <Link to="/profile" aria-label="Ouvrir mon profil">
              <Avatar user={user} />
            </Link>
          ) : (
            <Link className="button" to="/login">
              Connexion
            </Link>
          )}
        </div>
      </header>
      <main id="main" className="container">
        {children}
      </main>
      <footer className="site-footer">
        <Brand />
        <span>{catalog?.settings?.location || 'Kinshasa'} · Prix en CDF</span>
        {(catalog?.restaurant?.branding?.contactEmail ||
          catalog?.restaurant?.branding?.contactPhone) && (
          <div className="restaurant-contact">
            {catalog.restaurant.branding.contactEmail && (
              <a href={`mailto:${catalog.restaurant.branding.contactEmail}`}>
                {catalog.restaurant.branding.contactEmail}
              </a>
            )}
            {catalog.restaurant.branding.contactPhone && (
              <a href={`tel:${catalog.restaurant.branding.contactPhone}`}>
                {catalog.restaurant.branding.contactPhone}
              </a>
            )}
          </div>
        )}
        <Link to="/privacy">Confidentialité · Équipe</Link>
        <a href="/credits-images.txt">Crédits photos · Photos d’illustration</a>
        {user && (
          <button className="text-button" onClick={onLogout}>
            Se déconnecter
          </button>
        )}
      </footer>
      <CookieNotice />
    </>
  );
}
