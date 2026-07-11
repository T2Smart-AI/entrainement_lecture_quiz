/* =====================================================================
   Lecture Fluide — Logique de l'application (vanilla JS)
   Fonctions REQUISES : renderCards(), loadContent(id), checkTime()
   ===================================================================== */

'use strict';

/* ---------- Constantes et configuration ---------- */
const KEY = 'lectureAppProgress';        // clé localStorage de la progression
const KEY_THEME = 'lectureAppTheme';     // clé localStorage du thème
const PASS_THRESHOLD = 3;                // seuil de réussite du quiz (/4) pour débloquer un badge de genre

// Liste des genres avec leur code à 3 lettres et leur couleur (repli de couverture)
const GENRES = [
  { code: 'SCI', label: 'Science-Fiction' },
  { code: 'FAN', label: 'Fantasy' },
  { code: 'HOR', label: 'Horreur' },
  { code: 'DYS', label: 'Dystopie' },
  { code: 'AVA', label: 'Aventure' },
  { code: 'POE', label: 'Poésie/Fables' }
];

// Couleurs associées à chaque genre (utilisées pour les badges et le repli de couverture)
const GENRE_COLORS = {
  'Science-Fiction': 'var(--g-sci)',
  'Fantasy': 'var(--g-fan)',
  'Horreur': 'var(--g-hor)',
  'Dystopie': 'var(--g-dys)',
  'Aventure': 'var(--g-ava)',
  'Poésie/Fables': 'var(--g-poe)'
};

/* ---------- État global de l'application ---------- */
let DATA = [];                 // jeu de données complet (120 extraits)
let currentFilter = 'Tous';    // filtre de genre actif
let currentSort = 'titre';     // critère de tri actif
let currentExcerpt = null;     // extrait actuellement ouvert
let quizState = [];            // réponses choisies par question (null = non répondu)
let quizScore = 0;             // nombre de bonnes réponses
let answeredCount = 0;         // nombre de questions répondues
let quizRevealed = false;      // le bouton "Lancer le quiz" a-t-il été révélé ?
let achievedTime = 0;          // temps de lecture retenu (secondes) pour le quiz
let progress = loadProgress(); // progression chargée depuis localStorage

// Objet minuteur (démarre en vue Lecture, se met en pause en quittant, reset à chaque nouvel extrait)
const timer = { id: null, start: 0, acc: 0, running: false };

/* =====================================================================
   CHARGEMENT DES DONNÉES
   Essaie fetch('data.json') (mode HTTP), sinon window.APP_DATA (mode file://)
   ===================================================================== */
async function loadData() {
  try {
    const res = await fetch('data.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (Array.isArray(json) && json.length) return json;
    throw new Error('données vides');
  } catch (e) {
    // Repli : data.js définit window.APP_DATA (fonctionne en ouverture directe file://)
    if (window.APP_DATA && Array.isArray(window.APP_DATA) && window.APP_DATA.length) {
      return window.APP_DATA;
    }
    throw new Error('Aucune donnée disponible (ni data.json ni window.APP_DATA).');
  }
}

/* =====================================================================
   RENDU DE LA GALERIE  (fonction REQUISE)
   Génère la grille de cartes en appliquant filtre + tri courants.
   Chaque carte est cliquable -> loadContent(id).
   ===================================================================== */
function renderCards() {
  const grid = document.getElementById('cards-grid');
  grid.innerHTML = '';

  // 1) Filtrage par genre
  let list = DATA.slice();
  if (currentFilter !== 'Tous') {
    list = list.filter(e => e.genre === currentFilter);
  }

  // 2) Tri (titre / auteur / niveau)
  list.sort((a, b) => {
    let av, bv;
    if (currentSort === 'auteur') {
      av = a.auteur.toLowerCase(); bv = b.auteur.toLowerCase();
    } else if (currentSort === 'niveau') {
      const order = { 'Débutant': 0, 'Intermédiaire': 1, 'Avancé': 2 };
      av = order[a.niveau]; bv = order[b.niveau];
    } else {
      av = a.titre.toLowerCase(); bv = b.titre.toLowerCase();
    }
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  });

  // État vide éventuel
  document.getElementById('empty-state').hidden = list.length > 0;

  // 3) Création des cartes
  list.forEach(ex => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.id = ex.id;
    card.setAttribute('aria-label', 'Ouvrir l\'extrait : ' + ex.titre + ' par ' + ex.auteur);

    // En-tête : titres + emplacement de la couverture
    const top = document.createElement('div');
    top.className = 'card-top';

    const headings = document.createElement('div');
    headings.className = 'card-headings';
    const h3 = document.createElement('h3');
    h3.className = 'card-titre';
    h3.textContent = ex.titre;
    const p = document.createElement('p');
    p.className = 'card-auteur';
    p.textContent = ex.auteur;
    headings.appendChild(h3);
    headings.appendChild(p);

    const slot = document.createElement('div');
    slot.className = 'card-cover-slot';

    top.appendChild(headings);
    top.appendChild(slot);

    // Pied : badge de genre + niveau
    const footer = document.createElement('div');
    footer.className = 'card-footer';
    const gb = document.createElement('span');
    gb.className = 'genre-badge';
    gb.textContent = ex.genre;
    gb.style.background = GENRE_COLORS[ex.genre] || 'var(--accent)';
    const nv = document.createElement('span');
    nv.className = 'niveau';
    nv.textContent = ex.niveau;
    footer.appendChild(gb);
    footer.appendChild(nv);

    card.appendChild(top);
    card.appendChild(footer);

    // Indicateur "déjà lu"
    if (progress.results[ex.id]) {
      const flag = document.createElement('div');
      flag.className = 'card-read-flag';
      flag.textContent = '✓ Lu';
      card.appendChild(flag);
    }

    // Clic -> ouverture de la lecture
    card.addEventListener('click', () => loadContent(ex.id));
    grid.appendChild(card);

    // Tentative de couverture (avec repli gracieux)
    applyCover(slot, ex, 'card');
  });
}

/* =====================================================================
   CHARGEMENT D'UN EXTRAIT DANS LA VUE LECTURE  (fonction REQUISE)
   Affiche le texte, démarre le minuteur, prépare les données du quiz,
   et réinitialise le minuteur pour ce nouvel extrait.
   ===================================================================== */
function loadContent(id) {
  const ex = DATA.find(e => e.id === id);
  if (!ex) return;
  currentExcerpt = ex;

  // En-tête de lecture
  const gb = document.getElementById('lecture-genre');
  gb.textContent = ex.genre;
  gb.style.background = GENRE_COLORS[ex.genre] || 'var(--accent)';
  document.getElementById('lecture-id').textContent = ex.id;
  document.getElementById('lecture-titre').textContent = ex.titre;
  document.getElementById('lecture-auteur').textContent = ex.auteur;

  // Texte de l'extrait (découpage en paragraphes sur les sauts de ligne)
  const rt = document.getElementById('lecture-text');
  rt.innerHTML = '';
  ex.extrait.split(/\n+/).forEach(par => {
    if (par.trim()) {
      const p = document.createElement('p');
      p.textContent = par.trim();
      rt.appendChild(p);
    }
  });

  // Couverture (repli coloré par genre en attendant/sinon)
  const cover = document.getElementById('lecture-cover');
  cover.style.background = GENRE_COLORS[ex.genre] || 'var(--accent)';
  cover.textContent = ex.genre.charAt(0);
  applyCover(cover, ex, 'lecture');
  document.getElementById('lecture-cover-caption').textContent = ex.titre;

  // Minuteur : temps cible
  document.getElementById('timer-target').textContent = 'cible ' + fmt(ex.temps_cible_secondes);

  // Réinitialisation de l'état lecture/quiz pour ce nouvel extrait
  quizRevealed = false;
  document.getElementById('finished-btn').hidden = false;
  document.getElementById('start-quiz-btn').hidden = true;

  // Réinitialise et démarre le minuteur, puis affiche la vue Lecture
  resetTimer();
  showView('lecture');
  startTimer();

  // Accessibilité : focus sur le titre
  const titre = document.getElementById('lecture-titre');
  titre.setAttribute('tabindex', '-1');
  titre.focus();
}

/* =====================================================================
   ÉVALUATION DU TEMPS  (fonction REQUISE)
   Compare le temps réalisé (achieved) au temps cible (target) pour
   attribuer un badge (Or / Argent / aucun) et le bonus de vitesse.
     - Or      : achieved < 80% du target
     - Argent  : achieved < target
     - aucun   : sinon
   Bonus de vitesse = 50 pts si achieved < target, sinon 0.
   ===================================================================== */
function checkTime(achieved, target) {
  const orThreshold = target * 0.8;
  let badge = 'none';
  if (achieved < orThreshold) {
    badge = 'or';
  } else if (achieved < target) {
    badge = 'argent';
  }
  const speedBonus = achieved < target ? 50 : 0;
  return { badge: badge, speedBonus: speedBonus };
}

/* =====================================================================
   MINUTEUR (démarre en Lecture, pause en quittant, reset sur nouvel extrait)
   ===================================================================== */
function startTimer() {
  if (timer.running) return;
  timer.start = Date.now();
  timer.running = true;
  timer.id = setInterval(updateTimerDisplay, 250);
  updateTimerDisplay();
}
function pauseTimer() {
  if (!timer.running) return;
  timer.acc += Date.now() - timer.start;
  clearInterval(timer.id);
  timer.running = false;
}
function resetTimer() {
  pauseTimer();
  timer.acc = 0;
  updateTimerDisplay();
}
function getElapsedSeconds() {
  const extra = timer.running ? Date.now() - timer.start : 0;
  return Math.floor((timer.acc + extra) / 1000);
}
function updateTimerDisplay() {
  document.getElementById('timer-elapsed').textContent = fmt(getElapsedSeconds());
}

/* =====================================================================
   QUIZ : rendu, validation, feedback et résultats
   ===================================================================== */
function startQuiz() {
  if (!currentExcerpt) return;
  pauseTimer();                              // on fige le temps de lecture
  achievedTime = getElapsedSeconds();        // temps retenu pour le badge/points
  renderQuiz(currentExcerpt);
  showView('quiz');
}

function renderQuiz(ex) {
  const wrap = document.getElementById('quiz-questions');
  wrap.innerHTML = '';
  document.getElementById('quiz-results').hidden = true;
  document.getElementById('quiz-subtitle').textContent = ex.titre + ' — ' + ex.auteur;

  quizState = ex.quiz.map(() => null);
  quizScore = 0;
  answeredCount = 0;

  ex.quiz.forEach((item, qi) => {
    const block = document.createElement('div');
    block.className = 'question-block';

    const qt = document.createElement('p');
    qt.className = 'question-text';
    qt.textContent = (qi + 1) + '. ' + item.q;

    const opts = document.createElement('div');
    opts.className = 'options';

    item.o.forEach((optText, oi) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option';
      const key = document.createElement('span');
      key.className = 'opt-key';
      key.textContent = String.fromCharCode(65 + oi); // A, B, C, D
      const lbl = document.createElement('span');
      lbl.textContent = optText;
      btn.appendChild(key);
      btn.appendChild(lbl);
      btn.addEventListener('click', () => handleAnswer(qi, oi, block));
      opts.appendChild(btn);
    });

    block.appendChild(qt);
    block.appendChild(opts);
    wrap.appendChild(block);
  });
}

// Validation d'une réponse avec feedback immédiat
function handleAnswer(qi, oi, block) {
  if (quizState[qi] !== null) return; // question déjà répondue
  quizState[qi] = oi;

  const correctIdx = currentExcerpt.quiz[qi].r;
  const opts = block.querySelectorAll('.option');
  opts.forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === correctIdx) btn.classList.add('correct');           // bonne réponse en vert
    if (idx === oi && oi !== correctIdx) btn.classList.add('wrong'); // mauvais choix en rouge
  });

  if (oi === correctIdx) quizScore++;
  answeredCount++;

  // Toutes les questions répondues -> afficher les résultats
  if (answeredCount === currentExcerpt.quiz.length) {
    setTimeout(showResults, 700);
  }
}

function showResults() {
  const ex = currentExcerpt;
  const target = ex.temps_cible_secondes;
  const evalResult = checkTime(achievedTime, target);
  const points = 100 + evalResult.speedBonus;

  // Sauvegarde de la progression (meilleur score/points conservés)
  saveResult(ex, quizScore, achievedTime, evalResult.badge, points);

  // Affichage du panneau de résultats
  document.getElementById('result-score').textContent = quizScore + ' / ' + ex.quiz.length;
  document.getElementById('result-time').textContent = fmt(achievedTime) + ' (cible ' + fmt(target) + ')';

  const badgeEl = document.getElementById('result-badge');
  if (evalResult.badge === 'or') {
    badgeEl.textContent = '🥇 Or';
    badgeEl.className = 'result-value badge-or';
  } else if (evalResult.badge === 'argent') {
    badgeEl.textContent = '🥈 Argent';
    badgeEl.className = 'result-value badge-argent';
  } else {
    badgeEl.textContent = '—';
    badgeEl.className = 'result-value';
  }

  document.getElementById('result-points').textContent = '+' + points;
  const panel = document.getElementById('quiz-results');
  panel.hidden = false;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* =====================================================================
   PERSISTANCE (localStorage) : résultats, points, badges de genre, temps
   ===================================================================== */
function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        results: p.results || {},       // id -> { score, time, badge, points }
        points: p.points || 0,
        genreBadges: p.genreBadges || {} // label de genre -> true
      };
    }
  } catch (e) { /* ignore */ }
  return { results: {}, points: 0, genreBadges: {} };
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch (e) { /* quota/indisponible : on ignore */ }
}

function saveResult(ex, score, time, badge, points) {
  const id = ex.id;
  const prev = progress.results[id];
  const best = {
    score: Math.max(score, prev ? prev.score : 0),
    time: prev ? Math.min(prev.time, time) : time,
    badge: (prev && prev.badge === 'or') ? 'or' : badge,
    points: Math.max(points, prev ? prev.points : 0)
  };
  progress.results[id] = best;
  recomputePoints();
  checkGenreBadges();
  persist();
  updateProgressUI();
}

function recomputePoints() {
  let total = 0;
  for (const id in progress.results) total += progress.results[id].points || 0;
  progress.points = total;
}

// Débloque un badge de genre quand les 20 extraits sont lus ET réussis (score >= seuil)
function checkGenreBadges() {
  GENRES.forEach(g => {
    const inGenre = DATA.filter(e => e.genre === g.label);
    if (!inGenre.length) return;
    const passed = inGenre.filter(e => {
      const r = progress.results[e.id];
      return r && r.score >= PASS_THRESHOLD;
    }).length;
    if (passed >= inGenre.length) progress.genreBadges[g.label] = true;
  });
}

/* =====================================================================
   MISE À JOUR DE L'INTERFACE DE PROGRESSION (barre + points + badges)
   ===================================================================== */
function updateProgressUI() {
  const readCount = Object.keys(progress.results).length;
  const total = DATA.length || 120;
  const pct = Math.round((readCount / total) * 100);

  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-label').textContent = readCount + ' / ' + total + ' lus';
  document.getElementById('progress-bar').setAttribute('aria-valuenow', String(readCount));
  document.getElementById('points-label').textContent = '⭐ ' + progress.points + ' pts';

  renderGenreBadgesPanel();
}

function renderGenreBadgesPanel() {
  const wrap = document.getElementById('genre-badges');
  wrap.innerHTML = '';
  GENRES.forEach(g => {
    const unlocked = !!progress.genreBadges[g.label];
    const pill = document.createElement('span');
    pill.className = 'genre-badge-pill' + (unlocked ? ' unlocked' : '');
    if (unlocked) pill.style.background = GENRE_COLORS[g.label];
    const medal = document.createElement('span');
    medal.className = 'medal';
    medal.textContent = unlocked ? '🏅' : '🔒';
    const txt = document.createElement('span');
    txt.textContent = g.label;
    pill.appendChild(medal);
    pill.appendChild(txt);
    wrap.appendChild(pill);
  });
}

/* =====================================================================
   COUVERTURES (Open Library) avec repli stylé hors-ligne / sans image
   ===================================================================== */
function fetchCover(excerpt) {
  const url = 'https://openlibrary.org/search.json?title=' +
    encodeURIComponent(excerpt.titre) + '&author=' + encodeURIComponent(excerpt.auteur) + '&limit=1';
  return fetch(url)
    .then(r => r.json())
    .then(data => {
      const doc = data.docs && data.docs[0];
      if (doc && doc.cover_i) {
        return 'https://covers.openlibrary.org/b/id/' + doc.cover_i + '-M.jpg';
      }
      return null;
    })
    .catch(() => null); // échec réseau (hors-ligne) -> repli, aucune erreur bloquante
}

// Remplit le conteneur avec l'image. Priorité de repli :
//   1) image locale  images/<id>.jpg   (fonctionne hors-ligne)
//   2) API Open Library (fetchCover)   (si le fichier local est absent/erroné)
//   3) bloc coloré stylé par genre     (repli final CSS)
function applyCover(container, excerpt, size) {
  container.innerHTML = '';
  const localImg = document.createElement('img');
  localImg.alt = '';
  localImg.loading = 'lazy';
  localImg.src = 'images/' + encodeURIComponent(excerpt.id) + '.jpg';
  if (size === 'card') localImg.className = 'card-cover';

  // Repli secondaire : tente l'API Open Library si le fichier local échoue.
  localImg.onerror = () => {
    fetchCover(excerpt).then(url => {
      container.innerHTML = '';
      if (url) {
        const apiImg = document.createElement('img');
        apiImg.alt = '';
        apiImg.loading = 'lazy';
        apiImg.src = url;
        if (size === 'card') apiImg.className = 'card-cover';
        // Repli final : bloc coloré stylé par genre.
        apiImg.onerror = () => renderFallback(container, excerpt, size);
        container.appendChild(apiImg);
      } else {
        renderFallback(container, excerpt, size);
      }
    });
  };

  container.appendChild(localImg);
}

function renderFallback(container, excerpt, size) {
  container.innerHTML = '';
  const color = GENRE_COLORS[excerpt.genre] || 'var(--accent)';
  if (size === 'card') {
    const d = document.createElement('div');
    d.className = 'card-cover-fallback';
    d.style.background = color;
    d.textContent = excerpt.genre.charAt(0);
    container.appendChild(d);
  } else {
    container.style.background = color;
    container.textContent = excerpt.genre.charAt(0);
  }
}

/* =====================================================================
   NAVIGATION ENTRE VUES
   ===================================================================== */
function showView(name) {
  if (name !== 'lecture') pauseTimer(); // met le minuteur en pause en quittant la lecture
  ['galerie', 'lecture', 'quiz'].forEach(v => {
    const el = document.getElementById('view-' + v);
    const active = v === name;
    el.classList.toggle('active', active);
    el.hidden = !active;
  });
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function revealQuizButton() {
  if (quizRevealed) return;
  quizRevealed = true;
  document.getElementById('start-quiz-btn').hidden = false;
  document.getElementById('finished-btn').hidden = true;
}

/* =====================================================================
   THÈME CLAIR / SOMBRE
   ===================================================================== */
const themeBtn = document.getElementById('theme-btn');
function applyTheme(mode) {
  document.body.classList.toggle('dark', mode === 'dark');
  document.body.classList.toggle('light', mode === 'light');
  themeBtn.setAttribute('aria-pressed', mode === 'dark' ? 'true' : 'false');
  themeBtn.innerHTML = (mode === 'dark' ? '☀️' : '🌙') + ' <span class="icon-btn-text">Thème</span>';
}
function initTheme() {
  const saved = localStorage.getItem(KEY_THEME);
  if (saved === 'dark' || saved === 'light') {
    applyTheme(saved);
  } else {
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(sysDark ? 'dark' : 'light');
  }
}

/* =====================================================================
   MODALE MODE D'EMPLOI
   ===================================================================== */
const helpModal = document.getElementById('help-modal');
function openHelp() {
  helpModal.hidden = false;
  const closeBtn = helpModal.querySelector('.btn-primary');
  if (closeBtn) closeBtn.focus();
}
function closeHelp() {
  helpModal.hidden = true;
}

/* =====================================================================
   UTILITAIRE : format mm:ss
   ===================================================================== */
function fmt(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

/* =====================================================================
   INITIALISATION DES CONTRÔLES ET ÉCOUTEURS
   ===================================================================== */
function renderGenreFilters() {
  const wrap = document.getElementById('genre-filters');
  wrap.innerHTML = '';
  const all = ['Tous'].concat(GENRES.map(g => g.label));
  all.forEach(label => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (label === currentFilter ? ' active' : '');
    b.textContent = label;
    b.dataset.genre = label;
    wrap.appendChild(b);
  });
}

function attachListeners() {
  // Filtre par genre (délégation)
  document.getElementById('genre-filters').addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    currentFilter = b.dataset.genre;
    document.querySelectorAll('#genre-filters .chip').forEach(c =>
      c.classList.toggle('active', c.dataset.genre === currentFilter));
    renderCards();
  });

  // Tri
  document.getElementById('sort-select').addEventListener('change', e => {
    currentSort = e.target.value;
    renderCards();
  });

  // Thème
  themeBtn.addEventListener('click', () => {
    const next = document.body.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(KEY_THEME, next); } catch (e) { /* ignore */ }
  });

  // Aide
  document.getElementById('help-btn').addEventListener('click', openHelp);
  helpModal.addEventListener('click', e => {
    if (e.target.dataset.action === 'close-help' || e.target.classList.contains('modal-backdrop')) closeHelp();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !helpModal.hidden) closeHelp();
  });

  // Boutons d'action génériques (retours, fermeture modale)
  document.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      const a = el.dataset.action;
      if (a === 'back-galerie') { showView('galerie'); renderCards(); }
      else if (a === 'back-lecture') { showView('lecture'); }
      else if (a === 'close-help') { closeHelp(); }
    });
  });

  // Lecture : fin de lecture + lancement du quiz
  document.getElementById('finished-btn').addEventListener('click', revealQuizButton);
  document.getElementById('start-quiz-btn').addEventListener('click', startQuiz);

  // Résultats : retour galerie / extrait suivant
  document.getElementById('result-galerie-btn').addEventListener('click', () => {
    showView('galerie'); renderCards();
  });
  document.getElementById('result-next-btn').addEventListener('click', () => {
    if (!currentExcerpt) return;
    const idx = DATA.findIndex(e => e.id === currentExcerpt.id);
    const next = DATA[(idx + 1) % DATA.length];
    loadContent(next.id);
  });

  // Révélation du bouton quiz au défilement vers le bas du texte
  window.addEventListener('scroll', () => {
    if (quizRevealed || !currentExcerpt) return;
    const rt = document.getElementById('lecture-text');
    const rect = rt.getBoundingClientRect();
    if (rect.bottom <= window.innerHeight + 20) revealQuizButton();
  }, { passive: true });
}

/* =====================================================================
   DÉMARRAGE
   ===================================================================== */
async function init() {
  initTheme();
  attachListeners();
  try {
    DATA = await loadData();
  } catch (e) {
    alert('Impossible de charger les données des extraits.');
    return;
  }
  renderGenreFilters();
  renderCards();
  updateProgressUI();
}

init();
