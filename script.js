// ════════════════════════════════════
// CONFIG
// ════════════════════════════════════
const MAX_QUESTIONS = 100;
const STORAGE_KEY_API = 'quizforge_apikey';
const STORAGE_KEY_QUIZ = 'quizforge_draft';
const STORAGE_KEY_PUBLIC_URL = 'quizforge_public_url';
const DEFAULT_API_BASE = 'https://quiz-link-generator.onrender.com';

// ════════════════════════════════════
// STATE
// ════════════════════════════════════
let quiz = { title: 'My Quiz', desc: '', timePerQ: 30, pointsPerQ: 10, timed: true, questions: [] };
let selectedQIndex = -1;
let playerName = '';
let playerId = '';
let currentQ = 0;
let playerAnswers = [];
let playerSkipped = [];
let timerInterval = null;
let timeLeft = 0;
let activeQuiz = null;
let activeQuizBinId = '';
let quizStartedAt = null;
let pendingShareUrl = '';

const KEYS = ['A','B','C','D'];

// ════════════════════════════════════
// BOOT
// ════════════════════════════════════
(async function boot() {
  const params = new URLSearchParams(window.location.search);
  const apiBase = params.get('api');
  if (apiBase) localStorage.setItem(STORAGE_KEY_API, normalizeApiBase(apiBase));
  const binId = params.get('id');
  if (binId) {
    showLoading('Loading quiz...');
    try {
      const data = await fetchQuizFromBin(binId);
      if (data && Array.isArray(data.questions) && data.questions.length > 0) {
        activeQuiz = data;
        activeQuiz.timed = activeQuiz.timed !== false;
        activeQuizBinId = binId;
        hideLoading();
        showLobby(activeQuiz);
        return;
      }
      throw new Error('Invalid quiz data');
    } catch(e) {
      hideLoading();
      document.getElementById('error-msg').textContent = 'Could not load the quiz. The link may be expired or the storage key has changed.';
      goTo('error');
      return;
    }
  }
  // Load saved draft
  try {
    const saved = localStorage.getItem(STORAGE_KEY_QUIZ);
    if (saved) { const d = JSON.parse(saved); if (d && d.questions) { quiz = d; } }
  } catch(e) {}
  goTo('home');
  loadQuizMeta();
  renderSidebar();
  renderEditor();
  updateStatus();
})();

// ════════════════════════════════════
// NAV
// ════════════════════════════════════
function goTo(s) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById('screen-' + s).classList.add('active');
  window.scrollTo(0,0);
}

// ════════════════════════════════════
// LOADING
// ════════════════════════════════════
function showLoading(msg) {
  document.getElementById('loading-text').textContent = msg || 'Loading...';
  document.getElementById('loading-overlay').classList.add('active');
}
function hideLoading() {
  document.getElementById('loading-overlay').classList.remove('active');
}

// Pull-to-refresh interception
let touchStartY = 0, pullTriggered = false;
let quizInProgress = false; // set true in startQuiz(), false after submitQuiz() finishes

document.addEventListener('touchstart', e => {
  if (window.scrollY === 0) touchStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchmove', e => {
  if (window.scrollY === 0 && !pullTriggered && quizInProgress) {
    if (e.touches[0].clientY - touchStartY > 60) {
      pullTriggered = true;
      e.preventDefault();
      document.getElementById('refresh-modal-bg').classList.add('open');
    }
  }
}, { passive: false });

document.addEventListener('touchend', () => { pullTriggered = false; });

function cancelRefresh() {
  document.getElementById('refresh-modal-bg').classList.remove('open');
  // no-op: gesture was already prevented, nothing to restore
}
function confirmRefresh() { window.location.reload(); }

// Native dialog fallback for F5 / refresh button / tab close
window.addEventListener('beforeunload', e => {
  if (quizInProgress) { e.preventDefault(); e.returnValue = ''; }
});

// ════════════════════════════════════
// TOAST
// ════════════════════════════════════
function toast(msg, dur = 3000) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.getElementById('toast-wrap').appendChild(el);
  setTimeout(() => { el.style.animation = 'toastOut 0.25s ease forwards'; setTimeout(() => el.remove(), 270); }, dur);
}

// ════════════════════════════════════
// CONFIRM MODAL
// ════════════════════════════════════
function openConfirm(title, body, onOk, okText = 'Delete') {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-body').textContent = body;
  document.getElementById('confirm-modal-bg').classList.add('open');
  document.getElementById('confirm-ok').textContent = okText;
  document.getElementById('confirm-ok').onclick = () => { closeConfirm(); onOk(); };
}
function closeConfirm() { document.getElementById('confirm-modal-bg').classList.remove('open'); }

// ════════════════════════════════════
// API KEY MODAL
// ════════════════════════════════════
function openApiModal() {
  const saved = getBackendBase();
  const publicUrl = getPublicPageUrl();
  document.getElementById('apikey-input').value = saved;
  document.getElementById('public-url-input').value = publicUrl;
  document.getElementById('apikey-saved').style.display = saved || publicUrl ? 'block' : 'none';
  document.getElementById('apikey-modal-bg').classList.add('open');
}
function closeApiModal() { document.getElementById('apikey-modal-bg').classList.remove('open'); }
function saveApiKey() {
  const apiBase = normalizeApiBase(document.getElementById('apikey-input').value.trim());
  const publicUrl = document.getElementById('public-url-input').value.trim();
  localStorage.setItem(STORAGE_KEY_API, apiBase);
  localStorage.setItem(STORAGE_KEY_PUBLIC_URL, publicUrl);
  document.getElementById('apikey-saved').style.display = 'block';
  toast('Share settings saved!');
  closeApiModal();
  generateShareLink();
}
function normalizeApiBase(url) {
  return (url || '').replace(/\/+$/, '').replace(/\/api$/i, '');
}
function getBackendBase() { return normalizeApiBase(localStorage.getItem(STORAGE_KEY_API) || DEFAULT_API_BASE); }
function isBadBackendUrl(url) {
  return /dashboard\.render\.com|jsonbin\.io/i.test(url || '');
}
function needsExternalBackend() {
  return /static\.app$/i.test(window.location.hostname);
}

function getPublicPageUrl() {
  return localStorage.getItem(STORAGE_KEY_PUBLIC_URL) || '';
}

function getSharePageUrl() {
  const configuredUrl = getPublicPageUrl().trim();
  if (configuredUrl) return configuredUrl.split('#')[0].split('?')[0];
  if (window.location.protocol === 'file:') return '';
  return window.location.origin + window.location.pathname;
}

// ════════════════════════════════════
// JSONBIN API
// ════════════════════════════════════
async function saveQuizToBin(quizData) {
  const backendBase = getBackendBase();
  if (isBadBackendUrl(backendBase)) {
    throw new Error('Backend API URL must be your public backend app URL, not Render dashboard or JSONBin.');
  }
  if (!backendBase && needsExternalBackend()) {
    throw new Error('Add your Render backend URL in Backend API URL before sharing from static.app.');
  }
  const res = await fetch(`${backendBase}/api/quizzes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(quizData)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Backend save failed: ${res.status}`);
  }
  return await res.json();
}

async function fetchResultsBin(binId) {
  const res = await fetch(`${getBackendBase()}/api/results/${encodeURIComponent(binId)}`);
  if (!res.ok) throw new Error('Could not load results');
  return await res.json();
}

async function updateResultsBin(binId, key, resultsData) {
  const res = await fetch(`${getBackendBase()}/api/results/${encodeURIComponent(binId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(resultsData)
  });
  if (!res.ok) throw new Error('Could not save result');
}

async function fetchQuizFromBin(binId) {
  const res = await fetch(`${getBackendBase()}/api/quizzes/${encodeURIComponent(binId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Fetch failed: ${res.status}`);
  }
  return await res.json();
}

// ════════════════════════════════════
// BUILDER — META
// ════════════════════════════════════
function saveQuizMeta() {
  quiz.title = document.getElementById('quiz-title').value || 'My Quiz';
  quiz.desc = document.getElementById('quiz-desc').value || '';
  quiz.timePerQ = parseInt(document.getElementById('quiz-time').value) || 30;
  quiz.pointsPerQ = parseInt(document.getElementById('quiz-points').value) || 10;
  quiz.timed = document.getElementById('quiz-timed').checked;
  saveDraft();
}
function loadQuizMeta() {
  document.getElementById('quiz-title').value = quiz.title;
  document.getElementById('quiz-desc').value = quiz.desc || '';
  document.getElementById('quiz-time').value = quiz.timePerQ;
  document.getElementById('quiz-points').value = quiz.pointsPerQ;
  document.getElementById('quiz-timed').checked = quiz.timed !== false;
  renderCreatorResultsPanel();
}
function saveDraft() {
  try { localStorage.setItem(STORAGE_KEY_QUIZ, JSON.stringify(quiz)); } catch(e) {}
}

// ════════════════════════════════════
// BUILDER — QUESTIONS
// ════════════════════════════════════
function addQuestion() {
  if (quiz.questions.length >= MAX_QUESTIONS) { toast(`Maximum ${MAX_QUESTIONS} questions reached.`); return; }
  saveCurrentEditor();
  quiz.questions.push({ text: '', options: ['','','',''], correct: 0, time: quiz.timePerQ });
  selectedQIndex = quiz.questions.length - 1;
  renderSidebar(); renderEditor(); updateStatus(); clearSharePanel(); saveDraft();
  // scroll new thumb into view
  setTimeout(() => { const el = document.querySelector('.q-thumb.selected'); if (el) el.scrollIntoView({behavior:'smooth',block:'nearest'}); }, 50);
}

function deleteQuestion(idx) {
  openConfirm('Delete Question', `Remove question ${idx+1}? This cannot be undone.`, () => {
    quiz.questions.splice(idx, 1);
    if (selectedQIndex >= quiz.questions.length) selectedQIndex = quiz.questions.length - 1;
    renderSidebar(); renderEditor(); updateStatus(); clearSharePanel(); saveDraft();
  });
}

function selectQuestion(idx) {
  saveCurrentEditor(); selectedQIndex = idx; renderSidebar(); renderEditor();
}

function saveCurrentEditor() {
  if (selectedQIndex < 0 || selectedQIndex >= quiz.questions.length) return;
  const q = quiz.questions[selectedQIndex];
  const t = document.getElementById('q-text-input'); if (t) q.text = t.value;
  for (let i = 0; i < 4; i++) { const o = document.getElementById('opt-'+i); if (o) q.options[i] = o.value; }
  const tq = document.getElementById('q-time-input'); if (tq) q.time = parseInt(tq.value) || quiz.timePerQ;
  saveDraft();
}

function renderSidebar() {
  const list = document.getElementById('q-list');
  const badge = document.getElementById('q-count-badge');
  badge.textContent = quiz.questions.length > 0 ? `(${quiz.questions.length})` : '';
  if (quiz.questions.length === 0) {
    list.innerHTML = '<div style="color:var(--muted);font-size:0.82rem;text-align:center;padding:20px 0">No questions yet</div>';
    return;
  }
  list.innerHTML = quiz.questions.map((q,i) => `
    <div class="q-thumb ${i===selectedQIndex?'selected':''}" onclick="selectQuestion(${i})">
      <span class="q-thumb-num">Q${i+1}</span>
      <span class="q-thumb-text">${q.text || '<em>Untitled</em>'}</span>
      <span class="q-thumb-del" onclick="event.stopPropagation();deleteQuestion(${i})">✕</span>
    </div>`).join('');
}

function renderEditor() {
  const area = document.getElementById('q-editor-area');
  if (selectedQIndex < 0 || selectedQIndex >= quiz.questions.length) {
    area.innerHTML = `<div class="empty-state"><div class="empty-icon">📝</div><div>Select a question to edit, or add a new one.</div><div style="margin-top:10px"><button class="btn btn-primary" onclick="addQuestion()">+ Add Question</button></div></div>`;
    return;
  }
  const q = quiz.questions[selectedQIndex];
  area.innerHTML = `
    <div class="editor-card">
      <div class="editor-section">
        <label>Question ${selectedQIndex+1} of ${quiz.questions.length}</label>
        <textarea id="q-text-input" placeholder="Enter your question here..." oninput="liveUpdateThumb();clearSharePanel()">${escHtml(q.text)}</textarea>
      </div>
      <div class="editor-section">
        <label>Options — select the correct answer with the radio button</label>
        <div class="options-grid">
          ${q.options.map((opt,i) => `
            <div class="option-row ${i===q.correct?'is-correct':''}" id="opt-row-${i}">
              <span class="option-label">${KEYS[i]}</span>
              <input type="text" id="opt-${i}" placeholder="Option ${KEYS[i]}" value="${escHtml(opt)}" oninput="saveCurrentEditor();clearSharePanel()">
              <input type="radio" name="correct-q" class="radio-correct" value="${i}" ${i===q.correct?'checked':''} title="Correct answer" onchange="setCorrect(${i})">
            </div>`).join('')}
        </div>
        <div class="hint-text">☝ Radio = correct answer.</div>
      </div>
      <div class="settings-row">
        <div class="field">
          <label>Time for This Question (seconds)</label>
          <input type="number" id="q-time-input" min="5" max="600" value="${q.time||quiz.timePerQ}" oninput="saveCurrentEditor();clearSharePanel()">
        </div>
        <div class="field" style="display:flex;align-items:flex-end;gap:8px;padding-bottom:0">
          <button class="btn btn-ghost btn-sm" onclick="prevQ()" ${selectedQIndex===0?'disabled':''}>← Prev</button>
          <button class="btn btn-ghost btn-sm" onclick="nextQ()" ${selectedQIndex===quiz.questions.length-1?'disabled':''}>Next →</button>
        </div>
      </div>
    </div>`;
}

function prevQ() { if (selectedQIndex > 0) selectQuestion(selectedQIndex-1); }
function nextQ() { if (selectedQIndex < quiz.questions.length-1) selectQuestion(selectedQIndex+1); }

function setCorrect(idx) {
  if (selectedQIndex < 0) return;
  quiz.questions[selectedQIndex].correct = idx;
  for (let i=0;i<4;i++) { const r=document.getElementById('opt-row-'+i); if(r) r.classList.toggle('is-correct',i===idx); }
  clearSharePanel(); saveDraft();
}

function liveUpdateThumb() {
  if (selectedQIndex < 0) return;
  const t = document.getElementById('q-text-input');
  if (t) quiz.questions[selectedQIndex].text = t.value;
  renderSidebar();
}

function updateStatus() {
  const n = quiz.questions.length;
  document.getElementById('builder-status').textContent = n === 0
    ? 'No questions added.'
    : `${n}/${MAX_QUESTIONS} question${n!==1?'s':''} — ${n===MAX_QUESTIONS?'maximum reached':'ready to share'}.`;
}

function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function makeId(prefix) {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

// ════════════════════════════════════
// SHARE
// ════════════════════════════════════
function validateQuiz() {
  saveCurrentEditor(); saveQuizMeta();
  if (quiz.questions.length === 0) { toast('Add at least one question first.'); return false; }
  const bad = quiz.questions.findIndex(q => !q.text.trim() || q.options.some(o => !o.trim()));
  if (bad !== -1) { toast(`Q${bad+1} has empty fields — fill them in.`); selectQuestion(bad); return false; }
  return true;
}

async function generateShareLink() {
  if (!validateQuiz()) return;
  const sharePageUrl = getSharePageUrl();
  if (!sharePageUrl) {
    toast('Add the public URL where quiz.html is hosted before sharing.', 4500);
    openApiModal();
    return;
  }

  showLoading('Saving quiz...');
  try {
    quiz.shareId = quiz.shareId || makeId('QZ');
    delete quiz.resultsKey;
    const saved = await saveQuizToBin(quiz);
    const binId = saved.id;
    quiz.resultsBinId = saved.resultsBinId || quiz.resultsBinId;
    quiz.quizBinId = binId;
    saveDraft();
    const query = new URLSearchParams({ id: binId });
    const apiBase = getBackendBase();
    if (apiBase) query.set('api', apiBase);
    const url = sharePageUrl + '?' + query.toString();
    pendingShareUrl = url;
    document.getElementById('share-url-box').textContent = url;
    document.getElementById('share-panel').classList.add('open');
    renderCreatorResultsPanel();
    hideLoading();
    document.getElementById('share-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('Link ready! Share it anywhere.');
  } catch(e) {
    hideLoading();
    toast('Could not save quiz: ' + e.message, 5000);
  }
}

function copyShareLink() {
  if (!pendingShareUrl) return;
  navigator.clipboard.writeText(pendingShareUrl).then(() => toast('Copied!')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = pendingShareUrl; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    toast('Copied!');
  });
}

function shareVia(platform) {
  if (!pendingShareUrl) return;
  const title = quiz.title || 'Quiz';
  const msg = `Take my quiz: "${title}" — ${pendingShareUrl}`;
  const smsSep = /iPad|iPhone|iPod/.test(navigator.userAgent) ? '&' : '?';
  const urls = {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(msg)}`,
    email: `mailto:?subject=${encodeURIComponent('Quiz: ' + title)}&body=${encodeURIComponent(msg)}`,
    sms: `sms:${smsSep}body=${encodeURIComponent(msg)}`
  };
  window.open(urls[platform], '_blank');
}

function clearSharePanel() {
  document.getElementById('share-panel').classList.remove('open');
  pendingShareUrl = '';
}

function renderCreatorResultsPanel() {
  const panel = document.getElementById('results-panel');
  if (!panel) return;
  if (quiz.resultsBinId) {
    panel.classList.add('open');
    document.getElementById('results-note').textContent = 'Scores are collected when players submit this shared quiz.';
  } else {
    panel.classList.remove('open');
  }
}

async function refreshCreatorResults() {
  if (!quiz.resultsBinId) { toast('Generate a share link first.'); return; }
  showLoading('Loading results...');
  try {
    const data = await fetchResultsBin(quiz.resultsBinId);
    hideLoading();
    renderCreatorResults(data.attempts || []);
  } catch(e) {
    hideLoading();
    toast(e.message || 'Could not load results.', 4000);
  }
}

function renderCreatorResults(attempts) {
  const wrap = document.getElementById('creator-results-wrap');
  const body = document.getElementById('creator-results-body');
  const note = document.getElementById('results-note');
  if (!attempts.length) {
    wrap.style.display = 'none';
    note.textContent = 'No one has submitted this quiz yet.';
    return;
  }
  wrap.style.display = 'block';
  note.textContent = `${attempts.length} submission${attempts.length===1?'':'s'} recorded.`;
  body.innerHTML = attempts.slice().reverse().map(a => `
    <tr>
      <td>${escHtml(a.playerId)}</td>
      <td>${escHtml(a.playerName)}</td>
      <td>${a.score}/${a.maxScore} (${a.percent}%)</td>
      <td>${a.correct}</td>
      <td>${a.wrong}</td>
      <td>${a.skipped}</td>
      <td>${a.unanswered || 0}</td>
      <td>${new Date(a.submittedAt).toLocaleString()}</td>
    </tr>`).join('');
}

async function exportCreatorResults() {
  if (!quiz.resultsBinId) { toast('Generate a share link first.'); return; }
  try {
    const data = await fetchResultsBin(quiz.resultsBinId);
    const attempts = data.attempts || [];
    if (!attempts.length) { toast('No results to export yet.'); return; }
    const rows = [['Player ID','Name','Score','Max Score','Percent','Correct','Wrong','Skipped','Unanswered','Submitted At']];
    attempts.forEach(a => rows.push([a.playerId, a.playerName, a.score, a.maxScore, a.percent, a.correct, a.wrong, a.skipped, a.unanswered || 0, a.submittedAt]));
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (quiz.title.replace(/\s+/g,'_') || 'quiz') + '_results.csv';
    a.click();
    toast('Results CSV saved.');
  } catch(e) {
    toast(e.message || 'Could not export results.', 4000);
  }
}

// ════════════════════════════════════
// EXPORT / IMPORT
// ════════════════════════════════════
function exportQuiz() {
  saveCurrentEditor(); saveQuizMeta();
  if (quiz.questions.length === 0) { toast('Add at least one question first.'); return; }
  const blob = new Blob([JSON.stringify(quiz, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (quiz.title.replace(/\s+/g,'_') || 'quiz') + '.json';
  a.click(); toast('Saved as file!');
}
function triggerImport() { document.getElementById('import-file').click(); }
function importQuiz(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const d = JSON.parse(ev.target.result);
      if (!d.questions || !Array.isArray(d.questions)) throw new Error();
      if (d.questions.length > MAX_QUESTIONS) {
        toast(`This file has ${d.questions.length} questions. Only the first ${MAX_QUESTIONS} were imported.`, 5000);
        d.questions = d.questions.slice(0, MAX_QUESTIONS);
      }
      quiz = d; quiz.timePerQ = quiz.timePerQ||30; quiz.pointsPerQ = quiz.pointsPerQ||10; quiz.timed = quiz.timed !== false;
      selectedQIndex = d.questions.length>0?0:-1;
      loadQuizMeta(); renderSidebar(); renderEditor(); updateStatus(); clearSharePanel(); saveDraft();
      toast('Loaded: ' + quiz.title);
    } catch { toast('Could not read that file.'); }
  };
  reader.readAsText(file); e.target.value = '';
}

// ════════════════════════════════════
// LOBBY
// ════════════════════════════════════
function showLobby(q) {
  document.getElementById('lobby-title').textContent = q.title;
  document.getElementById('lobby-desc').textContent = q.desc || '';
  document.getElementById('lobby-pills').innerHTML = `
    <div class="meta-pill"><strong>${q.questions.length}</strong> Questions</div>
    <div class="meta-pill"><strong>${q.timed === false ? 'No' : q.timePerQ + 's'}</strong> ${q.timed === false ? 'Timer' : 'per Q'}</div>
    <div class="meta-pill"><strong>${q.pointsPerQ} pts</strong> each</div>`;
  goTo('lobby');
}

// ════════════════════════════════════
// QUIZ
// ════════════════════════════════════
function startQuiz() {
  playerName = document.getElementById('player-name').value.trim() || 'Player';
  playerId = makeId('P');
  currentQ = 0;
  playerAnswers = new Array(activeQuiz.questions.length).fill(-1);
  playerSkipped = new Array(activeQuiz.questions.length).fill(false);
  quizStartedAt = new Date();
  goTo('quiz'); loadQuestion();
  renderQNavPanel();
}

function loadQuestion() {
  const q = activeQuiz.questions[currentQ];
  const total = activeQuiz.questions.length;
  const isLast = currentQ===total-1;
  document.getElementById('q-label').textContent = `Question ${currentQ+1}`;
  document.getElementById('q-text').textContent = q.text;
  document.getElementById('q-counter').textContent = `${currentQ+1} / ${total}`;
  document.getElementById('progress-fill').style.width = ((currentQ/total)*100)+'%';
  document.getElementById('btn-next').textContent = isLast ? 'Submit' : 'Next →';
  document.getElementById('btn-skip').textContent = isLast ? 'Skip & Submit' : 'Skip';
  document.getElementById('answer-grid').innerHTML = q.options.map((opt,i) => `
    <button class="answer-btn ${playerAnswers[currentQ]===i?'selected':''}" id="ans-btn-${i}" onclick="selectAnswer(${i})">
      <span class="answer-key">${KEYS[i]}</span><span>${escHtml(opt)}</span>
    </button>`).join('');
  updateQuizStatus();
  if (activeQuiz.timed === false) stopTimerDisplay(); else startTimer(q.time || activeQuiz.timePerQ);
}

function selectAnswer(idx) {
  playerAnswers[currentQ] = idx;
  playerSkipped[currentQ] = false;
  document.querySelectorAll('.answer-btn').forEach((b,i) => b.classList.toggle('selected', i===idx));
  updateQuizStatus();
  renderQNavPanel();
}

function nextQuestion() {
  if (currentQ >= activeQuiz.questions.length - 1) {
    confirmSubmit();
    return;
  }
  clearInterval(timerInterval); currentQ++;
  loadQuestion();
}

function skipQuestion() {
  playerAnswers[currentQ] = -1;
  playerSkipped[currentQ] = true;
  if (currentQ >= activeQuiz.questions.length - 1) {
    confirmSubmit();
    return;
  }
  clearInterval(timerInterval); currentQ++;
  loadQuestion();
}

let flaggedQuestions = new Set(); // reset to new Set() in startQuiz() / retakeQuiz()

function toggleFlag() {
  flaggedQuestions.has(currentQ) ? flaggedQuestions.delete(currentQ) : flaggedQuestions.add(currentQ);
  updateFlagButton();
  renderQuizNavDots(); // rename to whatever your q-nav-panel render function is
}

function updateFlagButton() {
  const flagged = flaggedQuestions.has(currentQ);
  const btn = document.getElementById('btn-flag');
  btn.textContent = flagged ? ' Flagged' : ' Flag for Review';
  btn.classList.toggle('btn-primary', flagged);
}

function confirmSubmit() {
  clearInterval(timerInterval);
  updateQuizStatus();
  const answered = playerAnswers.filter(a => a !== -1).length;
  const skipped = playerSkipped.filter(Boolean).length;
  const unanswered = playerAnswers.length - answered - skipped;
  openConfirm(
    'Submit Quiz?',
    `You have answered ${answered} question${answered===1?'':'s'}, skipped ${skipped}, and left ${unanswered} unanswered. Submit now?`,
    submitQuiz,
    'Submit'
  );
}

function submitQuiz() {
  clearInterval(timerInterval);
  showResults();
}

function updateQuizStatus() {
  const answered = playerAnswers.filter(a => a !== -1).length;
  const skipped = playerSkipped.filter(Boolean).length;
  const unanswered = playerAnswers.length - answered - skipped;
  document.getElementById('answered-count').textContent = answered;
  document.getElementById('unanswered-count').textContent = unanswered;
  const status = document.getElementById('quiz-status');
  status.innerHTML = `
    <span class="quiz-status-chip"><strong id="answered-count">${answered}</strong> answered</span>
    <span class="quiz-status-chip"><strong id="unanswered-count">${unanswered}</strong> unanswered</span>
    <span class="quiz-status-chip"><strong>${skipped}</strong> skipped</span>`;
}

function renderQNavPanel() {
  const panel = document.getElementById('q-nav-panel');
  if (!panel) return;
  panel.innerHTML = activeQuiz.questions.map((_, i) => {
    const isAnswered = playerAnswers[i] !== -1;
    const isSkipped = playerAnswers[i] === -1 && playerSkipped[i];
    const isCurrent = i === currentQ;
    let cls = 'q-nav-dot';
    if (isAnswered) cls += ' answered';
    else if (isSkipped) cls += ' skipped';
    if (isCurrent) cls += ' current';
    return `<button class="${cls}" onclick="jumpToQuestion(${i})" title="Question ${i+1}">${i+1}</button>`;
  }).join('');
}

function jumpToQuestion(idx) {
  clearInterval(timerInterval);
  currentQ = idx;
  loadQuestion();
}

// ════════════════════════════════════
// TIMER
// ════════════════════════════════════
function startTimer(seconds) {
  clearInterval(timerInterval); timeLeft = seconds;
  const arc = document.getElementById('timer-arc');
  const numEl = document.getElementById('timer-num');
  const ring = document.getElementById('timer-ring');
  ring.classList.remove('untimed');
  const circ = 145;
  function upd() {
    numEl.textContent = timeLeft;
    arc.style.strokeDashoffset = circ * (1 - timeLeft/seconds);
    ring.classList.remove('timer-warn','timer-danger');
    if (timeLeft <= 5) ring.classList.add('timer-danger');
    else if (timeLeft <= Math.ceil(seconds*0.3)) ring.classList.add('timer-warn');
  }
  upd();
  timerInterval = setInterval(() => { timeLeft--; upd(); if (timeLeft<=0) { clearInterval(timerInterval); advanceAfterTimeout(); } }, 1000);
}

function stopTimerDisplay() {
  clearInterval(timerInterval);
  document.getElementById('timer-ring').classList.add('untimed');
}

function advanceAfterTimeout() {
  if (currentQ >= activeQuiz.questions.length - 1) submitQuiz();
  else { currentQ++; loadQuestion(); }
}

// ════════════════════════════════════
// RESULTS
// ════════════════════════════════════
function showResults() {
  goTo('results');
  let correct=0, wrong=0, skipped=0, unanswered=0;
  activeQuiz.questions.forEach((q,i) => {
    if (playerAnswers[i]===-1 && playerSkipped[i]) skipped++;
    else if (playerAnswers[i]===-1) unanswered++;
    else if (playerAnswers[i]===q.correct) correct++;
    else wrong++;
  });
  const total = activeQuiz.questions.length;
  const score = correct * activeQuiz.pointsPerQ;
  const maxScore = total * activeQuiz.pointsPerQ;
  const pct = Math.round((correct/total)*100);

  setTimeout(() => {
    const arc = document.getElementById('score-arc');
    arc.style.strokeDashoffset = 377*(1-pct/100);
    arc.style.stroke = pct>=70?'var(--success)':pct>=40?'var(--warn)':'var(--danger)';
  }, 100);

  document.getElementById('score-pct').textContent = pct+'%';
  document.getElementById('results-title').textContent = pct>=90?'🏆 Excellent!':pct>=70?'🎉 Great job!':pct>=50?'👍 Not bad!':'📚 Keep practising!';
  document.getElementById('results-sub').textContent = `${playerName} scored ${score} out of ${maxScore} points.`;
  document.getElementById('score-stats').innerHTML = `
    <div class="stat-chip"><div class="val" style="color:var(--success)">${correct}</div><div class="key">Correct</div></div>
    <div class="stat-chip"><div class="val" style="color:var(--danger)">${wrong}</div><div class="key">Wrong</div></div>
    <div class="stat-chip"><div class="val" style="color:var(--warn)">${skipped}</div><div class="key">Skipped</div></div>
    <div class="stat-chip"><div class="val">${unanswered}</div><div class="key">Unanswered</div></div>
    <div class="stat-chip"><div class="val">${score}</div><div class="key">Points</div></div>`;

  document.getElementById('answers-review').innerHTML = activeQuiz.questions.map((q,i) => {
    const ch = playerAnswers[i];
    const isCor = ch===q.correct, isSkip = ch===-1, isUnanswered = ch===-1 && !playerSkipped[i];
    const sc = (isSkip || isUnanswered)?'skipped':isCor?'correct':'wrong';
    const badge = isSkip?'<span class="review-badge badge-skipped">⏩ Skipped</span>'
      :isCor?'<span class="review-badge badge-correct">✓ Correct</span>'
      :'<span class="review-badge badge-wrong">✗ Wrong</span>';
    const opts = q.options.map((opt,oi) => {
      const isCO = oi===q.correct, isWO = oi===ch&&!isCor;
      return `<div class="review-opt ${isCO?'correct-ans':isWO?'wrong-ans':''}"><span class="dot"></span><span><strong>${KEYS[oi]}.</strong> ${escHtml(opt)}${isCO?' ✓':''}${isWO?' ✗':''}</span></div>`;
    }).join('');
    return `<div class="review-card ${sc}"><div class="review-q-num">Q${i+1}</div>${badge}<div class="review-q">${escHtml(q.text)}</div><div class="review-options">${opts}</div></div>`;
  }).join('');
  submitAttempt({ correct, wrong, skipped, unanswered, score, maxScore, percent: pct });
}

function retakeQuiz() { showLobby(activeQuiz); }

async function submitAttempt(summary) {
  if (!activeQuiz.resultsBinId) return;
  try {
    const attempt = {
      playerId,
      playerName,
      quizId: activeQuizBinId || activeQuiz.quizBinId || '',
      score: summary.score,
      maxScore: summary.maxScore,
      percent: summary.percent,
      correct: summary.correct,
      wrong: summary.wrong,
      skipped: summary.skipped,
      unanswered: summary.unanswered,
      answers: playerAnswers.slice(),
      startedAt: quizStartedAt ? quizStartedAt.toISOString() : '',
      submittedAt: new Date().toISOString()
    };
    const res = await fetch(`${getBackendBase()}/api/results/${encodeURIComponent(activeQuiz.resultsBinId)}/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attempt)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Could not submit result');
    }
    toast('Your score has been submitted.');
  } catch(e) {
    toast('Score shown, but could not submit it to the creator.', 5000);
  }
}
