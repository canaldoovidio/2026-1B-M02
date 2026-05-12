# Aula 5 — Perguntas socráticas (cola do professor)

> **Slides 15, 16 e 17 da aula 5 · 3 perguntas · ~2 min cada**
> Formato: pergunta projetada · alunos pensam 30 s · 2–3 voluntários respondem · você revela a resposta-âncora e amarra com o artefato (PWA real ou servidor).
> **Não é prova.** É diagnóstico do modelo mental antes da ponderada.

---

## Pergunta 1 — UUID no cliente, não no servidor

> *"Por que o `client_uuid` é gerado no celular do capataz, e não no servidor quando ele recebe o evento?"*

**Âncora:** seções 9 e 11 do material da aula 5; código real em `assets/brpec-pwa/app.js` (função `makeUUID`).

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

## Pergunta 2 — Offline-first vs offline-only

> *"A PWA do BrPec é 'offline-first' ou 'offline-only'? Qual a diferença, e por que escolhemos a primeira?"*

**Âncora:** introdução do material da aula 5 + diagrama de arquitetura (slide 10).

### Resposta-âncora

São coisas **diferentes**, com escolha de produto por trás.

- **Offline-only** = o app *não* conhece servidor. Tudo mora no celular, para sempre. Bom para to-do lists pessoais, diários, calculadoras. Péssimo para um ecossistema com 1 coordenador + N capatazes que precisam compartilhar dados.
- **Offline-first** = o app *funciona* offline (todas as operações principais), mas *sabe* sincronizar quando online. O caminho online é uma **evolução**, não uma regressão.

Escolhemos offline-first no BrPec por três razões:

1. **Realidade do retiro.** WiFi raro ou nulo. Não dá pra perder coleta esperando sinal — é dado zootécnico que se perde para sempre se não for capturado na hora.
2. **Necessidade do coordenador.** O dashboard de aftosa, o relatório de pesagens, a auditoria de movimentação — tudo depende de **N celulares convergindo para 1 SGBD**. Sem servidor, não tem dashboard.
3. **Auditoria.** O SGBD da fazenda é a fonte da verdade. Cada celular é uma cópia parcial e temporária. Sem essa hierarquia, não tem fechamento contábil, não tem prestação de conta sanitária, não tem rastreabilidade.

### Exemplo BrPec aplicado

- **Offline-only seria:** "cada capataz tem suas pesagens no celular dele, e ponto." Funciona até alguém pedir o relatório consolidado da fazenda — aí não tem.
- **Offline-first é:** "cada capataz tem suas pesagens, mas elas *vão* para o SGBD quando der." Quando o coordenador puxa o dashboard, ele vê tudo (dos celulares que já sincronizaram).

### A virada conceitual que importa

Em offline-first, "estar online" é uma **otimização** (sincronizar agora em vez de daqui a uma hora). Em offline-only, "estar online" é uma **limitação** (você nem pensa em servidor). **Mude o framing e o produto muda.** Esse é o salto da aula 5.

### Possíveis confusões

- *"Então PWA é sempre offline-first?"* → **Não.** PWA é tecnologia (manifest + SW + HTTPS). Você pode fazer PWA online-only que só cacheia a shell e exige rede pra tudo (ex.: Twitter Lite tinha aspectos disso). Offline-first é decisão de produto sobre como usar a tecnologia.

---

## Pergunta 3 — Por que SW vive separado da página

> *"Por que o service worker vive em um arquivo separado da página (`sw.js`) e roda em uma thread diferente?"*

**Âncora:** seção 4 do material (Service Worker · ciclo de vida) + experimentação com DevTools → Application → Service Workers.

### Resposta-âncora

Três razões — cada uma resolveria um problema sozinha, mas as três juntas **definem** o que SW é:

1. **Ciclo de vida independente.** O SW continua existindo *depois* que a aba fecha. Ele pode receber push notification, sincronizar em background, lidar com fetch de outras abas. Se estivesse acoplado à página, tudo morreria com ela — e você perderia 90% da utilidade.
2. **Interceptação de requisições.** O browser precisa de uma camada *entre* a página e a rede. O SW é essa camada. Se ele vivesse na página, intermediar a si mesmo geraria recursão infinita. Separação é arquitetural, não estilística.
3. **Thread separada (não bloqueia a UI).** Operações de cache, IndexedDB, criptografia podem ser pesadas. Numa thread isolada, a UI segue fluida mesmo com SW trabalhando. É como ter um web worker, mas com superpoderes de rede.

### Consequência prática (e contraintuitiva)

Você atualiza a página, mas o **SW antigo continua servindo o cache antigo** até `skipWaiting() + clients.claim()`. É por isso que mudanças em PWA às vezes "demoram a aparecer" — é o SW antigo ainda no comando, e ele só dá lugar ao novo na próxima visita "limpa".

No BrPec, isso é gerenciado pelo nome do cache: `brpec-pwa-v1` → `brpec-pwa-v2`. Quando você muda o número, o SW novo entra em estado "waiting"; quando você dispara `skipWaiting` no `install`, ele assume na hora.

### Exemplo BrPec aplicado

- **Cenário:** capataz registrou evento offline. Fechou o app. Andou 200m até a sede, onde tem WiFi. **Sem SW separado:** o app só sincronizaria quando ele reabrisse. **Com SW e Background Sync API (futuro próximo):** o SW detecta que voltou conectividade e sincroniza sozinho — o capataz nem precisa abrir o app.

### Possíveis confusões

- *"Se SW é tão poderoso, posso colocar tudo nele?"* → **Não.** SW não acessa DOM, não acessa `localStorage`, não acessa `window`. É um runtime restrito de propósito — para forçar bons hábitos de design.
- *"Como faço o SW pegar nova versão imediatamente?"* → **`self.skipWaiting()` no `install` + `clients.claim()` no `activate`.** Isso é o que a PWA do BrPec faz — ver `sw.js`, linhas 26 e 36.

---

## Como conduzir os 3 quizzes (instruções operacionais)

1. **Mostre o slide com a pergunta.** Não fale a resposta.
2. **30 segundos de silêncio absoluto.** O silêncio é o autoestudo subindo à consciência.
3. **Chame 2–3 voluntários.** Não corrija ainda — colete.
4. **Revele a resposta-âncora** (próximo clique no slide). Use 1 dos exemplos BrPec dessa folha.
5. **Amarre com o artefato real:** *"abrindo a PWA agora no projetor — repare que isso aqui no `app.js` é exatamente o que estamos falando."*
6. **Não puna quem errou** — diagnostique. Erros consistentes apontam para reforço no lab.

### Sinais de alarme

- Se **mais da metade da turma** errar a Pergunta 1 (UUID no cliente): pause o lab por 5 min e mostre o cenário "rede cai no meio do POST" passo a passo no projetor. A ponderada depende dessa intuição firme.
- Se quase ninguém errar a Pergunta 3 (SW separado): bom sinal — a turma absorveu o conceito do material. Pode acelerar o demo.

---

## Bônus · perguntas-pivô para o lab e ponderada

Quando um grupo travar no lab, use estas perguntas-pivô:

| Sintoma | Pergunta-pivô |
|---|---|
| "O sync não funciona" | *"Você abriu o DevTools → Network → procura o POST /sync/deltas. Que status ele retornou?"* |
| "O Lighthouse PWA score está baixo" | *"Abra a aba Application no DevTools. Manifest está válido? Service Worker está activated? Esses são 2 dos 3 critérios principais."* |
| "Os dados somem no reload" | *"Você está vendo a chave 'brpec.db' no IndexedDB → kv? Se sim, ela tem tamanho > 0? O `persist()` está sendo chamado depois do INSERT?"* |
| "O segundo sync ainda aceita os mesmos eventos" | *"O `client_uuid` é o mesmo nos dois POSTs? Verifique no DevTools → Network → preview do payload."* |
| "Tem erro `crypto.randomUUID is not a function`" | *"Você está em HTTPS ou localhost? Se for IP de LAN, o fallback do `makeUUID()` precisa estar ativo. Releia `app.js`."* |
