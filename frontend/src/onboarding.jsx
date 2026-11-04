import { useState } from 'react';
import { api } from './api';
import { useApp } from './context';
import { Alert, BusyButton, Field, Icon, PageTitle } from './components';

export function NewRestaurant() {
  const [name, setName] = useState(''),
    [slug, setSlug] = useState(''),
    [slugEdited, setSlugEdited] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [created, setCreated] = useState(null);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(
      [
        'restaurantName',
        'slug',
        'location',
        'openingHours',
        'name',
        'email',
        'phone',
        'password',
      ].map((key) => [key, form.get(key)]),
    );
    let result;
    try {
      result = await api('/restaurants', { method: 'POST', body });
      setCreated(result);
      for (const slot of ['logo', 'authImage', 'coverImage']) {
        const file = form.get(slot);
        if (!file?.size) continue;
        const upload = new FormData();
        upload.append('image', file);
        await api(`/branding/images/${slot}`, {
          method: 'POST',
          body: upload,
          headers: { 'X-Restaurant-Slug': result.restaurant.slug },
        });
      }
      window.location.assign(`${result.path}/restaurant/settings`);
    } catch (e) {
      setError(
        result
          ? `Votre restaurant et votre compte sont créés. Une image n’a pas pu être enregistrée : ${e.message} Vous pourrez la modifier dans les paramètres.`
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle eyebrow="UN NOUVEAU RESTAURANT" title="Votre restaurant, votre identité." />
      <p className="muted">
        Créez votre espace et votre compte administrateur. Vous pourrez ensuite ajouter votre menu,
        vos gérants et vos employés, et ajuster les frais et la fidélité.
      </p>
      <form onSubmit={submit} className="onboarding-form">
        <div className="two-columns">
          <section className="panel">
            <h2>Présentez votre restaurant</h2>
            <Field
              label="Nom du restaurant"
              name="restaurantName"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugEdited)
                  setSlug(
                    e.target.value
                      .normalize('NFD')
                      .replace(/[\u0300-\u036f]/g, '')
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-|-$/g, ''),
                  );
              }}
              required
              minLength="2"
              maxLength="80"
            />
            <Field
              label="Adresse de votre espace (identifiant unique)"
              name="slug"
              value={slug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value);
              }}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              minLength="3"
              maxLength="60"
              required
            />
            <small className="muted">
              Votre site : /r/{slug || 'mon-restaurant'} · cet identifiant ne sera pas modifiable.
            </small>
            <Field
              label="Localisation et adresse"
              name="location"
              placeholder="Kinshasa · Commune, avenue, numéro"
              required
              maxLength="150"
            />
            <Field
              label="Horaires affichés"
              name="openingHours"
              defaultValue="Lundi – samedi · 11 h – 19 h"
              required
              maxLength="150"
            />
            <h3 className="section-space">Vos images (facultatives)</h3>
            <BrandImageInput slot="logo" label="Logo du restaurant" />
            <BrandImageInput
              slot="authImage"
              label="Image des pages de connexion et d’inscription"
            />
            <BrandImageInput slot="coverImage" label="Image de présentation du menu" />
            <small className="muted">
              JPEG, PNG ou WebP · 3 Mo maximum par image. Vous pourrez les remplacer après la
              création.
            </small>
          </section>
          <section className="panel">
            <span className="pill">VOTRE COMPTE ADMINISTRATEUR</span>
            <h2 className="section-space">À vous les commandes.</h2>
            <Field
              label="Votre nom complet"
              name="name"
              autoComplete="name"
              required
              minLength="2"
              maxLength="80"
            />
            <Field
              label="Votre adresse e-mail"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength="254"
            />
            <Field
              label="Votre téléphone"
              name="phone"
              type="tel"
              placeholder="+243810000000"
              pattern="\+243[0-9]{9}"
              autoComplete="tel"
              required
            />
            <Field
              label="Votre mot de passe"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength="10"
              maxLength="128"
            />
            <small className="muted">10 caractères minimum, une majuscule et un chiffre.</small>
            <p className="muted section-space">
              Ce compte administrera uniquement votre nouveau restaurant. Les clients créeront leur
              compte étudiant depuis le lien de votre espace.
            </p>
            <Alert>{error}</Alert>
            {created ? (
              <a className="button full" href={`${created.path}/restaurant/settings`}>
                Continuer vers mon restaurant <Icon name="arrow" />
              </a>
            ) : (
              <BusyButton className="button full" busy={busy}>
                Créer mon restaurant et mon compte <Icon name="arrow" />
              </BusyButton>
            )}
            <p className="muted small section-space">
              Les paiements restent en démonstration dans cette version du projet.
            </p>
          </section>
        </div>
      </form>
    </>
  );
}
function BrandImageInput({ slot, label, onChange, disabled }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        name={slot}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onChange}
        disabled={disabled}
      />
    </label>
  );
}
export function RestaurantBranding() {
  const { catalog, refreshCatalog } = useApp();
  const restaurant = catalog.restaurant,
    branding = restaurant.branding || {};
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  async function action(work) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
      await refreshCatalog();
      setMessage('La personnalisation de votre restaurant est enregistrée.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(slot, event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('image', file);
    await action(() => api(`/branding/images/${slot}`, { method: 'POST', body: form }));
    event.target.value = '';
  }
  return (
    <section className="panel settings-form branding-editor">
      <h2>L’identité de votre restaurant</h2>
      <p className="muted">
        Ces informations personnalisent les pages du menu, de connexion et d’inscription.
      </p>
      <label className="field">
        <span>Lien à partager avec vos clients</span>
        <input
          readOnly
          value={`${window.location.origin}${restaurant.id === 'mon-miam-miam-kinshasa' ? '' : `/r/${restaurant.slug}`}`}
        />
      </label>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const body = Object.fromEntries(new FormData(event.currentTarget));
          action(() => api('/branding', { method: 'PUT', body }));
        }}
      >
        <Field
          label="Nom du restaurant"
          name="name"
          defaultValue={restaurant.name}
          required
          minLength="2"
          maxLength="80"
        />
        <div className="two-columns">
          <Field
            label="E-mail public du restaurant"
            name="contactEmail"
            type="email"
            defaultValue={branding.contactEmail || ''}
          />
          <Field
            label="Téléphone public du restaurant"
            name="contactPhone"
            type="tel"
            pattern="\+243[0-9]{9}"
            defaultValue={branding.contactPhone || ''}
          />
        </div>
        <label className="field">
          <span>Titre des pages de connexion et d’inscription</span>
          <textarea
            name="authTitle"
            defaultValue={branding.authTitle || 'Les bons repas.\nLes bons moments.'}
            required
            minLength="2"
            maxLength="120"
          />
        </label>
        <Field
          label="Texte d’accueil"
          name="authSubtitle"
          defaultValue={branding.authSubtitle || 'Votre pause étudiante, tout simplement.'}
          required
          minLength="2"
          maxLength="200"
        />
        <label className="field">
          <span>Titre de présentation du menu</span>
          <textarea
            name="heroTitle"
            defaultValue={branding.heroTitle || 'Bien manger,\nbien étudier.'}
            required
            minLength="2"
            maxLength="120"
          />
        </label>
        <label className="field">
          <span>Palette par défaut des nouveaux clients</span>
          <select name="defaultTheme" defaultValue={branding.defaultTheme || 'official'}>
            {[
              ['official', 'Officiel'],
              ['forest', 'Forêt'],
              ['burgundy', 'Bordeaux'],
              ['blue', 'Bleu'],
              ['plum', 'Prune'],
              ['orange', 'Orange'],
            ].map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <BusyButton className="button" busy={busy}>
          Enregistrer l’identité <Icon name="check" />
        </BusyButton>
      </form>
      <hr />
      <div className="brand-images">
        {[
          ['logo', 'Logo du restaurant'],
          ['authImage', 'Image connexion / inscription'],
          ['coverImage', 'Image de présentation du menu'],
        ].map(([slot, label]) => (
          <div className="brand-image-card" key={slot}>
            {branding[slot] ? (
              <img
                className={slot === 'logo' ? 'logo-preview' : ''}
                src={branding[slot]}
                alt={label}
              />
            ) : (
              <div className="brand-image-placeholder">
                <Icon name="home" size={32} />
                <span>Illustration par défaut</span>
              </div>
            )}
            <BrandImageInput
              slot={slot}
              label={label}
              disabled={busy}
              onChange={(e) => upload(slot, e)}
            />
            {branding[slot] && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => action(() => api(`/branding/images/${slot}`, { method: 'DELETE' }))}
              >
                Rétablir l’image par défaut
              </button>
            )}
          </div>
        ))}
      </div>
      <Alert>{error}</Alert>
      <Alert type="success">{message}</Alert>
      <a
        className="text-link"
        href={`${restaurant.id === 'mon-miam-miam-kinshasa' ? '' : `/r/${restaurant.slug}`}/login`}
        target="_blank"
        rel="noreferrer"
      >
        Voir la page de connexion personnalisée <Icon name="arrow" size={16} />
      </a>
    </section>
  );
}
