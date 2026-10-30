import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, date } from './api';
import { useApp } from './context';
import { Alert, BusyButton, Empty, Field, Modal, PageTitle, useResource } from './components';

const kinds = { promotion: 'Promotion', event: 'Événement', game: 'Jeu' };
const localInput = (value) => {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
function Poster({ item, children }) {
  return (
    <article className="poster-card panel">
      <img
        className="poster-image"
        src={item.image}
        alt={`Affiche : ${item.title}`}
        loading="lazy"
      />
      <div className="poster-content">
        <div className="row between">
          <span className="pill gold">{kinds[item.kind]}</span>
          {'published' in item && (
            <span className="muted">
              {item.published
                ? new Date(item.ends_at) <= new Date()
                  ? 'Terminée'
                  : 'Publiée'
                : 'Brouillon'}
            </span>
          )}
        </div>
        <h2>{item.title}</h2>
        <p className="preserve-lines">{item.description}</p>
        <p className="muted">
          Du {date(item.starts_at)}
          <br />
          au {date(item.ends_at)} · Kinshasa
        </p>
        {item.kind !== 'promotion' && (
          <p>
            {item.participants} inscrit{item.participants > 1 ? 's' : ''}
            {item.capacity ? ` / ${item.capacity} places` : ''}
          </p>
        )}
        {children}
      </div>
    </article>
  );
}
export function AnnouncementTeaser() {
  const { data } = useResource(() => api('/announcements'), []);
  if (!data?.announcements.length) return null;
  return (
    <section className="section-space" aria-label="Promotions et événements en cours">
      <div className="section-heading">
        <div>
          <p className="eyebrow">LA VIE DU RESTAURANT</p>
          <h2>Les pauses à ne pas manquer</h2>
        </div>
        <Link className="text-link" to="/events">
          Toutes les affiches
        </Link>
      </div>
      <div className="poster-grid">
        {data.announcements.slice(0, 3).map((item) => (
          <Poster key={item.id} item={item}>
            <Link className="button outline" to="/events">
              Voir les conditions{item.kind === 'promotion' ? '' : ' et participer'}
            </Link>
          </Poster>
        ))}
      </div>
    </section>
  );
}
export function Announcements({ manage = false }) {
  const { user } = useApp();
  const [refresh, setRefresh] = useState(0),
    [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null),
    [participants, setParticipants] = useState(null),
    [archive, setArchive] = useState(null);
  const [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const { data, error: loadError } = useResource(
    () => api(manage ? '/announcements/manage' : '/announcements'),
    [manage, refresh, user?.id],
  );
  const items = data?.announcements.filter((a) => filter === 'all' || a.kind === filter) || [];
  async function action(id, method) {
    setBusy(id);
    setError('');
    setMessage('');
    try {
      await api(`/announcements/${id}/participation`, { method });
      setMessage(
        method === 'POST' ? 'Votre inscription est confirmée.' : 'Votre inscription a été annulée.',
      );
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }
  async function archivePoster() {
    setBusy(archive.id);
    setError('');
    try {
      await api(`/announcements/${archive.id}`, { method: 'DELETE' });
      setArchive(null);
      setRefresh((n) => n + 1);
      setMessage('Affiche retirée de la publication.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <PageTitle
        title={manage ? 'Les affiches du restaurant' : 'Les rendez-vous du campus'}
        eyebrow={manage ? 'ESPACE ADMINISTRATEUR' : 'PROMOTIONS · ÉVÉNEMENTS · JEUX'}
      >
        {manage && (
          <button className="button" onClick={() => setEditing({})}>
            Créer une affiche
          </button>
        )}
      </PageTitle>
      <p>
        Les offres et leurs conditions figurent sur chaque affiche. Les prix du panier restent ceux
        du menu.
      </p>
      <div className="chips">
        {[['all', 'Tout'], ...Object.entries(kinds)].map(([key, label]) => (
          <button
            key={key}
            className={`chip ${filter === key ? 'selected' : ''}`}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <Alert>{error || loadError}</Alert>
      <Alert type="success">{message}</Alert>
      {!data ? (
        <p role="status">Chargement des affiches…</p>
      ) : !items.length ? (
        <Empty title="Les prochaines pauses se préparent." icon="gift">
          Les affiches publiées apparaîtront ici.
        </Empty>
      ) : (
        <div className="poster-grid">
          {items.map((item) => (
            <Poster key={item.id} item={item}>
              {manage ? (
                <div className="poster-actions">
                  <button className="button outline" onClick={() => setEditing(item)}>
                    Modifier
                  </button>
                  {item.kind !== 'promotion' && (
                    <button className="button outline" onClick={() => setParticipants(item)}>
                      Voir les inscrits
                    </button>
                  )}
                  <button className="text-button" onClick={() => setArchive(item)}>
                    Retirer l’affiche
                  </button>
                </div>
              ) : (
                item.kind !== 'promotion' && (
                  <>
                    {item.joined && (
                      <Alert type="success">Vous êtes inscrit à ce rendez-vous.</Alert>
                    )}
                    {user?.role === 'student' ? (
                      <BusyButton
                        className="button"
                        busy={busy === item.id}
                        disabled={
                          !item.joined &&
                          item.capacity !== null &&
                          item.participants >= item.capacity
                        }
                        onClick={() => action(item.id, item.joined ? 'DELETE' : 'POST')}
                      >
                        {item.joined
                          ? 'Annuler mon inscription'
                          : item.capacity !== null && item.participants >= item.capacity
                            ? 'Complet'
                            : 'Je participe'}
                      </BusyButton>
                    ) : !user ? (
                      <Link className="button outline" to="/login">
                        Se connecter pour participer
                      </Link>
                    ) : null}
                    {item.kind === 'game' && (
                      <p className="muted">
                        Inscription au jeu organisé par le restaurant. Les règles et récompenses
                        sont précisées sur l’affiche.
                      </p>
                    )}
                  </>
                )
              )}
            </Poster>
          ))}
        </div>
      )}
      {editing && (
        <PosterForm
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setRefresh((n) => n + 1);
            setMessage('Affiche enregistrée.');
          }}
        />
      )}
      {participants && <Participants item={participants} onClose={() => setParticipants(null)} />}
      {archive && (
        <Modal title="Retirer cette affiche ?" onClose={() => setArchive(null)}>
          <p>
            « {archive.title} » ne sera plus visible des étudiants. La liste des inscrits sera
            conservée.
          </p>
          <Alert>{error}</Alert>
          <BusyButton busy={busy === archive.id} className="button" onClick={archivePoster}>
            Confirmer le retrait
          </BusyButton>
        </Modal>
      )}
    </>
  );
}
function PosterForm({ item, onClose, onSaved }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [preview, setPreview] = useState(item.image || '/assets/moambe.webp');
  const [kind, setKind] = useState(item.kind || 'promotion');
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const form = new FormData(e.currentTarget);
      for (const name of ['startsAt', 'endsAt'])
        form.set(name, new Date(form.get(name)).toISOString());
      form.set('published', form.get('published') === 'on' ? 'true' : 'false');
      if (kind === 'promotion') form.set('capacity', '');
      if (!form.get('image')) form.delete('image');
      if (!form.get('photo')?.size) form.delete('photo');
      await api(`/announcements${item.id ? `/${item.id}` : ''}`, {
        method: item.id ? 'PUT' : 'POST',
        body: form,
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={item.id ? 'Modifier l’affiche' : 'Créer une affiche'} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <Alert>{error}</Alert>
        <label className="field">
          <span>Type</span>
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(kinds).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Titre"
          name="title"
          defaultValue={item.title}
          required
          minLength={3}
          maxLength={100}
        />
        <label className="field">
          <span>Description, conditions et récompenses éventuelles</span>
          <textarea
            name="description"
            defaultValue={item.description}
            required
            minLength={10}
            maxLength={2000}
            rows={4}
          />
        </label>
        <div className="poster-dates">
          <Field
            label="Début (heure de cet appareil)"
            type="datetime-local"
            name="startsAt"
            defaultValue={localInput(item.starts_at || Date.now())}
            required
          />
          <Field
            label="Fin (heure de cet appareil)"
            type="datetime-local"
            name="endsAt"
            defaultValue={localInput(item.ends_at || Date.now() + 7 * 86400000)}
            required
          />
        </div>
        {kind !== 'promotion' && (
          <Field
            label="Nombre de places (vide = sans limite)"
            type="number"
            name="capacity"
            min={1}
            max={10000}
            defaultValue={item.capacity || ''}
          />
        )}
        <label className="field">
          <span>Illustration</span>
          <select
            name="image"
            defaultValue=""
            onChange={(e) => e.target.value && setPreview(e.target.value)}
          >
            <option value="">{item.id ? 'Conserver l’affiche' : 'Poulet à la moambé'}</option>
            <option value="/assets/moambe.webp">Poulet à la moambé</option>
            <option value="/assets/poisson.webp">Poisson braisé</option>
            <option value="/assets/bissap.webp">Bissap</option>
            <option value="/assets/samossas.webp">Samossas</option>
          </select>
        </label>
        <label className="field">
          <span>Importer une affiche (JPEG, PNG ou WebP · 3 Mo maximum)</span>
          <input
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.target.files[0];
              setError('');
              if (f?.size > 3 * 1024 * 1024) {
                setError('L’affiche dépasse 3 Mo.');
                e.target.value = '';
                return;
              }
              if (f) {
                const reader = new FileReader();
                reader.onload = () => setPreview(reader.result);
                reader.readAsDataURL(f);
              }
            }}
          />
        </label>
        <img className="poster-preview" src={preview} alt="Aperçu de l’affiche" />
        <label className="row">
          <input type="checkbox" name="published" defaultChecked={item.published || false} />
          Publier pour les étudiants
        </label>
        <BusyButton busy={busy} className="button">
          Enregistrer l’affiche
        </BusyButton>
      </form>
    </Modal>
  );
}
function Participants({ item, onClose }) {
  const { data, error } = useResource(
    () => api(`/announcements/${item.id}/participants`),
    [item.id],
  );
  return (
    <Modal title={`Inscrits · ${item.title}`} onClose={onClose}>
      <Alert>{error}</Alert>
      {!data ? (
        <p role="status">Chargement…</p>
      ) : !data.participants.length ? (
        <p>Aucune inscription pour le moment.</p>
      ) : (
        <ul className="participants-list">
          {data.participants.map((p, i) => (
            <li key={i}>
              <strong>{p.name}</strong>
              <span>{p.email}</span>
              <small>{date(p.created_at)}</small>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export function PointAdjustments() {
  const [query, setQuery] = useState(''),
    [students, setStudents] = useState([]),
    [selected, setSelected] = useState(null);
  const [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const { data, error: historyError } = useResource(
    () => (selected ? api(`/point-adjustments?userId=${selected.id}`) : Promise.resolve(null)),
    [selected?.id, refresh],
  );
  async function search(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSelected(null);
    setStudents([]);
    try {
      setStudents((await api(`/students?q=${encodeURIComponent(query)}`)).students);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const form = e.currentTarget;
    const values = new FormData(form);
    try {
      const result = await api('/point-adjustments', {
        method: 'POST',
        body: {
          userId: selected.id,
          requestKey,
          delta: Number(values.get('delta')),
          reason: values.get('reason'),
        },
      });
      setSelected((s) => ({ ...s, balance: result.balance }));
      setRequestKey(crypto.randomUUID());
      setRefresh((n) => n + 1);
      form.reset();
      setMessage(`Correction enregistrée. Nouveau solde : ${result.balance} points.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle eyebrow="ESPACE ADMINISTRATEUR" title="Corriger des points de fidélité" />
      <p>
        Chaque correction est justifiée, enregistrée et visible par l’étudiant. Un retrait ne touche
        pas aux points déjà réservés pour une commande.
      </p>
      <Alert>{error || historyError}</Alert>
      <Alert type="success">{message}</Alert>
      <form className="row point-search" onSubmit={search}>
        <Field
          label="Rechercher un étudiant par nom ou e-mail"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          minLength={2}
          maxLength={80}
          required
        />
        <BusyButton className="button outline" busy={busy}>
          Rechercher
        </BusyButton>
      </form>
      <div className="student-results">
        {students.map((s) => (
          <button
            key={s.id}
            className={`panel student-result ${selected?.id === s.id ? 'is-selected' : ''}`}
            disabled={busy}
            onClick={() => {
              setSelected(s);
              setRequestKey(crypto.randomUUID());
              setMessage('');
              setError('');
            }}
          >
            <strong>{s.name}</strong>
            <span>{s.email}</span>
            <small>{selected?.id === s.id ? selected.balance : s.balance} points disponibles</small>
          </button>
        ))}
      </div>
      {selected && (
        <section className="panel">
          <h2>
            {selected.name} · {selected.balance} points
          </h2>
          <form key={selected.id} onSubmit={submit} className="stack">
            <Field
              label="Correction (+ pour ajouter, − pour retirer)"
              name="delta"
              type="number"
              min={-10000}
              max={10000}
              required
              step={1}
            />
            <label className="field">
              <span>Justification visible par l’étudiant</span>
              <textarea name="reason" required minLength={10} maxLength={500} rows={3} />
            </label>
            <BusyButton className="button" busy={busy}>
              Enregistrer la correction
            </BusyButton>
          </form>
          <h3>Historique des corrections</h3>
          {data?.adjustments.length ? (
            <ul className="adjustment-list">
              {data.adjustments.map((a) => (
                <li key={a.id}>
                  <strong>
                    {a.delta > 0 ? '+' : ''}
                    {a.delta} points
                  </strong>
                  <p>{a.reason}</p>
                  <small>
                    {date(a.created_at)} · {a.actor}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p>Aucune correction enregistrée.</p>
          )}
        </section>
      )}
    </>
  );
}
