/* BrPec PWA · camada de banco
 *
 * Estratégia de persistência:
 *   - sql.js carrega o motor SQLite em WebAssembly.
 *   - Persistência: o blob binário do banco vive em IndexedDB (key 'brpec.db').
 *   - No primeiro boot, baixamos o seed (../brpec/brpec.db) e gravamos no IDB.
 *   - Após cada INSERT, exportamos o blob e regravamos.
 *
 * Por que não OPFS direto? Porque OPFS exige COOP/COEP, que o GitHub Pages
 * não serve. IndexedDB + blob é portátil e funciona em qualquer host.
 *
 * Por que não atomic-locks por aba? Caso o capataz abra duas abas, a última
 * gravação "vence". Para o cenário-alvo (1 capataz, 1 dispositivo) isso é ok.
 */

const IDB_NAME = 'brpec-pwa';
const IDB_STORE = 'kv';
const IDB_KEY_DB = 'brpec.db';
const SEED_URL = '../brpec/brpec.db';

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function fetchSeed() {
  const resp = await fetch(SEED_URL);
  if (!resp.ok) throw new Error(`seed HTTP ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

/**
 * Inicializa o banco: motor + blob (do IDB ou seed) + tabela pending.
 * Retorna { SQL, db, persist }.
 */
export async function initDb() {
  // 1) motor
  const SQL = await initSqlJs({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/${f}`
  });

  // 2) blob: IDB primeiro; seed se não houver
  let blob = await idbGet(IDB_KEY_DB);
  if (!blob) {
    blob = await fetchSeed();
    await idbSet(IDB_KEY_DB, blob);
  }

  // 3) abre banco
  const db = new SQL.Database(blob);

  // 4) garante tabela de pendentes (idempotente)
  db.run(`
    CREATE TABLE IF NOT EXISTS evento_zootecnico_pending (
      client_uuid TEXT PRIMARY KEY,
      tipo        TEXT NOT NULL,
      data        TEXT NOT NULL,
      capataz_id  INTEGER NOT NULL,
      retiro_id   INTEGER NOT NULL,
      bovino_id   INTEGER NOT NULL,
      observacao  TEXT,
      synced      INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // 5) função para persistir o estado após mutações
  async function persist() {
    const bytes = db.export();
    await idbSet(IDB_KEY_DB, bytes);
  }

  return { SQL, db, persist };
}

/** Retorna [{id,brinco,sexo}] para popular o select. */
export function listBovinos(db) {
  const r = db.exec('SELECT id, brinco, sexo FROM bovino ORDER BY brinco;');
  return r.length ? r[0].values.map((v) => ({ id: v[0], brinco: v[1], sexo: v[2] })) : [];
}

/** Retorna [{id,nome}] para popular o select. */
export function listRetiros(db) {
  const r = db.exec('SELECT id, nome FROM retiro ORDER BY nome;');
  return r.length ? r[0].values.map((v) => ({ id: v[0], nome: v[1] })) : [];
}

/** Insere um evento pendente. Idempotente via UNIQUE(client_uuid). */
export function insertPending(db, evt) {
  db.run(
    `INSERT OR IGNORE INTO evento_zootecnico_pending
       (client_uuid, tipo, data, capataz_id, retiro_id, bovino_id, observacao)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [
      evt.client_uuid,
      evt.tipo,
      evt.data,
      evt.capataz_id,
      evt.retiro_id,
      evt.bovino_id,
      evt.observacao || null
    ]
  );
}

/** Lista eventos pendentes (mais novos primeiro), limit opcional. */
export function listEventos(db, limit = 20) {
  const r = db.exec(
    `SELECT p.client_uuid, p.tipo, p.data, p.observacao, p.synced, p.created_at,
            b.brinco
       FROM evento_zootecnico_pending p
       LEFT JOIN bovino b ON b.id = p.bovino_id
       ORDER BY p.created_at DESC
       LIMIT ${limit};`
  );
  if (!r.length) return [];
  return r[0].values.map((v) => ({
    client_uuid: v[0], tipo: v[1], data: v[2], observacao: v[3],
    synced: !!v[4], created_at: v[5], brinco: v[6]
  }));
}

/** Conta eventos pendentes (synced=0) e sincronizados. */
export function counters(db) {
  const pending = db.exec('SELECT COUNT(*) FROM evento_zootecnico_pending WHERE synced = 0');
  const synced  = db.exec('SELECT COUNT(*) FROM evento_zootecnico_pending WHERE synced = 1');
  return {
    pending: pending.length ? pending[0].values[0][0] : 0,
    synced:  synced.length  ? synced[0].values[0][0]  : 0
  };
}

/** Eventos não sincronizados (para enviar ao /sync/deltas). */
export function listToSync(db) {
  const r = db.exec(
    `SELECT client_uuid, tipo, data, capataz_id, retiro_id, bovino_id, observacao
       FROM evento_zootecnico_pending
       WHERE synced = 0;`
  );
  if (!r.length) return [];
  return r[0].values.map((v) => ({
    client_uuid: v[0], tipo: v[1], data: v[2],
    capataz_id: v[3], retiro_id: v[4], bovino_id: v[5],
    observacao: v[6]
  }));
}

/** Marca como sincronizado um conjunto de UUIDs aceitos pelo servidor. */
export function markSynced(db, uuids) {
  if (!uuids.length) return;
  const placeholders = uuids.map(() => '?').join(',');
  db.run(
    `UPDATE evento_zootecnico_pending
       SET synced = 1
     WHERE client_uuid IN (${placeholders});`,
    uuids
  );
}
