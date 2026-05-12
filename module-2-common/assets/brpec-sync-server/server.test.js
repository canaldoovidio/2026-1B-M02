/**
 * BrPec sync server · spec mínimo
 *
 * Cobertura intencional:
 *   - garante a contrato-chave de idempotência (reenviar não duplica)
 *   - garante que múltiplos deltas distintos entram numa única chamada
 *   - garante que payload inválido é rejeitado com 400
 *
 * É o "1 teste mínimo" que mantemos da cultura TDD do Afonso — sem virar
 * uma suíte completa. O foco da aula 5 é PWA, não cobertura de teste.
 *
 * Rodar:  npm test
 */

const test     = require('node:test');
const assert   = require('node:assert/strict');
const request  = require('supertest');
const { createServer } = require('./server');

function makeApp() {
  // banco em memória — :memory: garante isolamento entre testes
  return createServer({ dbPath: ':memory:' });
}

test('POST /sync/deltas · aceita 3 deltas distintos', async () => {
  const { app, close } = makeApp();
  const deltas = [1, 2, 3].map((i) => ({
    client_uuid: `uuid-${i}`,
    tipo:        'pesagem',
    data:        '2026-05-14',
    capataz_id:  1,
    retiro_id:   1,
    bovino_id:   i,
    observacao:  `${400 + i}kg`
  }));

  const resp = await request(app).post('/sync/deltas').send({ deltas });
  assert.equal(resp.status, 200);
  assert.equal(resp.body.ok, true);
  assert.equal(resp.body.accepted, 3);
  assert.equal(resp.body.skipped, 0);
  assert.deepEqual(resp.body.accepted_uuids.sort(), ['uuid-1', 'uuid-2', 'uuid-3']);
  close();
});

test('POST /sync/deltas · reenviar não duplica (idempotência via client_uuid)', async () => {
  const { app, close } = makeApp();
  const delta = {
    client_uuid: 'fixed-uuid-A',
    tipo:        'pesagem',
    data:        '2026-05-14',
    capataz_id:  1, retiro_id: 1, bovino_id: 1,
    observacao:  '500kg'
  };

  // primeiro envio → aceito
  const r1 = await request(app).post('/sync/deltas').send({ deltas: [delta] });
  assert.equal(r1.body.accepted, 1);
  assert.equal(r1.body.skipped,  0);

  // mesmo delta de novo → skipped (network retry simulado)
  const r2 = await request(app).post('/sync/deltas').send({ deltas: [delta] });
  assert.equal(r2.body.accepted, 0);
  assert.equal(r2.body.skipped,  1);

  // snapshot mostra 1 evento, não 2
  const snap = await request(app).get('/sync/snapshot');
  assert.equal(snap.body.count, 1);
  close();
});

test('POST /sync/deltas · payload sem deltas → 400', async () => {
  const { app, close } = makeApp();
  const resp = await request(app).post('/sync/deltas').send({ wrong: 'shape' });
  assert.equal(resp.status, 400);
  assert.equal(resp.body.ok, false);
  close();
});

test('POST /sync/deltas · delta com campo obrigatório faltando → skipped', async () => {
  const { app, close } = makeApp();
  const bad = { client_uuid: 'uuid-bad', tipo: 'pesagem' /* faltam data, FKs */ };
  const resp = await request(app).post('/sync/deltas').send({ deltas: [bad] });
  assert.equal(resp.body.accepted, 0);
  assert.equal(resp.body.skipped,  1);
  close();
});

test('GET /sync/snapshot · banco vazio → count 0', async () => {
  const { app, close } = makeApp();
  const resp = await request(app).get('/sync/snapshot');
  assert.equal(resp.status, 200);
  assert.equal(resp.body.count, 0);
  assert.deepEqual(resp.body.eventos, []);
  close();
});
