import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, restaurantBase } from './api';
import { useApp } from './context';
import { Alert, Field, BusyButton, Icon } from './components';

export function Auth({ mode }) {
  const { setUser, catalog } = useApp();
  const branding = catalog?.restaurant?.branding || {};
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    setError('');
    setMessage('');
    setBusy(false);
    setAccounts([]);
  }, [mode]);
  const register = mode === 'register',
    forgot = mode === 'forgot',
    reset = mode === 'reset';
  const title = register
    ? 'Une place à notre table.'
    : forgot
      ? 'On vous aide à revenir.'
      : reset
        ? 'Un nouveau départ.'
        : 'Heureux de vous revoir.';
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const values = Object.fromEntries(new FormData(e.currentTarget));
    delete values.consent;
    if (register && !values.referralCode) delete values.referralCode;
    try {
      if (reset) {
        const result = await api('/auth/reset-password', {
          method: 'POST',
          body: { token: params.get('token') || '', password: values.password },
        });
        setMessage(result.message);
      } else if (forgot) {
        const result = await api('/auth/forgot-password', { method: 'POST', body: values });
        setMessage(result.message);
      } else {
        const result = await api(`/auth/${mode}`, { method: 'POST', body: values });
        if (result.accounts) {
          setAccounts(result.accounts);
          setMessage(
            'Plusieurs espaces correspondent à ces identifiants. Choisissez celui à ouvrir.',
          );
          return;
        }
        const { user } = result;
        setUser(user);
        if (user.role !== 'student' && result.path !== restaurantBase) {
          window.location.assign(`${result.path}/restaurant`);
        } else
          navigate(user.role === 'student' ? '/restaurants' : '/restaurant', {
            replace: true,
          });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout" key={mode}>
      <section className="auth-art has-custom-image">
        {
          <img
            className="auth-background"
            src={branding.authImage || '/assets/restaurant.webp'}
            alt=""
            width="1200"
            height="900"
          />
        }
        <p className="eyebrow">LA PAUSE QUI FAIT DU BIEN</p>
        <h2>
          <span className="preserve-lines">
            {branding.authTitle || 'Les bons repas.\nLes bons moments.'}
          </span>
        </h2>
        <p>{branding.authSubtitle || 'Votre pause étudiante, tout simplement.'}</p>
        <small>{catalog?.settings?.location || 'KINSHASA'} · PRIX EN CDF</small>
      </section>
      <section className="auth-form">
        <h1>{title}</h1>
        <p className="muted">
          {register
            ? 'Créez votre compte avec votre e-mail.'
            : forgot
              ? 'Préparez un lien pour choisir un nouveau mot de passe.'
              : reset
                ? 'Choisissez un mot de passe personnel.'
                : 'Connectez-vous pour retrouver votre pause préférée.'}
        </p>
        {(register || mode === 'login') && (
          <div className="restaurant-signup-link restaurant-signup-choice">
            <strong>Vous gérez un restaurant ?</strong>
            <a className="button secondary" href="/restaurants/new">
              Créer mon restaurant <Icon name="arrow" size={16} />
            </a>
            <small>Configurez votre établissement et créez votre compte administrateur.</small>
          </div>
        )}
        {forgot && catalog?.emailRecoveryMode === 'test' && (
          <p className="notice">
            Pour cette démonstration étudiante, la récupération est réservée à
            merdi.tshinyama@2030.ulc-icam.com. Les autres comptes doivent contacter le responsable.
          </p>
        )}
        <form onSubmit={submit} key={mode}>
          {register && (
            <Field
              label="Nom complet"
              name="name"
              autoComplete="name"
              required
              minLength="2"
              maxLength="80"
            />
          )}
          {!reset && (
            <Field
              label="Adresse e-mail"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength="254"
            />
          )}
          {register && (
            <Field
              label="Téléphone"
              name="phone"
              type="tel"
              placeholder="+243810000000"
              autoComplete="tel"
              pattern="\+243[0-9]{9}"
              required
            />
          )}
          {!forgot && (
            <>
              <Field
                label={reset ? 'Nouveau mot de passe' : 'Mot de passe'}
                name="password"
                type="password"
                autoComplete={register || reset ? 'new-password' : 'current-password'}
                required
                minLength={register || reset ? 10 : 1}
                maxLength="128"
              />
              {(register || reset) && (
                <small className="muted">10 caractères minimum, une majuscule et un chiffre.</small>
              )}
            </>
          )}
          {register && (
            <>
              <Field
                label="Adresse de livraison (facultative)"
                name="deliveryAddress"
                autoComplete="street-address"
                maxLength={400}
                placeholder="Commune, avenue, numéro et repère"
              />
              <Field label="Code de parrainage (facultatif)" name="referralCode" maxLength="40" />
              <label className="check-field">
                <input name="consent" type="checkbox" required />
                <span>
                  J’ai lu les <Link to="/privacy">informations sur mes données</Link>.
                </span>
              </label>
            </>
          )}
          <Alert>{error}</Alert>
          <Alert type="success">{message}</Alert>
          {accounts.length > 0 && (
            <fieldset className="panel">
              <legend>Choisissez votre espace</legend>
              {accounts.map((account) => (
                <label className="check-field" key={account.id}>
                  <input type="radio" name="accountId" value={account.id} required />
                  <span>
                    {account.name} ·{' '}
                    {account.role === 'student'
                      ? 'Étudiant'
                      : account.role === 'admin'
                        ? 'Administrateur'
                        : account.role === 'manager'
                          ? 'Gérant'
                          : 'Employé'}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <BusyButton className="button full" busy={busy}>
            {register
              ? 'Créer mon compte'
              : forgot
                ? 'Préparer le lien'
                : reset
                  ? 'Enregistrer le mot de passe'
                  : 'Se connecter'}
            <Icon name="arrow" />
          </BusyButton>
        </form>
        <div className="auth-links">
          {mode === 'login' ? (
            <>
              <Link to="/forgot">Mot de passe oublié ?</Link>
              <span>
                Nouveau ici ? <Link to="/register">Créer un compte</Link>
              </span>
            </>
          ) : (
            <Link to="/login">Retour à la connexion</Link>
          )}
        </div>
      </section>
    </div>
  );
}
