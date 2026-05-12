/* BrPec PWA · controlador da UI
 *
 * Fluxo geral:
 *   1. boot()      → registra SW, inicializa banco, popula UI
 *   2. registrar() → INSERT pending + persist + refresh
 *   3. sincronizar() → POST deltas, marca synced, persist + refresh
 *
 * Decisões pedagógicas:
 *   - Sem framework. JavaScript puro, manipulação direta do DOM. A turma
 *     ainda não viu React/Vue, e o objetivo é mostrar a mecânica.
 *   - Toast simples no rodapé para feedback. Sem alertas modais.
 *   - Capataz "logado" é fixo (id=1, João Pereira). Em produção viria do
 *     fluxo de login — não é o foco da aula.
 */

import {
  initDb, listBovinos, listRetiros, insertPending,
  listEventos, counters, listToSync, markSynced
} from './db.js';

// usuário/contexto fixos para a demo
const CAPATAZ_ID = 1;

// UUID v4 portátil. `crypto.randomUUID()` exige secure context (https/localhost);
// como a PWA pode ser servida via IP de LAN em sala, caímos para getRandomValues.
function makeUUID() {
  if (window.crypto && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch (_) { /* fall through */ }
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}

// endpoint do sync server (override via ?server=http://host:porta na URL)
const SERVER_URL = new URLSearchParams(location.search).get('server')
                 || `${location.protocol}//${location.hostname}:3000`;

let db = null;
let persist = null;

// ── boot ─────────────────────────────────────────────────────────────────
async function boot() {
  registerSW();
  hookOnlineStatus();
  hookInstallPrompt();

  try {
    const init = await initDb();
    db = init.db;
    persist = init.persist;
    populateSelects();
    refreshUI();
    setStatus('pronto', 'success');
  } catch (err) {
    setStatus(`erro ao iniciar: ${err.message}`, 'error');
    console.error(err);
  }

  document.getElementById('form').addEventListener('submit', onRegistrar);
  document.getElementById('btn-sync').addEventListener('click', onSincronizar);
  // data default = hoje
  document.getElementById('f-data').value = new Date().toISOString().slice(0, 10);
}

// ── SW ──────────────────────────────────────────────────────────────────
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').catch((err) => {
    console.warn('SW registration falhou:', err);
  });
}

// ── online / offline ─────────────────────────────────────────────────────
function hookOnlineStatus() {
  const pill = document.getElementById('online-pill');
  function render() {
    if (navigator.onLine) { pill.textContent = 'online'; pill.className = 'status-pill on'; }
    else                  { pill.textContent = 'offline'; pill.className = 'status-pill off'; }
  }
  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  render();
}

// ── install prompt (Chrome/Edge) ────────────────────────────────────────
let deferredInstall = null;
function hookInstallPrompt() {
  const box = document.getElementById('install-prompt');
  const btn = document.getElementById('btn-install');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    box.classList.add('show');
  });
  btn.addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    if (outcome === 'accepted') box.classList.remove('show');
    deferredInstall = null;
  });
}

// ── selects ──────────────────────────────────────────────────────────────
function populateSelects() {
  const selBovino = document.getElementById('f-bovino');
  const selRetiro = document.getElementById('f-retiro');
  listBovinos(db).forEach((b) => {
    const o = document.createElement('option');
    o.value = b.id;
    o.textContent = `${b.brinco} · ${b.sexo === 'F' ? '♀' : '♂'}`;
    selBovino.appendChild(o);
  });
  listRetiros(db).forEach((r) => {
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = r.nome;
    selRetiro.appendChild(o);
  });
}

// ── registrar (INSERT local) ─────────────────────────────────────────────
async function onRegistrar(ev) {
  ev.preventDefault();
  const evt = {
    client_uuid: makeUUID(),
    tipo:        document.getElementById('f-tipo').value,
    data:        document.getElementById('f-data').value,
    capataz_id:  CAPATAZ_ID,
    retiro_id:   parseInt(document.getElementById('f-retiro').value, 10),
    bovino_id:   parseInt(document.getElementById('f-bovino').value, 10),
    observacao:  document.getElementById('f-obs').value.trim() || null
  };
  if (!evt.bovino_id || !evt.retiro_id || !evt.data) {
    setStatus('preencha bovino, retiro e data', 'error');
    return;
  }
  try {
    insertPending(db, evt);
    await persist();
    setStatus(`registrado · ${evt.tipo} BR${String(evt.bovino_id).padStart(4, '0')}`, 'success');
    document.getElementById('f-obs').value = '';
    refreshUI();
  } catch (err) {
    setStatus(`erro: ${err.message}`, 'error');
  }
}

// ── sincronizar ──────────────────────────────────────────────────────────
async function onSincronizar() {
  const btn = document.getElementById('btn-sync');
  const pending = listToSync(db);
  if (!pending.length) {
    setStatus('nada pendente · tudo sincronizado', 'success');
    return;
  }
  btn.disabled = true;
  try {
    const resp = await fetch(`${SERVER_URL}/sync/deltas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deltas: pending })
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const accepted = data.accepted_uuids || [];
    markSynced(db, accepted);
    await persist();
    setStatus(
      `sync ok · ${data.accepted} novos · ${data.skipped} já tinham`,
      'success'
    );
    refreshUI();
  } catch (err) {
    setStatus(`sync falhou: ${err.message} · tentaremos depois`, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ── UI refresh ───────────────────────────────────────────────────────────
function refreshUI() {
  const c = counters(db);
  document.getElementById('cnt-pending').textContent = c.pending;
  document.getElementById('cnt-synced').textContent  = c.synced;
  document.getElementById('sync-badge').textContent  = c.pending;

  const list = document.getElementById('evt-list');
  const eventos = listEventos(db, 12);
  if (!eventos.length) {
    list.innerHTML = '<li class="empty">Nenhum evento registrado ainda neste dispositivo.</li>';
    return;
  }
  list.innerHTML = eventos.map((e) => `
    <li>
      <span class="tag ${e.synced ? 'synced' : 'pending'}">${e.synced ? 'sync' : 'pendente'}</span>
      <span class="obs"><strong>${e.tipo}</strong> · ${e.brinco || '?'}${e.observacao ? ` · ${escapeHtml(e.observacao)}` : ''}</span>
      <span class="meta">${e.data}</span>
    </li>
  `).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&#39;' }[c]));
}

// ── toast ────────────────────────────────────────────────────────────────
let toastTimer = null;
function setStatus(msg, kind = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ── start ────────────────────────────────────────────────────────────────
boot();
