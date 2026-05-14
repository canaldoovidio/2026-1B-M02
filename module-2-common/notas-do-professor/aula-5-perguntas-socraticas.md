# Aula 5 — Perguntas socráticas (cola do professor)

> **Slides 17, 18 e 19 da aula 5 · 3 perguntas · ~2 min cada**
> Formato: pergunta projetada · alunos pensam 30 s · 2–3 voluntários respondem · você revela a resposta-âncora (botão no slide) e amarra com o artefato real (PWA + servidor).
> **Não é prova.** É diagnóstico do modelo mental — usado para calibrar o lab cooperativo.

---

## Pergunta 1 — UUID no cliente, não no servidor

> *"Por que o `client_uuid` é gerado no celular do capataz, e não no servidor Node quando ele recebe o evento?"*

**Âncora:** seções 10 e 11 do material da aula 5; código real em `assets/brpec-pwa/app.js` (função `makeUUID`).

### Resposta-âncora

Porque, no momento da coleta, o servidor pode estar **inacessível** — e o evento precisa de uma **identidade estável** mesmo assim. Três consequências práticas, cada uma resolvendo um problema diferente:

1. **Idempotência sem coordenação.** Com id estável gerado pelo cliente, reenviar o mesmo evento vira no-op natural no servidor (`INSERT OR IGNORE`). Sem id estável, o servidor não tem como reconhecer "isso já chegou" — daí surgem duplicatas que só dá pra deduplicar com lógica de aplicação cara e bugada.
2. **Auditoria local.** O capataz consegue rastrear "eu registrei o evento X" mesmo sem servidor confirmar. Ele pega o UUID no celular e, semanas depois, prova no SGBD da fazenda que aquele número é dele.
3. **Sync bidirecional futuro.** Quando o servidor mandar de volta um snapshot ("aqui está o que sei dos seus eventos"), o cliente reconhece pelos UUIDs e não cria duplicatas locais. Sem UUID no cliente, esse mecanismo não fecha — você precisaria de heurística de "esse parece ser meu" baseada em data + bovino + tipo, que é frágil.

### Exemplo BrPec aplicado

- **Cenário concreto:** o capataz pesa 12 bovinos no Cocho Novo numa quinta-feira sem WiFi; volta ao escritório na segunda; sincroniza; a rede cai no meio do POST; ele tenta de novo. **Sem UUID no cliente:** 24 pesagens no servidor. **Com UUID:** 12, exatamente como deveria ser.
- **Quem viveu isso na vida real:** todo sistema de coleta offline (Salesforce mobile, ODK Collect na saúde pública, Pokemon Go quando você captura sem sinal). Não é "design overkill" — é o que existe em produção há 20 anos.

### Possíveis confusões

- *"Mas o servidor poderia gerar um id quando recebesse a primeira vez."* → **Sim, mas você ainda precisa da chave de deduplicação que vem do cliente.** Senão, o segundo POST não tem como saber que é repetição.
- *"E se dois celulares gerarem o mesmo UUID?"* → **UUID v4 tem 122 bits aleatórios. A probabilidade de colisão é menor que ganhar a Mega-Sena 5 vezes seguidas.** Não é mais um problema desde 2005.
- *"Por que não usar timestamp como id?"* → **Timestamp não é único.** Dois capatazes pesando no mesmo segundo já colide. E timestamp do cliente nem sempre é confiável (relógio errado).

---

## Pergunta 2 — MVC e responsabilidades

> *"Por que o Model não deve conhecer `req` e `res`? E por que o Controller não deve escrever SQL?"*

**Âncora:** seções 3 (SWEBOK) e 4 (MVC no BrPec) do material; arquivos `models/evento.model.js` e `controllers/sync.controller.js` no servidor.

### Resposta-âncora

Porque cada camada tem **um motivo para mudar** — Single Responsibility Principle, base do *structural design* descrito no SWEBOK v4 Cap. 2. Misturar responsabilidades quebra o código quando a próxima mudança chega.

1. **Model conhecendo `req`/`res`.** Quando você decidir que parte do BrPec vai consumir via fila (RabbitMQ, Kafka, AWS SQS — comum para ingestão de eventos em escala), você precisa chamar a mesma lógica de validar+inserir sem ter um HTTP no meio. Se o Model tiver `req.body.deltas` espalhado por dentro, tudo quebra — você vai precisar reescrever o Model do zero. Modelo deve falar **SQL e regras de negócio**, e só.
2. **Controller escrevendo SQL.** Quando você decidir trocar SQLite por Postgres (porque o servidor central da fazenda padronizou) ou por MongoDB (porque é o que o time já mantém), você precisa achar todos os `db.prepare(...)` espalhados pelos controllers. Controller deve **orquestrar** — receber, validar, chamar Model, formatar resposta.
3. **O ganho prático:** dá pra testar Model sem subir HTTP (injetar `:memory:` e chamar `insertMany` direto). Dá pra testar Controller com Model mockado (forçar erro do banco e ver o JSON de resposta). Cada teste fica pequeno, rápido, sem ressonância em refactor.

### Exemplo BrPec aplicado

- **Cenário real:** aula 6 (Back-End II) vai adicionar 3 endpoints CRUD (GET listar, PUT editar, DELETE remover). Se respeitarmos MVC hoje, basta criar `evento.controller.js` (ou expandir o `sync.controller.js`) e adicionar novas funções no `evento.model.js` que retornam dados — reusando o `Database` que já existe. Se misturarmos hoje, na próxima aula vamos refatorar tudo antes de adicionar feature.
- **No próprio repo:** abra `assets/brpec-sync-server/server.js`. Se o arquivo tiver mais de 100 linhas e estiver fazendo SQL + validação + roteamento, é candidato número 1 a refactor MVC.

### Possíveis confusões

- *"Não é overengineering para uma aula de back-end inicial?"* → **Não.** MVC não é padrão de "projeto grande" — é o mínimo para o código durar 2 sprints. Um arquivo só é viável até ~150 linhas; depois disso vira espaguete em 100% dos casos.
- *"E onde fica a View no nosso servidor HTTP?"* → **A View é o JSON de resposta.** No frontend (PWA), tem View HTML. No backend HTTP, View = contrato de saída (o objeto que o cliente recebe). Não confundir com template engines (EJS, Pug etc.), que são uma forma de View.
- *"Posso ter o Model sem usar classes?"* → **Sim.** No nosso BrPec, o Model é só um módulo com funções exportadas (`insertMany`, `findRecent`). Não precisa ser uma classe — basta ser um arquivo com uma fronteira clara.

---

## Pergunta 3 — TDD bem feito · teste de porta, não de entranha

> *"Por que nosso teste de idempotência usa `supertest` + `POST` em vez de chamar `insertMany()` direto do Model?"*

**Âncora:** seção 13 (TDD) e 14 (TDD WDIAGW + SDD) do material; arquivo `server.test.js`. Vídeo de referência: Ian Cooper · "TDD, Where Did It All Go Wrong" · DevTernity.

### Resposta-âncora

Porque queremos testar **comportamento**, não **implementação**. Essa é a tese central de Ian Cooper em *"TDD, Where Did It All Go Wrong"* — e é o que separa um teste útil de um teste-zumbi.

1. **Sobrevivência a refactor.** Se amanhã quebrarmos `insertMany` em duas funções (`validate` + `insertOne`), o teste continua verde — porque ele só observa "POST com este body → resposta com `{accepted, skipped}`". A implementação interna pode mudar 100%, contanto que o contrato HTTP fique igual.
2. **Documentação do contrato real.** Quem lê o teste sabe exatamente o que o cliente HTTP vai ver — header, status, body. Não precisa adivinhar o caminho até o banco. **O teste virou a especificação executável da rota.**
3. **Pega bugs de integração.** Falha de CORS, middleware errado, parsing de JSON quebrado, content-type esquisito — tudo dentro do raio do teste. Um teste que ataca só `insertMany` *não* pegaria nenhum desses bugs reais.

A linha do Ian Cooper: **escreva testes contra portas (entradas do sistema), não contra entranhas (classes/funções internas).** Cada bug encontrado em produção vira 1 teste novo, mas só na borda. Refactor permanece barato.

### Exemplo BrPec aplicado

- **Cenário concreto:** depois da aula 10 (Testes & Automação), vamos quebrar o controller em `validate(deltas)` + `insertBatch(deltas)`. Se o teste atacasse o Model diretamente, teríamos que reescrever 5 testes. Como ataca a porta HTTP, **não precisamos tocar em teste nenhum.** Toda a equipe trabalha mais rápido.
- **Ponte para SDD (Spec-Driven Development):** Kiro, spec-kit e Tessl extrapolam essa ideia — em vez de "teste descreve o contrato", a *spec* descreve o contrato, e tanto código quanto teste são derivados dela. Quem domina TDD bem feito hoje (Cooper) já tem o mindset para SDD amanhã.

### Possíveis confusões

- *"Então testes unitários do Model são errados?"* → **Não.** Eles têm lugar quando o Model tem regra de negócio complexa que vale testar isoladamente (ex.: cálculo de juros). Para CRUD direto como o nosso, teste de porta cobre tudo com 5 linhas.
- *"E performance? Não é mais lento subir um app inteiro a cada teste?"* → **Quase imperceptível com `:memory:`.** O nosso suite roda em ~300 ms. Para suites maiores, fixtures + setup compartilhado resolvem.
- *"Spec-Driven Development vai matar TDD?"* → **Vai redefinir, não matar.** TDD sobrevive como modelo mental ("contrato antes de implementação"); SDD muda o artefato que captura esse contrato (de teste para spec executável). É evolução, não substituição.

---

## Como conduzir os 3 quizzes (instruções operacionais)

1. **Mostre o slide com a pergunta.** Não fale a resposta.
2. **30 segundos de silêncio absoluto.** O silêncio é o autoestudo subindo à consciência.
3. **Chame 2–3 voluntários.** Não corrija ainda — colete.
4. **Revele a resposta-âncora** (próximo clique no slide). Use 1 dos exemplos BrPec dessa folha.
5. **Amarre com o artefato real:** *"abrindo o `evento.model.js` agora no projetor — repare que isso aqui é exatamente o que estamos falando."*
6. **Não puna quem errou** — diagnostique. Erros consistentes apontam para reforço no lab.

### Sinais de alarme

- Se **mais da metade da turma** errar a Pergunta 1 (UUID no cliente): pause antes do lab e mostre o cenário "rede cai no meio do POST" passo a passo no projetor.
- Se **mais da metade da turma** errar a Pergunta 2 (MVC): faça um mini-tour pelos 3 arquivos do servidor (`models/`, `controllers/`, `server.js`) antes do lab. Sem essa intuição, o autoestudo da aula 6 quebra.
- Se quase ninguém errar a Pergunta 3 (TDD bem feito): bom sinal — a turma absorveu o conceito. Pode acelerar o demo e dar mais tempo ao lab.

---

## Bônus · perguntas-pivô para o lab cooperativo

Quando um grupo travar no lab, use estas perguntas-pivô:

| Sintoma | Pergunta-pivô |
|---|---|
| "O servidor não sobe" | *"Qual a saída do `npm install`? `better-sqlite3` requer compilação — node-gyp + Python instalados?"* |
| "O sync não funciona" | *"Abriu o DevTools → Network → procura o POST /sync/deltas. Que status ele retornou?"* |
| "Os dados somem no reload" | *"Você está vendo a chave 'brpec.db' no IndexedDB → kv? Se sim, ela tem tamanho > 0? O `persist()` está sendo chamado depois do INSERT?"* |
| "O segundo sync ainda aceita os mesmos eventos" | *"O `client_uuid` é o mesmo nos dois POSTs? Verifique no DevTools → Network → preview do payload."* |
| "Tem erro `crypto.randomUUID is not a function`" | *"Você está em HTTPS ou localhost? Se for IP de LAN, o fallback do `makeUUID()` precisa estar ativo. Releia `app.js`."* |
| "Não sei onde fica a regra de negócio" | *"Olhe no `models/evento.model.js`. Toda regra que tem SQL mora lá. Se vir SQL em `controllers/`, é bug."* |
| "Os 5 testes não passam todos" | *"Qual o nome do teste vermelho? Leia a mensagem do `assert.equal` — ela está descrevendo o contrato esperado vs o real."* |
