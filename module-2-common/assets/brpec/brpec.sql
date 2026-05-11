-- ============================================================================
-- BrPec Agropecuária · Dataset didático para Aula 4 (BD III · JOINs)
-- ----------------------------------------------------------------------------
-- Este arquivo é a fonte de verdade do banco-exemplo da turma 26.
-- Regerar com:    sqlite3 brpec.db < brpec.sql
-- Verificar:      sqlite3 brpec.db "SELECT COUNT(*) FROM evento_zootecnico;"
-- ----------------------------------------------------------------------------
-- Convenções:
--   · PK sintética (id INTEGER PRIMARY KEY AUTOINCREMENT)
--   · FK em snake_case (ex.: capataz_id)
--   · Datas em ISO-8601 (YYYY-MM-DD)
--   · Sexo restrito a 'M'|'F' via CHECK
--   · Cardinalidades: capataz N:N retiro (via capataz_retiro); evento N:1 com cada outra
-- ============================================================================

PRAGMA foreign_keys = ON;

-- limpa em caso de regerar sobre arquivo existente
DROP TABLE IF EXISTS evento_zootecnico;
DROP TABLE IF EXISTS bovino;
DROP TABLE IF EXISTS capataz_retiro;
DROP TABLE IF EXISTS retiro;
DROP TABLE IF EXISTS capataz;
DROP TABLE IF EXISTS gerente;

-- ─── schema ──────────────────────────────────────────────────────────────────

CREATE TABLE gerente (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL
);

CREATE TABLE capataz (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nome       TEXT NOT NULL,
  cpf        TEXT UNIQUE NOT NULL,
  gerente_id INTEGER REFERENCES gerente(id)
);

CREATE TABLE retiro (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  nome    TEXT NOT NULL UNIQUE,
  area_ha INTEGER NOT NULL
);

-- tabela de junção: capataz N:N retiro (um capataz pode atuar em vários retiros)
CREATE TABLE capataz_retiro (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  capataz_id INTEGER NOT NULL REFERENCES capataz(id),
  retiro_id  INTEGER NOT NULL REFERENCES retiro(id),
  ativo      INTEGER NOT NULL DEFAULT 1,
  UNIQUE(capataz_id, retiro_id)
);

CREATE TABLE bovino (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  brinco          TEXT UNIQUE NOT NULL,
  sexo            TEXT NOT NULL CHECK(sexo IN ('M','F')),
  nascimento      TEXT NOT NULL,
  mae_id          INTEGER REFERENCES bovino(id),
  retiro_atual_id INTEGER REFERENCES retiro(id)
);

CREATE TABLE evento_zootecnico (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo        TEXT NOT NULL CHECK(tipo IN ('nascimento','pesagem','vacinacao','mudanca_retiro','tratamento','abate')),
  data        TEXT NOT NULL,
  capataz_id  INTEGER NOT NULL REFERENCES capataz(id),
  retiro_id   INTEGER NOT NULL REFERENCES retiro(id),
  bovino_id   INTEGER NOT NULL REFERENCES bovino(id),
  observacao  TEXT
);

CREATE INDEX idx_evento_bovino ON evento_zootecnico(bovino_id);
CREATE INDEX idx_evento_data   ON evento_zootecnico(data);
CREATE INDEX idx_evento_tipo   ON evento_zootecnico(tipo);

-- ─── seed: gerentes ──────────────────────────────────────────────────────────
INSERT INTO gerente (id, nome) VALUES
  (1, 'Edson Marques'),
  (2, 'Lúcia Vidal');

-- ─── seed: capatazes ─────────────────────────────────────────────────────────
-- Vitor (id 6) entrou agora e ainda não tem gerente — usar em demos de LEFT JOIN.
INSERT INTO capataz (id, nome, cpf, gerente_id) VALUES
  (1, 'João Pereira',     '111.222.333-44', 1),
  (2, 'Antônio Souza',    '222.333.444-55', 1),
  (3, 'Pedro Almeida',    '333.444.555-66', 2),
  (4, 'Mateus Ferreira',  '444.555.666-77', 2),
  (5, 'Carlos Ribeiro',   '555.666.777-88', 1),
  (6, 'Vitor Gomes',      '666.777.888-99', NULL);

-- ─── seed: retiros ───────────────────────────────────────────────────────────
INSERT INTO retiro (id, nome, area_ha) VALUES
  (1, 'Cabeceira',         320),
  (2, 'Mata-Burro',        180),
  (3, 'Vargem do Sucuri',  450),
  (4, 'Faxinal',           210),
  (5, 'Cocho Novo',        280);

-- ─── seed: vínculos capataz × retiro ─────────────────────────────────────────
-- Vitor (id 6) propositalmente sem vínculos — fica fora de INNER JOINs com retiro.
INSERT INTO capataz_retiro (capataz_id, retiro_id, ativo) VALUES
  (1, 1, 1),   -- João em Cabeceira
  (1, 2, 1),   -- João em Mata-Burro
  (2, 2, 1),   -- Antônio em Mata-Burro
  (3, 3, 1),   -- Pedro em Vargem do Sucuri
  (3, 4, 1),   -- Pedro em Faxinal
  (4, 4, 1),   -- Mateus em Faxinal
  (4, 5, 1),   -- Mateus em Cocho Novo
  (5, 1, 1);   -- Carlos em Cabeceira

-- ─── seed: bovinos adultos (id 1-20) ─────────────────────────────────────────
-- Fêmeas (matrizes) — id 1..10
INSERT INTO bovino (id, brinco, sexo, nascimento, mae_id, retiro_atual_id) VALUES
  ( 1, 'BR0001', 'F', '2020-03-15', NULL, 1),
  ( 2, 'BR0002', 'F', '2019-08-22', NULL, 2),
  ( 3, 'BR0003', 'F', '2021-01-10', NULL, 3),
  ( 4, 'BR0004', 'F', '2018-11-05', NULL, 4),
  ( 5, 'BR0005', 'F', '2020-06-30', NULL, 5),
  ( 6, 'BR0006', 'F', '2022-04-18', NULL, 1),
  ( 7, 'BR0007', 'F', '2019-12-03', NULL, 2),
  ( 8, 'BR0008', 'F', '2021-07-14', NULL, 3),
  ( 9, 'BR0009', 'F', '2018-09-09', NULL, 4),
  (10, 'BR0010', 'F', '2020-10-25', NULL, 5);

-- Machos adultos — id 11..20
-- BR0011 e BR0019 estão sem retiro atual: vendidos/quarentena. Bom p/ LEFT JOIN.
INSERT INTO bovino (id, brinco, sexo, nascimento, mae_id, retiro_atual_id) VALUES
  (11, 'BR0011', 'M', '2019-02-14', NULL, NULL),
  (12, 'BR0012', 'M', '2018-05-20', NULL, 2),
  (13, 'BR0013', 'M', '2021-08-12', NULL, 3),
  (14, 'BR0014', 'M', '2020-11-27', NULL, 4),
  (15, 'BR0015', 'M', '2019-06-18', NULL, 5),
  (16, 'BR0016', 'M', '2022-01-29', NULL, 1),
  (17, 'BR0017', 'M', '2020-07-04', NULL, 2),
  (18, 'BR0018', 'M', '2021-04-22', NULL, 3),
  (19, 'BR0019', 'M', '2018-12-11', NULL, NULL),
  (20, 'BR0020', 'M', '2020-02-08', NULL, 5);

-- ─── seed: bezerros (filhos das matrizes) — id 21-30 ────────────────────────
INSERT INTO bovino (id, brinco, sexo, nascimento, mae_id, retiro_atual_id) VALUES
  (21, 'BR0021', 'F', '2025-04-10',  1, 1),
  (22, 'BR0022', 'M', '2025-06-22',  2, 2),
  (23, 'BR0023', 'F', '2025-08-15',  3, 3),
  (24, 'BR0024', 'M', '2025-11-02',  4, 4),
  (25, 'BR0025', 'F', '2026-01-18',  5, 5),
  (26, 'BR0026', 'M', '2026-02-25',  6, 1),
  (27, 'BR0027', 'F', '2026-03-09',  7, 2),
  (28, 'BR0028', 'M', '2025-12-30',  8, 3),
  (29, 'BR0029', 'F', '2026-04-14',  9, 4),
  (30, 'BR0030', 'M', '2025-09-20', 10, 5);

-- ─── seed: eventos zootécnicos (60 linhas) ───────────────────────────────────
-- Mapa intencional:
--   · BR0012, BR0015, BR0020 não recebem nenhum evento → LEFT JOIN demo
--   · Vitor (capataz 6) não registra nenhum evento     → LEFT JOIN demo
--   · BR0011 vai para retiro 5 num evento de mudanca_retiro
--   · Massa cobre 2025–2026 com sazonalidade

-- nascimentos dos bezerros 21–30 (10 eventos)
INSERT INTO evento_zootecnico (tipo, data, capataz_id, retiro_id, bovino_id, observacao) VALUES
  ('nascimento', '2025-04-10', 1, 1, 21, 'parto sem assistência'),
  ('nascimento', '2025-06-22', 2, 2, 22, 'mãe BR0002 amamentando'),
  ('nascimento', '2025-08-15', 3, 3, 23, 'bezerra saudável 32kg'),
  ('nascimento', '2025-11-02', 3, 4, 24, 'parto difícil, veterinário acionado'),
  ('nascimento', '2026-01-18', 4, 5, 25, NULL),
  ('nascimento', '2026-02-25', 5, 1, 26, 'bezerro grande, 38kg'),
  ('nascimento', '2026-03-09', 1, 2, 27, NULL),
  ('nascimento', '2025-12-30', 3, 3, 28, 'véspera de Ano-Novo'),
  ('nascimento', '2026-04-14', 4, 4, 29, NULL),
  ('nascimento', '2025-09-20', 4, 5, 30, 'bezerro de inverno');

-- pesagens variadas (22 eventos)
INSERT INTO evento_zootecnico (tipo, data, capataz_id, retiro_id, bovino_id, observacao) VALUES
  ('pesagem', '2025-05-12', 1, 1,  1, '482kg'),
  ('pesagem', '2025-05-14', 1, 2,  2, '465kg'),
  ('pesagem', '2025-05-19', 3, 3,  3, '470kg'),
  ('pesagem', '2025-05-20', 3, 4,  4, '498kg'),
  ('pesagem', '2025-05-22', 4, 5,  5, '475kg'),
  ('pesagem', '2025-06-09', 5, 1,  6, '450kg'),
  ('pesagem', '2025-06-11', 2, 2,  7, '462kg'),
  ('pesagem', '2025-06-13', 3, 3,  8, '458kg'),
  ('pesagem', '2025-08-04', 1, 1,  1, '495kg (+13kg)'),
  ('pesagem', '2025-08-04', 1, 1, 16, '540kg'),
  ('pesagem', '2025-08-06', 2, 2, 17, '525kg'),
  ('pesagem', '2025-08-11', 3, 3, 13, '510kg'),
  ('pesagem', '2025-08-11', 3, 3, 18, '522kg'),
  ('pesagem', '2025-10-15', 4, 4, 14, '548kg'),
  ('pesagem', '2025-10-21', 5, 1,  6, '462kg (+12kg)'),
  ('pesagem', '2025-11-08', 1, 2, 22, '85kg (bezerro 5m)'),
  ('pesagem', '2026-01-12', 1, 1, 21, '110kg'),
  ('pesagem', '2026-02-03', 3, 3, 23, '95kg'),
  ('pesagem', '2026-02-20', 4, 4, 24, '88kg'),
  ('pesagem', '2026-03-05', 1, 1,  1, '502kg'),
  ('pesagem', '2026-04-02', 5, 1, 26, '54kg'),
  ('pesagem', '2026-04-10', 3, 3,  8, '470kg');

-- vacinações (campanha de febre aftosa) (12 eventos)
INSERT INTO evento_zootecnico (tipo, data, capataz_id, retiro_id, bovino_id, observacao) VALUES
  ('vacinacao', '2025-11-15', 1, 1,  1, 'aftosa lote 7821'),
  ('vacinacao', '2025-11-15', 1, 1,  6, 'aftosa lote 7821'),
  ('vacinacao', '2025-11-15', 1, 1, 16, 'aftosa lote 7821'),
  ('vacinacao', '2025-11-15', 5, 1, 21, 'aftosa lote 7821'),
  ('vacinacao', '2025-11-18', 2, 2,  2, 'aftosa lote 7822'),
  ('vacinacao', '2025-11-18', 2, 2,  7, 'aftosa lote 7822'),
  ('vacinacao', '2025-11-18', 1, 2, 17, 'aftosa lote 7822'),
  ('vacinacao', '2025-11-22', 3, 3,  3, 'aftosa lote 7823'),
  ('vacinacao', '2025-11-22', 3, 3,  8, 'aftosa lote 7823'),
  ('vacinacao', '2025-11-22', 3, 3, 13, 'aftosa lote 7823'),
  ('vacinacao', '2025-11-25', 3, 4,  4, 'aftosa lote 7824'),
  ('vacinacao', '2025-11-25', 4, 4, 14, 'aftosa lote 7824');

-- tratamentos pontuais (6 eventos)
INSERT INTO evento_zootecnico (tipo, data, capataz_id, retiro_id, bovino_id, observacao) VALUES
  ('tratamento', '2025-07-08', 1, 1,  1, 'mastite — antibiótico 5d'),
  ('tratamento', '2025-09-14', 3, 3,  3, 'corte casco posterior'),
  ('tratamento', '2025-10-30', 4, 4,  4, 'verminose — vermífugo'),
  ('tratamento', '2026-01-05', 1, 1, 16, 'olho irritado — colírio'),
  ('tratamento', '2026-02-19', 2, 2,  7, 'mastite — antibiótico 7d'),
  ('tratamento', '2026-03-22', 3, 3, 28, 'umbigo inflamado bezerro');

-- mudanças de retiro (5 eventos) — atualizam retiro_atual_id na lógica de negócio
INSERT INTO evento_zootecnico (tipo, data, capataz_id, retiro_id, bovino_id, observacao) VALUES
  ('mudanca_retiro', '2025-09-03', 1, 1, 16, 'transferido de Mata-Burro p/ Cabeceira'),
  ('mudanca_retiro', '2025-10-12', 3, 3, 18, 'redistribuição pós-aftosa'),
  ('mudanca_retiro', '2026-01-28', 4, 4, 14, 'rotação de pasto Faxinal'),
  ('mudanca_retiro', '2026-02-15', 3, 3,  8, 'agrupamento de matrizes'),
  ('mudanca_retiro', '2026-03-30', 5, 1,  6, 'lote de venda separado');

-- abates (5 eventos) — bovinos que saem do plantel
INSERT INTO evento_zootecnico (tipo, data, capataz_id, retiro_id, bovino_id, observacao) VALUES
  ('abate', '2025-08-29', 1, 1,  6, 'lote frigorífico Mineração'),
  ('abate', '2025-12-18', 3, 4,  4, 'descarte por idade'),
  ('abate', '2026-01-26', 2, 2,  7, 'lote frigorífico Pampa'),
  ('abate', '2026-04-19', 3, 3, 13, 'macho de descarte 510kg'),
  ('abate', '2026-04-22', 4, 5,  5, 'lote frigorífico Mineração');

-- ============================================================================
-- Conferência rápida (executar para validar contagens)
-- ----------------------------------------------------------------------------
-- SELECT 'gerente' tabela, COUNT(*) total FROM gerente
-- UNION ALL SELECT 'capataz',         COUNT(*) FROM capataz
-- UNION ALL SELECT 'retiro',          COUNT(*) FROM retiro
-- UNION ALL SELECT 'capataz_retiro',  COUNT(*) FROM capataz_retiro
-- UNION ALL SELECT 'bovino',          COUNT(*) FROM bovino
-- UNION ALL SELECT 'evento',          COUNT(*) FROM evento_zootecnico;
-- ----------------------------------------------------------------------------
-- Esperado:  gerente=2, capataz=6, retiro=5, capataz_retiro=8,
--            bovino=30, evento=60
-- ============================================================================
