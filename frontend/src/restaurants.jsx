import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from './context';
import { Alert, PageTitle, useResource } from './components';
import { api } from './api';

export function Restaurants() {
  const { user } = useApp();
  const { data, error } = useResource(() => api('/restaurants'), []);
  const [query, setQuery] = useState('');
  const restaurants = data?.restaurants.filter((r) =>
    `${r.name} ${r.location || ''}`
      .toLocaleLowerCase('fr')
      .includes(query.trim().toLocaleLowerCase('fr')),
  );
  return (
    <>
      <PageTitle title="À quelle table aujourd’hui ?" />
      <p>
        Un seul compte étudiant pour choisir votre restaurant. Vos commandes, points et invitations
        restent propres à chaque établissement.
      </p>
      {!user && (
        <p>
          <Link to="/login">Se connecter</Link> ou{' '}
          <Link to="/register">créer un compte étudiant</Link>.
        </p>
      )}
      <label className="field">
        <span>Rechercher un restaurant</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nom ou quartier"
        />
      </label>
      <Alert>{error}</Alert>
      {!data && !error && <p role="status">Chargement des restaurants…</p>}
      {restaurants?.length === 0 && <p>Aucun restaurant ne correspond à votre recherche.</p>}
      <div className="two-columns">
        {restaurants?.map((r) => (
          <article className="panel" key={r.id}>
            <img
              src={r.cover || '/assets/restaurant.webp'}
              alt=""
              width="600"
              height="260"
              loading="lazy"
              style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 12 }}
            />
            <h2>{r.name}</h2>
            <p>{r.location || 'Adresse à préciser'}</p>
            <p>{r.opening_hours || 'Horaires à préciser'}</p>
            <a className="button" href={`${r.path}/`}>
              Voir le menu de {r.name}
            </a>
          </article>
        ))}
      </div>
    </>
  );
}
