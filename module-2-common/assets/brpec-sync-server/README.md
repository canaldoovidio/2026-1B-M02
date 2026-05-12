# BrPec Sync Server

Servidor de sincronização da PWA do BrPec. Recebe `POST /sync/deltas` com
eventos zootécnicos coletados offline pelo capataz e os reconcilia
idempotentemente no SQLite mestre.

## Stack
- Node.js 20+
- Express 4 (CORS habilitado)
- better-sqlite3 (síncrono, simples)
- `node --test` + supertest (spec mínimo)

## Instalar e rodar
```bash
cd module-2-common/assets/brpec-sync-server
npm install
npm start              # sobe na porta 3000
# em outra aba:
npm test               # 5 specs, sem timeout
```

## Endpoints
| método | rota             | propósito                                           |
|--------|------------------|------------------------------------------------------|
| GET    | `/healthz`       | health check                                         |
| POST   | `/sync/deltas`   | recebe array de eventos · idempotente via `client_uuid` |
| GET    | `/sync/snapshot` | últimos 50 eventos do banco mestre                   |

### Exemplo · `POST /sync/deltas`
```json
{
  "deltas": [
    {
      "client_uuid": "f2c81a3e-92b8-…",
      "tipo": "pesagem",
      "data": "2026-05-14",
      "capataz_id": 1,
      "retiro_id":  1,
      "bovino_id":  1,
      "observacao": "482kg"
    }
  ]
}
```
Resposta:
```json
{ "ok": true, "accepted": 1, "skipped": 0,
  "accepted_uuids": ["f2c81a3e-92b8-…"] }
```

Se enviar o **mesmo** `client_uuid` de novo, o servidor responde
`accepted: 0, skipped: 1` — esse é o contrato-chave testado em
`server.test.js`.

## Como funciona a idempotência
A tabela `evento_recebido` tem `client_uuid TEXT PRIMARY KEY`. A query é
`INSERT OR IGNORE` — quando o UUID já existe, o SQLite simplesmente
não insere e devolve `changes = 0`. A camada HTTP traduz isso para
`skipped++`. Sem locks, sem queries de existência prévia, sem janela
de race condition.

## Banco
Por padrão, `./brpec-server.db` na pasta. Para apagar e recomeçar:
```bash
rm brpec-server.db && npm start
```

Para inspecionar:
```bash
sqlite3 brpec-server.db "SELECT * FROM evento_recebido;"
```
