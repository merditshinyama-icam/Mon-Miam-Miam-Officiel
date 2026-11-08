import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  Link,
  useLocation,
} from 'react-router-dom';
import { api, restaurantBase, cartStorageKey } from './api';
import { AppContext } from './context';
import { Layout, Alert, Empty } from './components';
import {
  Menu,
  Cart,
  Payment,
  Orders,
  Loyalty,
  Ranking,
  Profile,
  Complaints,
  Privacy,
} from './student';
import { Auth } from './auth';
import { Kitchen, ManageMenu, Stats, Staff, Settings } from './restaurant';
import { NewRestaurant } from './onboarding';
import { Restaurants } from './restaurants';
import { PaymentSimulationResult } from './payment-simulation';
import { Invoice } from './invoice';
import { Announcements, PointAdjustments } from './engagement';
import './styles.css';

function Guard({ user, roles, children }) {
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (roles && !roles.includes(user.role))
    return (
      <Empty title="Espace réservé">
        Votre compte ne peut pas accéder à cette page. <Link to="/">Retour au menu</Link>
      </Empty>
    );
  return children;
}
function App() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [catalog, setCatalog] = useState(null),
    [catalogError, setCatalogError] = useState('');
  const [cart, setCart] = useState(() => {
    try {
      const data = JSON.parse(localStorage.getItem(cartStorageKey) || '{}');
      return Object.fromEntries(
        Object.entries(data).filter(
          ([k, v]) => typeof k === 'string' && Number.isInteger(v) && v > 0 && v <= 20,
        ),
      );
    } catch {
      return {};
    }
  });
  const navigate = useNavigate(),
    location = useLocation();
  const refreshCatalog = async () => {
    try {
      setCatalog(await api('/catalog'));
      setCatalogError('');
    } catch (e) {
      setCatalogError(e.message);
    }
  };
  useEffect(() => {
    let live = true;
    api('/auth/me')
      .then((r) => {
        if (live) setUser(r.user);
      })
      .catch(() => {})
      .finally(() => {
        if (live) setLoading(false);
      });
    refreshCatalog();
    const catalogTimer = setInterval(() => {
      if (!document.hidden) refreshCatalog();
    }, 10000);
    return () => {
      clearInterval(catalogTimer);
      live = false;
    };
  }, []);
  useEffect(() => {
    localStorage.setItem(cartStorageKey, JSON.stringify(cart));
  }, [cart]);
  useEffect(() => {
    document.documentElement.dataset.theme =
      user?.theme || catalog?.restaurant?.branding?.defaultTheme || 'official';
    document.documentElement.dataset.mode = user?.dark ? 'dark' : 'light';
    document.title = `${catalog?.restaurant?.name || 'Mon Miam Miam'} · Votre pause gourmande`;
  }, [
    user?.theme,
    user?.dark,
    catalog?.restaurant?.name,
    catalog?.restaurant?.branding?.defaultTheme,
  ]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);
  function changeCart(id, delta) {
    setCart((old) => {
      const next = { ...old };
      next[id] = Math.min(20, Math.max(0, (old[id] || 0) + delta));
      if (!next[id]) delete next[id];
      return next;
    });
  }
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
      setUser(null);
      setCart({});
      navigate('/');
    } catch (e) {
      setCatalogError(e.message);
    }
  }
  const context = { user, setUser, catalog, refreshCatalog, cart, setCart, changeCart };
  const protect = (element, roles) =>
    loading ? (
      <p className="loading" role="status">
        Ouverture de votre espace…
      </p>
    ) : (
      <Guard user={user} roles={roles}>
        {element}
      </Guard>
    );
  const restaurant = ['employee', 'manager', 'admin'];
  return (
    <AppContext.Provider value={context}>
      <Layout
        user={user}
        cartCount={Object.values(cart).reduce((a, b) => a + b, 0)}
        onLogout={logout}
      >
        {catalog?.paymentMode === 'easypay-sandbox' && (
          <div className="demo-banner">EasyPay · Environnement de test sandbox</div>
        )}
        {catalog?.paymentMode === 'demo' && (
          <p className="app-demo-label">
            <span />
            Version de démonstration · Paiements simulés, aucun débit réel
          </p>
        )}
        <Alert>{catalogError}</Alert>
        {catalogError && (
          <button className="text-button" onClick={refreshCatalog}>
            Réessayer le chargement du menu
          </button>
        )}
        <Routes>
          <Route path="/" element={<Menu />} />
          <Route path="/login" element={<Auth mode="login" />} />
          <Route path="/register" element={<Auth mode="register" />} />
          <Route path="/restaurants/new" element={<NewRestaurant />} />
          <Route path="/restaurants" element={<Restaurants />} />
          <Route path="/forgot" element={<Auth mode="forgot" />} />
          <Route path="/reset" element={<Auth mode="reset" />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/events" element={<Announcements />} />
          <Route path="/payment/:id" element={protect(<Payment />, ['student'])} />
          <Route
            path="/payment/:id/simulation"
            element={protect(<PaymentSimulationResult />, ['student'])}
          />
          <Route path="/orders" element={protect(<Orders />, ['student'])} />
          <Route path="/invoice/:id" element={protect(<Invoice />)} />
          <Route path="/loyalty" element={protect(<Loyalty />, ['student'])} />
          <Route path="/ranking" element={protect(<Ranking />)} />
          <Route path="/profile" element={protect(<Profile />)} />
          <Route path="/help" element={protect(<Complaints />)} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/restaurant" element={protect(<Kitchen />, restaurant)} />
          <Route path="/restaurant/menu" element={protect(<ManageMenu />, restaurant)} />
          <Route
            path="/restaurant/complaints"
            element={protect(<Complaints staff />, restaurant)}
          />
          <Route path="/restaurant/stats" element={protect(<Stats />, restaurant)} />
          <Route path="/restaurant/staff" element={protect(<Staff />, ['manager', 'admin'])} />
          <Route path="/restaurant/settings" element={protect(<Settings />, ['admin'])} />
          <Route path="/restaurant/events" element={protect(<Announcements manage />, ['admin'])} />
          <Route path="/restaurant/points" element={protect(<PointAdjustments />, ['admin'])} />
          <Route
            path="*"
            element={
              <Empty title="Cette page n’existe pas">
                <Link to="/">Retrouver le menu</Link>
              </Empty>
            }
          />
        </Routes>
      </Layout>
    </AppContext.Provider>
  );
}
class ErrorBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="container">
        <h1>La page a rencontré un problème.</h1>
        <p>Vos commandes enregistrées sont conservées.</p>
        <button className="button" onClick={() => window.location.reload()}>
          Recharger
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={restaurantBase || '/'}>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
