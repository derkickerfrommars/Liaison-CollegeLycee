/* =====================================================
   app.js — Logique principale
   Cahier de vacances Passerelle 3e → 2nde
   =====================================================
   Fonctionnement :
   - En mode autonome : stockage localStorage (100 % client)
   - Avec backend Fabrice : synchronisation API REST
   ===================================================== */

/* ===== CONFIGURATION ===== */
const CONFIG = {
  apiUrl: null,           // Ex : 'https://api.passerelle-maths.fr' — à renseigner par Fabrice
  version: '1.0.0',
  streakThreshold: 1,     // Nb minimal d'exercices par jour pour maintenir le streak
};

/* ===== CLÉS LOCALSTORAGE ===== */
const LS = {
  USER: 'pm_user',
  PROGRESS: 'pm_progress',
  BADGES: 'pm_badges',
  STREAK: 'pm_streak',
  DAILY: 'pm_daily',
};

/* ===== STATE GLOBAL ===== */
let state = {
  user: null,
  progress: {},   // { exerciceId: { done: true, date, time, tries } }
  badges: [],     // [ badgeId, ... ]
  streak: { count: 0, lastDate: null },
  dailyDone: false,
};

/* ===================================================================
   PERSISTANCE — LocalStorage
   =================================================================== */
function saveState() {
  localStorage.setItem(LS.USER, JSON.stringify(state.user));
  localStorage.setItem(LS.PROGRESS, JSON.stringify(state.progress));
  localStorage.setItem(LS.BADGES, JSON.stringify(state.badges));
  localStorage.setItem(LS.STREAK, JSON.stringify(state.streak));
  localStorage.setItem(LS.DAILY, JSON.stringify({ done: state.dailyDone, date: today() }));
  if (CONFIG.apiUrl && state.user?.token) syncWithAPI();
}

function loadState() {
  try {
    state.user = JSON.parse(localStorage.getItem(LS.USER)) || null;
    state.progress = JSON.parse(localStorage.getItem(LS.PROGRESS)) || {};
    state.badges = JSON.parse(localStorage.getItem(LS.BADGES)) || [];
    state.streak = JSON.parse(localStorage.getItem(LS.STREAK)) || { count: 0, lastDate: null };
    const daily = JSON.parse(localStorage.getItem(LS.DAILY));
    state.dailyDone = daily?.date === today() ? (daily.done || false) : false;
  } catch (e) {
    console.warn('Erreur de lecture du state :', e);
  }
}

/* ===================================================================
   SYNCHRONISATION API (optionnelle — backend Fabrice)
   Endpoints attendus :
     POST /api/users/register  { pseudo, pin } → { token, user }
     POST /api/users/login     { pseudo, pin } → { token, user }
     GET  /api/me              → { user, progress, badges, streak }
     POST /api/progress        { exerciceId, done, tries, time } → { user }
   =================================================================== */
async function syncWithAPI() {
  if (!CONFIG.apiUrl || !state.user?.token) return;
  try {
    await fetch(`${CONFIG.apiUrl}/api/progress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.user.token}`,
      },
      body: JSON.stringify({ progress: state.progress, badges: state.badges, streak: state.streak }),
    });
  } catch (e) {
    console.warn('Sync API échouée (mode hors-ligne) :', e);
  }
}

async function fetchFromAPI() {
  if (!CONFIG.apiUrl || !state.user?.token) return;
  try {
    const res = await fetch(`${CONFIG.apiUrl}/api/me`, {
      headers: { 'Authorization': `Bearer ${state.user.token}` },
    });
    if (res.ok) {
      const data = await res.json();
      state.progress = { ...state.progress, ...data.progress };
      state.badges = data.badges || state.badges;
      state.streak = data.streak || state.streak;
      saveState();
    }
  } catch (e) {
    console.warn('Fetch API échouée (mode hors-ligne) :', e);
  }
}

/* ===================================================================
   UTILISATEUR
   =================================================================== */
async function loginUser(pseudo, pin) {
  if (CONFIG.apiUrl) {
    try {
      const res = await fetch(`${CONFIG.apiUrl}/api/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pseudo, pin }),
      });
      if (res.ok) {
        const data = await res.json();
        state.user = { pseudo: data.user.pseudo, token: data.token, xp: data.user.xp || 0 };
        await fetchFromAPI();
        saveState();
        return { success: true };
      } else {
        return { success: false, error: 'Pseudo ou code PIN incorrect.' };
      }
    } catch (e) {
      // Fallback local si l'API est indisponible
    }
  }
  // Mode local
  const savedUser = JSON.parse(localStorage.getItem(LS.USER));
  if (savedUser && savedUser.pseudo === pseudo && savedUser.pin === pin) {
    state.user = savedUser;
    return { success: true };
  }
  return { success: false, error: 'Pseudo ou code incorrect.' };
}

async function registerUser(pseudo, pin) {
  if (CONFIG.apiUrl) {
    try {
      const res = await fetch(`${CONFIG.apiUrl}/api/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pseudo, pin }),
      });
      const data = await res.json();
      if (res.ok) {
        state.user = { pseudo: data.user.pseudo, token: data.token, xp: 0 };
        saveState();
        return { success: true };
      }
      return { success: false, error: data.message || 'Erreur à la création du compte.' };
    } catch (e) {
      // Fallback local
    }
  }
  // Mode local
  state.user = { pseudo, pin, xp: 0, createdAt: today() };
  state.progress = {};
  state.badges = [];
  state.streak = { count: 0, lastDate: null };
  saveState();
  return { success: true };
}

function logoutUser() {
  state.user = null;
  localStorage.removeItem(LS.USER);
  window.location.href = '/index.html';
}

/* ===================================================================
   PROGRESSION
   =================================================================== */
function markExerciceDone(id, xp, tries = 1) {
  if (state.progress[id]?.done) return; // déjà fait

  state.progress[id] = { done: true, date: today(), tries };
  state.user.xp = (state.user.xp || 0) + xp;

  // Streak
  updateStreak();

  // Vérifier les badges
  const newBadges = checkBadges();

  // Sauvegarde
  saveState();

  return newBadges;
}

function getXP() { return state.user?.xp || 0; }

function getTotalDone() {
  return Object.values(state.progress).filter(p => p.done).length;
}

function getParcoursProgress(parcours) {
  const exercices = {
    A: EXERCICES_A,
    B: EXERCICES_B,
    C: EXERCICES_C,
    AUTO: AUTOMATISMES,
  }[parcours] || [];
  const done = exercices.filter(ex => state.progress[ex.id]?.done).length;
  return { done, total: exercices.length, pct: exercices.length ? Math.round((done / exercices.length) * 100) : 0 };
}

function getThemeProgress(theme) {
  const all = [...EXERCICES_A, ...EXERCICES_B, ...EXERCICES_C];
  const themed = all.filter(ex => ex.theme === theme);
  const done = themed.filter(ex => state.progress[ex.id]?.done).length;
  return { done, total: themed.length };
}

/* ===================================================================
   STREAK
   =================================================================== */
function updateStreak() {
  const t = today();
  const last = state.streak.lastDate;

  if (last === t) return; // déjà compté aujourd'hui

  if (last === yesterday()) {
    state.streak.count++;
  } else {
    state.streak.count = 1;
  }
  state.streak.lastDate = t;
}

function getStreakDisplay() {
  if (!state.streak.lastDate || state.streak.lastDate !== today()) {
    return state.streak.count > 0
      ? `${state.streak.count} 🔥 (poursuis-le !)`
      : '0 — commence aujourd\'hui !';
  }
  return `${state.streak.count} jour${state.streak.count > 1 ? 's' : ''} consécutif${state.streak.count > 1 ? 's' : ''}`;
}

/* ===================================================================
   BADGES
   =================================================================== */
function checkBadges() {
  const newBadges = [];

  const conditions = {
    first_exercise: () => getTotalDone() >= 1,
    first_hint: () => localStorage.getItem('pm_hint_used') === 'true',
    first_day: () => state.streak.count >= 1,
    streak_3: () => state.streak.count >= 3,
    streak_7: () => state.streak.count >= 7,
    streak_14: () => state.streak.count >= 14,
    theme_fractions: () => getThemeProgress('fractions').done === getThemeProgress('fractions').total && getThemeProgress('fractions').total > 0,
    theme_geometrie: () => getThemeProgress('geometrie').done === getThemeProgress('geometrie').total && getThemeProgress('geometrie').total > 0,
    theme_algebre: () => getThemeProgress('algebre').done === getThemeProgress('algebre').total && getThemeProgress('algebre').total > 0,
    theme_stats: () => getThemeProgress('stats').done === getThemeProgress('stats').total && getThemeProgress('stats').total > 0,
    theme_proba: () => getThemeProgress('proba').done === getThemeProgress('proba').total && getThemeProgress('proba').total > 0,
    parcours_A: () => getParcoursProgress('A').pct === 100,
    parcours_B: () => getParcoursProgress('B').pct === 100,
    parcours_C: () => getParcoursProgress('C').pct === 100,
    auto_10: () => AUTOMATISMES.filter(a => state.progress[a.id]?.done).length >= 10,
    auto_20: () => AUTOMATISMES.filter(a => state.progress[a.id]?.done).length >= 20,
    total_30: () => getTotalDone() >= 30,
    all_done: () => getParcoursProgress('A').pct === 100 && getParcoursProgress('B').pct === 100 && getParcoursProgress('C').pct === 100 && AUTOMATISMES.filter(a => state.progress[a.id]?.done).length >= 20,
    brevet_5: () => [...EXERCICES_A, ...EXERCICES_B, ...EXERCICES_C].filter(ex => ex.brevet && state.progress[ex.id]?.done).length >= 5,
  };

  for (const badge of BADGES) {
    if (!state.badges.includes(badge.id) && conditions[badge.condition]?.()) {
      state.badges.push(badge.id);
      newBadges.push(badge);
    }
  }

  return newBadges;
}

/* ===================================================================
   AFFICHAGE — COMPOSANTS UI
   =================================================================== */

/* Toast notification */
function showToast(type, icon, title, sub = '', duration = 4000) {
  const container = document.querySelector('.toast-container') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      ${sub ? `<div class="toast-sub">${sub}</div>` : ''}
    </div>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function createToastContainer() {
  const c = document.createElement('div');
  c.className = 'toast-container';
  document.body.appendChild(c);
  return c;
}

/* Confettis */
function launchConfetti(count = 60) {
  const colors = ['#4F46E5', '#F59E0B', '#22C55E', '#F97316', '#7C3AED', '#EF4444', '#06B6D4'];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    piece.style.width = piece.style.height = (8 + Math.random() * 8) + 'px';
    piece.style.animationDuration = (1.5 + Math.random() * 2) + 's';
    piece.style.animationDelay = Math.random() * 0.8 + 's';
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 4000);
  }
}

/* Afficher badge débloqué */
function celebrateBadge(badge) {
  launchConfetti(80);
  showToast('badge', badge.icon, `Badge débloqué : ${badge.nom} !`, badge.desc, 6000);
}

/* Mettre à jour le header utilisateur */
function updateHeaderUI() {
  const userChip = document.getElementById('user-chip');
  const streakPill = document.getElementById('streak-pill');
  const xpPill = document.getElementById('xp-pill');

  if (!state.user) {
    if (userChip) {
      userChip.innerHTML = `<span>Se connecter</span>`;
      userChip.onclick = () => showLoginModal();
    }
    return;
  }

  if (userChip) {
    const initial = state.user.pseudo.charAt(0).toUpperCase();
    userChip.innerHTML = `
      <div class="user-avatar">${initial}</div>
      <span>${state.user.pseudo}</span>
      <span class="xp-pill">${getXP()} XP</span>`;
    userChip.onclick = () => { window.location.href = '/tableau-de-bord.html'; };
  }
  if (xpPill) xpPill.textContent = `${getXP()} XP`;
  if (streakPill) {
    const s = state.streak.count;
    streakPill.innerHTML = `${s >= 3 ? '🔥' : '📅'} ${s} jour${s > 1 ? 's' : ''}`;
    streakPill.style.display = s > 0 ? 'flex' : 'none';
  }
}

/* Mettre à jour les barres de progression des parcours */
function updateParcoursCards() {
  ['A', 'B', 'C', 'AUTO'].forEach(p => {
    const bar = document.getElementById(`prog-bar-${p}`);
    const txt = document.getElementById(`prog-txt-${p}`);
    const pr = getParcoursProgress(p);
    if (bar) bar.style.width = pr.pct + '%';
    if (txt) txt.textContent = `${pr.done}/${pr.total}`;
  });
}

/* ===================================================================
   MODAL CONNEXION / INSCRIPTION
   =================================================================== */
function showLoginModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.remove('hidden');
}
function hideLoginModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.add('hidden');
}

function buildAuthModal() {
  const modal = document.createElement('div');
  modal.id = 'auth-modal';
  modal.className = 'modal-overlay hidden';
  modal.innerHTML = `
    <div class="modal fade-in" role="dialog" aria-label="Connexion">
      <h2>👋 Bienvenue !</h2>
      <p class="modal-sub">Crée un compte pour sauvegarder ta progression sur tous tes appareils, ou connecte-toi si tu reviens.</p>
      <div id="auth-tabs" style="display:flex;gap:.5rem;margin-bottom:1.5rem;">
        <button class="btn btn-primary" id="tab-register">Nouveau compte</button>
        <button class="btn btn-ghost" id="tab-login">Déjà inscrit·e</button>
      </div>
      <div id="auth-form">
        <div class="input-group">
          <label class="input-label" for="pseudo-input">Ton prénom (ou pseudo)</label>
          <input class="input" id="pseudo-input" type="text" placeholder="Ex : Alex, Marie77..." maxlength="20" autocomplete="username">
        </div>
        <div class="input-group">
          <label class="input-label" for="pin-input">Code secret (4 chiffres)</label>
          <input class="input" id="pin-input" type="password" placeholder="••••" maxlength="4" pattern="[0-9]{4}" autocomplete="current-password">
        </div>
        <div id="auth-error" style="color:var(--red);font-size:.88rem;margin-bottom:.75rem;display:none;"></div>
        <button class="btn btn-primary btn-full btn-lg" id="auth-submit">Créer mon compte</button>
        <p style="text-align:center;margin-top:.75rem;font-size:.82rem;color:var(--text-muted);">
          Ou continue <button class="btn btn-ghost btn-sm" id="continue-anon">sans compte</button> (progression locale uniquement)
        </p>
      </div>
    </div>`;
  document.body.appendChild(modal);

  let mode = 'register';
  const tabRegister = document.getElementById('tab-register');
  const tabLogin = document.getElementById('tab-login');
  const submitBtn = document.getElementById('auth-submit');
  const errorEl = document.getElementById('auth-error');

  function switchMode(m) {
    mode = m;
    if (m === 'register') {
      tabRegister.className = 'btn btn-primary';
      tabLogin.className = 'btn btn-ghost';
      submitBtn.textContent = 'Créer mon compte';
    } else {
      tabRegister.className = 'btn btn-ghost';
      tabLogin.className = 'btn btn-primary';
      submitBtn.textContent = 'Me connecter';
    }
  }

  tabRegister.onclick = () => switchMode('register');
  tabLogin.onclick = () => switchMode('login');

  submitBtn.onclick = async () => {
    const pseudo = document.getElementById('pseudo-input').value.trim();
    const pin = document.getElementById('pin-input').value.trim();
    errorEl.style.display = 'none';

    if (!pseudo || pseudo.length < 2) { showError('Choisis un pseudo d\'au moins 2 caractères.'); return; }
    if (!/^\d{4}$/.test(pin)) { showError('Le code secret doit être 4 chiffres.'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = '...';

    const result = mode === 'register'
      ? await registerUser(pseudo, pin)
      : await loginUser(pseudo, pin);

    if (result.success) {
      hideLoginModal();
      updateHeaderUI();
      updateParcoursCards();
      launchConfetti(40);
      showToast('success', '🎉', `Bienvenue${state.user.pseudo ? ', ' + state.user.pseudo : ''} !`, 'Ta progression sera sauvegardée.', 4000);
    } else {
      showError(result.error);
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'register' ? 'Créer mon compte' : 'Me connecter';
    }
  };

  document.getElementById('continue-anon').onclick = () => {
    const pseudo = document.getElementById('pseudo-input').value.trim() || 'Anonyme';
    state.user = { pseudo, xp: 0, anon: true };
    saveState();
    hideLoginModal();
    updateHeaderUI();
  };

  modal.addEventListener('click', (e) => { if (e.target === modal) hideLoginModal(); });

  function showError(msg) {
    errorEl.style.display = 'block';
    errorEl.textContent = msg;
  }
}

/* ===================================================================
   EXERCICE ENGINE — Rendu et interaction
   =================================================================== */

/**
 * Injecte un exercice dans un conteneur DOM.
 * @param {Object} ex - Données de l'exercice (de data.js)
 * @param {HTMLElement} container - Élément où injecter
 * @param {string} color - Couleur thème ('orange', 'purple', 'blue')
 */
function renderExercice(ex, container, color = 'blue') {
  const isDone = !!state.progress[ex.id]?.done;
  const diffDots = Array.from({ length: 5 }, (_, i) =>
    `<span class="diff-dot${i < ex.niveau ? ' on' : ''}"></span>`
  ).join('');

  container.innerHTML = `
    <div class="ex-card${isDone ? ' done' : ''}">
      <div class="ex-header">
        <div class="ex-meta">
          <span class="ex-id">${ex.id}</span>
          <span class="ex-type">${ex.type}${ex.brevet ? ' · 🎓 type BAC' : ''}</span>
        </div>
        <div class="ex-right">
          ${isDone ? '<span class="done-badge">✓ Fait</span>' : ''}
          <span class="ex-xp">⭐ ${ex.xp} XP</span>
          <div class="diff-dots">${diffDots}</div>
        </div>
      </div>
      <div class="ex-body">
        ${ex.papier ? '<div class="paper-tip">🖊️ Prends une feuille et un stylo — la vie est tellement plus simple avec du papier !</div>' : ''}
        <h3 style="margin-bottom:.75rem;">${ex.titre}</h3>
        <div class="enonce katex-content">${ex.enonce.replace(/\n/g, '<br>')}</div>
        <div class="ex-actions">
          ${!isDone ? `
            <button class="btn btn-success" onclick="validerExercice('${ex.id}', this)">✓ J'ai réussi !</button>
            <button class="btn btn-warning" onclick="showAide('${ex.id}')">💡 Indice</button>
            <button class="btn btn-ghost" onclick="showSolution('${ex.id}')">🔍 Solution</button>
          ` : '<span style="color:var(--green);font-weight:800;">✓ Exercice complété !</span>'}
        </div>
        <div id="aide-${ex.id}" class="aide-box">
          <div class="box-title">💡 Indice</div>
          <div class="katex-content">${(ex.aide || '').replace(/\n/g, '<br>')}</div>
        </div>
        <div id="sol-${ex.id}" class="solution-box">
          <div class="box-title">✅ Solution complète</div>
          <div class="katex-content">${(ex.solution || '').replace(/\n/g, '<br>')}</div>
        </div>
        <div id="bravo-${ex.id}" class="bravo-msg"></div>
      </div>
    </div>`;

  // Rendre le KaTeX dans ce composant
  if (typeof renderMathInElement !== 'undefined') {
    setTimeout(() => renderMathInElement(container, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false,
    }), 50);
  }
}

function showAide(id) {
  document.getElementById(`aide-${id}`)?.classList.add('show');
  localStorage.setItem('pm_hint_used', 'true');
  checkBadges();
}

function showSolution(id) {
  document.getElementById(`sol-${id}`)?.classList.add('show');
}

function validerExercice(id, btn) {
  const ex = [...EXERCICES_A, ...EXERCICES_B, ...EXERCICES_C, ...AUTOMATISMES].find(e => e.id === id);
  if (!ex) return;

  const newBadges = markExerciceDone(id, ex.xp);

  // UI feedback
  const bravoEl = document.getElementById(`bravo-${id}`);
  if (bravoEl) {
    bravoEl.textContent = BRAVO_MESSAGES[Math.floor(Math.random() * BRAVO_MESSAGES.length)];
    bravoEl.classList.add('show');
  }

  // Recharger la carte pour afficher "Fait"
  const card = btn?.closest('.ex-card');
  if (card) card.classList.add('done');
  btn?.closest('.ex-actions')?.remove();
  if (card?.querySelector('.ex-right')) {
    card.querySelector('.ex-right').insertAdjacentHTML('afterbegin', '<span class="done-badge">✓ Fait</span>');
  }

  // Toast XP
  showToast('success', '⭐', `+${ex.xp} XP !`, `Exercice ${id} complété !`);

  // Badges
  newBadges.forEach(b => setTimeout(() => celebrateBadge(b), 600));

  updateHeaderUI();
  updateParcoursCards();
}

/* ===================================================================
   AUTOMATISME QCM ENGINE
   =================================================================== */

let qcmSession = { index: 0, score: 0, answers: [] };

function startQCMSession(container) {
  qcmSession = { index: 0, score: 0, answers: [] };
  renderQCMQuestion(container);
}

function renderQCMQuestion(container) {
  if (qcmSession.index >= AUTOMATISMES.length) {
    renderQCMResult(container);
    return;
  }

  const q = AUTOMATISMES[qcmSession.index];
  const total = AUTOMATISMES.length;
  const pct = Math.round((qcmSession.index / total) * 100);
  const optionsHTML = q.options.map((opt, i) =>
    `<button class="qcm-opt" onclick="answerQCM(${i}, '${q.id}', this, '${CSS.escape(container.id) || ''}')">
      <span class="katex-content">${opt}</span>
    </button>`
  ).join('');

  container.innerHTML = `
    <div class="diag-progress">
      <div class="diag-prog-bar"><div class="diag-prog-fill" style="width:${pct}%"></div></div>
      <div class="diag-prog-label"><span>Question ${qcmSession.index + 1} / ${total}</span><span>Score : ${qcmSession.score}</span></div>
    </div>
    <div class="ex-card fade-in">
      <div class="ex-header">
        <div class="ex-meta"><span class="ex-id">${q.id}</span></div>
        <div class="ex-right"><span class="ex-xp">⭐ ${q.xp} XP</span></div>
      </div>
      <div class="ex-body">
        <div class="enonce katex-content">${q.question}</div>
        <div class="qcm-wrap"><div class="qcm-options">${optionsHTML}</div></div>
        <div id="qcm-expl" class="solution-box"></div>
      </div>
    </div>`;

  if (typeof renderMathInElement !== 'undefined') {
    setTimeout(() => renderMathInElement(container, {
      delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
      throwOnError: false,
    }), 50);
  }
}

function answerQCM(idx, qId, btn, containerId) {
  const q = AUTOMATISMES[qcmSession.index];
  if (!q || q.id !== qId) return;

  const opts = btn.closest('.qcm-options').querySelectorAll('.qcm-opt');
  opts.forEach(o => o.disabled = true);

  const correct = idx === q.reponse;

  opts[q.reponse].classList.add('correct');
  if (!correct) btn.classList.add('wrong');

  if (correct) {
    qcmSession.score++;
    markExerciceDone(q.id, q.xp);
    showToast('success', '✅', 'Bonne réponse !', `+${q.xp} XP`);
  } else {
    showToast('', '❌', 'Raté !', 'Regarde l\'explication ci-dessous.');
  }

  qcmSession.answers.push({ qId, correct });

  // Afficher l'explication
  const explEl = document.getElementById('qcm-expl');
  if (explEl) {
    explEl.classList.add('show');
    explEl.innerHTML = `<div class="box-title">${correct ? '✅' : '💡'} Explication</div>
      <div class="katex-content">${q.explication}</div>`;
    if (typeof renderMathInElement !== 'undefined') {
      setTimeout(() => renderMathInElement(explEl, {
        delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
        throwOnError: false,
      }), 50);
    }
  }

  // Bouton Suivant
  const container = containerId ? document.getElementById(containerId) : document.querySelector('[data-qcm-container]');
  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn btn-primary btn-lg';
  nextBtn.style.marginTop = '1rem';
  nextBtn.textContent = qcmSession.index + 1 < AUTOMATISMES.length ? 'Question suivante →' : 'Voir mon score 🏆';
  nextBtn.onclick = () => {
    qcmSession.index++;
    if (container) renderQCMQuestion(container);
  };
  explEl?.after(nextBtn);
}

function renderQCMResult(container) {
  const score = qcmSession.score;
  const total = AUTOMATISMES.length;
  const pct = Math.round((score / total) * 100);
  let emoji = pct >= 80 ? '🏆' : pct >= 60 ? '🌟' : pct >= 40 ? '💪' : '📚';
  let msg = pct >= 80
    ? 'Excellent ! Tu maîtrises les automatismes du BAC !'
    : pct >= 60
    ? 'Très bien ! Continue à t\'entraîner régulièrement.'
    : pct >= 40
    ? 'Bon début ! La régularité fera la différence.'
    : 'C\'est un début ! Reviens t\'entraîner chaque jour.';

  container.innerHTML = `
    <div class="result-card fade-in">
      <div class="result-emoji">${emoji}</div>
      <h2>Score : ${score} / ${total}</h2>
      <p>${msg}</p>
      <div class="result-reco">
        <div class="result-reco-title">🎯 À l'épreuve anticipée de Première</div>
        <p>Les automatismes représentent <strong>6 points</strong> sur 20, sans calculatrice, en quelques secondes par question. S'entraîner régulièrement cet été, c'est déjà sécuriser ces points !</p>
      </div>
      <button class="btn btn-primary btn-lg" onclick="startQCMSession(document.getElementById('${container.id}'))">🔄 Recommencer</button>
    </div>`;

  updateHeaderUI();
}

/* ===================================================================
   UTILITAIRES
   =================================================================== */
function today() {
  return new Date().toISOString().slice(0, 10);
}
function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
function randomQuote() {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}
function getParcoursColor(p) {
  return { A: 'orange', B: 'purple', C: 'blue', AUTO: 'gold' }[p] || 'blue';
}

/* ===================================================================
   INIT
   =================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  buildAuthModal();

  // Afficher modal si première visite
  if (!state.user) {
    setTimeout(() => showLoginModal(), 800);
  }

  updateHeaderUI();
  updateParcoursCards();

  // Citation du jour
  const quoteEl = document.getElementById('daily-quote');
  const quoteAuthorEl = document.getElementById('daily-quote-author');
  if (quoteEl) {
    const q = randomQuote();
    quoteEl.textContent = `"${q.text}"`;
    if (quoteAuthorEl) quoteAuthorEl.textContent = `— ${q.author}`;
  }

  // Rendre KaTeX global
  if (typeof renderMathInElement !== 'undefined') {
    renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false,
    });
  }
});
