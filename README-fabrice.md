# Passerelle 3e → 2nde — Documentation technique pour Fabrice

## Vue d'ensemble

Site statique (HTML/CSS/JS) hébergeant un cahier de vacances mathématiques.
**Le site fonctionne 100 % sans back-end** (mode localStorage). Le back-end ajoute la synchronisation cross-appareils et un tableau de bord enseignant.

---

## Structure des fichiers

```
/
├── index.html                  ← Page d'accueil + navigation
├── diagnostic.html             ← Diagnostic de placement (15 questions)
├── tableau-de-bord.html        ← Progression, badges, activité
├── css/
│   └── style.css               ← Styles complets
├── js/
│   ├── data.js                 ← Tous les exercices + données
│   └── app.js                  ← Logique principale + moteur exercices
├── parcours/
│   ├── A.html                  ← Remise en forme (primaire → 5ème)
│   ├── B.html                  ← Les essentiels (4ème → 3ème)
│   └── C.html                  ← Cap Seconde (programme 2nde)
└── automatismes/
    └── index.html              ← Flash QCM BAC de Première
```

---

## Hébergement (mode statique seul)

Copie simplement tous les fichiers à la racine de ton serveur ou d'un hébergement statique (Apache, Nginx, GitHub Pages, Netlify, Vercel…). Aucune dépendance serveur.

```nginx
# Nginx — exemple basique
server {
  listen 80;
  root /var/www/passerelle;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
}
```

---

## Intégration back-end (optionnelle mais recommandée)

### Étape 1 — Configurer l'URL API

Dans `js/app.js`, ligne 7 :

```javascript
const CONFIG = {
  apiUrl: 'https://ton-api.fr',  // ← renseigner ici
  ...
};
```

### Étape 2 — Implémenter les endpoints

| Méthode | Endpoint | Corps | Réponse |
|---------|----------|-------|---------|
| `POST` | `/api/users/register` | `{ pseudo, pin }` | `{ token, user: { pseudo, xp } }` |
| `POST` | `/api/users/login` | `{ pseudo, pin }` | `{ token, user: { pseudo, xp } }` |
| `GET`  | `/api/me` | *(header Bearer)* | `{ user, progress, badges, streak }` |
| `POST` | `/api/progress` | `{ progress, badges, streak }` | `{ ok: true }` |

### Structure des données

```json
// user
{ "pseudo": "Alex", "xp": 450, "createdAt": "2026-07-01" }

// progress (objet indexé par id d'exercice)
{
  "A-001": { "done": true, "date": "2026-07-03", "tries": 1 },
  "B-005": { "done": true, "date": "2026-07-05", "tries": 2 }
}

// badges (tableau d'ids)
["premier-pas", "jour-1", "regulier-3"]

// streak
{ "count": 7, "lastDate": "2026-07-08" }
```

### Authentification recommandée

- JWT (JSON Web Token) signé côté serveur
- PIN 4 chiffres : stocker le hash bcrypt, jamais en clair
- HTTPS obligatoire

### Base de données suggérée (simple)

SQLite ou PostgreSQL — deux tables suffisent :

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  pseudo VARCHAR(20) UNIQUE NOT NULL,
  pin_hash VARCHAR(60) NOT NULL,
  xp INTEGER DEFAULT 0,
  created_at DATE DEFAULT CURRENT_DATE
);

CREATE TABLE progress (
  user_id INTEGER REFERENCES users(id),
  data JSONB NOT NULL,     -- { progress, badges, streak }
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id)
);
```

---

## IDs d'exercices (référence)

| Parcours | IDs | Total |
|---------|-----|-------|
| A — Remise en forme | A-001 à A-010 | 10 |
| B — Les essentiels | B-001 à B-012 | 12 |
| C — Cap Seconde | C-001 à C-010 | 10 |
| Automatismes BAC | AUTO-001 à AUTO-020 | 20 |
| Diagnostic | D-01 à D-15 | 15 (non comptabilisés) |

---

## Gamification — Récapitulatif

| Élément | Valeur |
|---------|--------|
| Exercice facile (niv. 1-2) | 10-15 XP |
| Exercice moyen (niv. 3) | 20 XP |
| Exercice difficile (niv. 4-5) | 25-30 XP |
| Automatisme correct | 5 XP |
| Badges | 19 badges disponibles |
| Streaks | 3, 7, 14 jours |

---

## Tableau de bord enseignant (optionnel)

Si tu veux offrir aux enseignants une vue des progrès :

- Endpoint `GET /api/admin/stats` (protégé par un token admin)
- Réponse : liste des utilisateurs, XP, exercices complétés, streak
- Interface à construire séparément (pas incluse dans ce dossier)

---

## Dépendances CDN (aucune installation requise)

- **KaTeX 0.16.9** — rendu des formules mathématiques
  - `https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css`
  - `https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js`
  - `https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js`
- **Google Fonts — Nunito** (chargé dans le CSS)

Pour un déploiement 100 % hors-ligne, télécharge ces fichiers localement et adapte les chemins.

---

## CORS (si API sur un autre domaine)

```python
# Flask / Python exemple
from flask_cors import CORS
CORS(app, origins=["https://passerelle.ton-domaine.fr"])
```

---

## Contact

Pour toute question sur le contenu pédagogique : contacter l'auteur.  
Pour les aspects techniques hébergement : bon courage, c'est du statique ! 😄

---

*Cahier de vacances Passerelle 3e→2nde · Été 2026*  
*Contenus basés sur les programmes EN (primaire, collège cycle 4, seconde GT BO avril 2026)*  
*Exercices inspirés des annales du Brevet — [APMEP](https://www.apmep.fr/Annales-du-Brevet-des-colleges)*
