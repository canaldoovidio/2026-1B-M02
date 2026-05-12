/**
 * BrPec · Sync Server
 *
 * Responsabilidade única: receber deltas vindos das PWAs dos capatazes e
 * gravá-los idempotentemente em um SQLite mestre.
 *
 * Idempotência: cada delta carrega um `client_uuid` gerado no celular do
 * capataz no momento da coleta. A tabela `evento_recebido` tem esse UUID
 * como PRIMARY KEY. `INSERT OR IGNORE` garante que reenviar o mesmo delta
 * não duplica nada — o servidor pode apenas confirmar.
 *
 * Por que better-sqlite3?
 *   - API síncrona: o código fica linear, fácil para os alunos lerem.
 *   - Performance: 30k inserts/s em transação. Suficiente pro BrPec.
 *   - Zero setup: nenhum daemon, mesmo arquivo .db do cliente.
 *
 * Para rodar:  npm install  &&  npm start
 * Para testar: npm test
 */

const express   = require('express');
const cors      = require('cors');
const Database  = require('better-sqlite3');
const path      = require('path');

const DEFAULT_PORT = 3000;

/**
 * Cria a instância do servidor + banco. Recebe um `dbPath` para que os
 * testes possam usar um banco em memória independente do produção.
 *
 * Retorna { app, db, close } — `close()` fecha o banco (útil em tests).
 */
function createServer({ dbPath = path.join(__dirname, 'brpec-server.db') } = {}) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); // melhor concorrência leitura/escrita
  db.pragma('foreign_keys = ON');

  // schema do servidor — espelha o pending da PWA, sem `synced`
  db.exec(`
    CREATE TABLE IF NOT EXISTS evento_recebido (
      client_uuid  TEXT PRIMARY KEY,
      tipo         TEXT NOT NULL,
      data         TEXT NOT NULL,
      capataz_id   INTEGER NOT NULL,
      retiro_id    INTEGER NOT NULL,
      bovino_id    INTEGER NOT NULL,
      observacao   TEXT,
      received_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_recebido_data ON evento_recebido(data);
  `);

  const app = express();
  app.use(cors());                 // PWA roda em outra origem em dev
  app.use(express.json({ limit: '512kb' }));

  // statements pré-compilados — boa prática com better-sqlite3
  const stmtInsert = db.prepare(`
    INSERT OR IGNORE INTO evento_recebido
      (client_uuid, tipo, data, capataz_id, retiro_id, bovino_id, observacao)
    VALUES
      (@client_uuid, @tipo, @data, @capataz_id, @retiro_id, @bovino_id, @observacao);
  `);

  const stmtSnapshot = db.prepare(`
    SELECT client_uuid, tipo, data, capataz_id, retiro_id, bovino_id, observacao, received_at
      FROM evento_recebido
      ORDER BY received_at DESC
      LIMIT 50;
  `);

  // health
  app.get('/healthz', (_req, res) => res.json({ ok: true, name: 'brpec-sync-server' }));

  /**
   * POST /sync/deltas
   * Body: { deltas: [{client_uuid, tipo, data, capataz_id, retiro_id, bovino_id, observacao}] }
   * Resp: { ok, accepted, skipped, accepted_uuids }
   *
   * Tudo dentro de uma transação: ou todos os INSERTs entram, ou nenhum.
   */
  app.post('/sync/deltas', (req, res) => {
    const deltas = Array.isArray(req.body?.deltas) ? req.body.deltas : null;
    if (!deltas) return res.status(400).json({ ok: false, reason: 'body inválido — esperado { deltas: [] }' });

    const tx = db.transaction((items) => {
      const accepted_uuids = [];
      let skipped = 0;
      for (const d of items) {
        // validação mínima — campos obrigatórios
        if (!d.client_uuid || !d.tipo || !d.data || !d.capataz_id || !d.retiro_id || !d.bovino_id) {
          skipped++;
          continue;
        }
        const info = stmtInsert.run({
          client_uuid: d.client_uuid,
          tipo:        d.tipo,
          data:        d.data,
          capataz_id:  d.capataz_id,
          retiro_id:   d.retiro_id,
          bovino_id:   d.bovino_id,
          observacao:  d.observacao ?? null
        });
        if (info.changes === 1) accepted_uuids.push(d.client_uuid);
        else                    skipped++;
      }
      return { accepted: accepted_uuids.length, skipped, accepted_uuids };
    });

    try {
      const result = tx(deltas);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ ok: false, reason: err.message });
    }
  });

  /**
   * GET /sync/snapshot
   * Resp: { ok, count, eventos: [...] }
   * Últimos 50 eventos para o cliente checar consistência.
   */
  app.get('/sync/snapshot', (_req, res) => {
    const eventos = stmtSnapshot.all();
    res.json({ ok: true, count: eventos.length, eventos });
  });

  function close() { db.close(); }
  return { app, db, close };
}

// Permite tanto `require('./server').createServer` quanto `node server.js`
if (require.main === module) {
  const port = parseInt(process.env.PORT, 10) || DEFAULT_PORT;
  const { app } = createServer();
  app.listen(port, () => {
    console.log(`✓ BrPec sync server escutando em http://localhost:${port}`);
    console.log(`  health: http://localhost:${port}/healthz`);
    console.log(`  POST   http://localhost:${port}/sync/deltas`);
    console.log(`  GET    http://localhost:${port}/sync/snapshot`);
  });
}

module.exports = { createServer };
