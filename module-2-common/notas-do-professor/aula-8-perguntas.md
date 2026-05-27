# Aula 8 — Perguntas de discussão (cola do professor)

> **Slides de discussão da aula 8 · 3 perguntas · ~2 min cada**
> Formato: pergunta projetada · alunos pensam 30 s · 2–3 voluntários respondem · você revela a resposta-âncora e amarra com o artefato real (Network tab / teste no projetor).
> **Não é prova.** É diagnóstico do modelo mental — usado para calibrar o lab antes da Ponderada III.

---

## Pergunta 1 — Event loop: como o JavaScript faz I/O sem congelar a tela de pesagem?

> *"JavaScript é single-threaded. Então como ele faz I/O (rede, timer) sem congelar a tela de pesagem do capataz?"*

**Âncora:** conceito de event loop e modelo de concorrência do JavaScript; SWEBOK v4 Cap. 2 (async design e non-blocking I/O).

### Resposta-âncora

O JavaScript tem **uma única call stack** — mas o ambiente (browser ou Node.js) oferece APIs externas (fetch, setTimeout, IndexedDB) que rodam fora dessa stack. O mecanismo que coordena tudo chama-se **event loop**.

1. **Call stack e o que a bloqueia.** Enquanto código síncrono está na stack, nada mais roda. Se você fizesse uma requisição HTTP com `while (true) { aguarda... }`, a tela travaria de verdade — o usuário não conseguiria nem digitar o peso.
2. **Web APIs e task queue.** Quando você chama `fetch()`, o browser delega o trabalho de rede para a Web API (fora da thread JS). Quando a resposta chega, um *callback* (ou a resolução da Promise) é colocado na fila.
3. **Microtasks antes de macrotasks.** O event loop drena as *microtasks* (Promises resolvidas via `.then` / `await`) antes de cada *macrotask* (setTimeout, eventos de UI). Isso garante que `await fetch(...)` processe a resposta antes de qualquer timer pendente — comportamento previsível e sem condição de corrida.
4. **`async/await` não é multithread.** É açúcar sintático sobre Promises, que por sua vez são wrappers sobre callbacks. A thread continua sendo uma só. O que muda é que a stack fica livre enquanto o I/O acontece fora dela.

Liga a **SWEBOK v4 Cap. 2**: o padrão *non-blocking I/O* é um dos pilares de design de sistemas assíncronos — desacopla "quem pediu" de "quem responde", sem paralelismo real de threads.

### Exemplo BrPec aplicado

- **Cenário concreto:** o capataz abre a tela de pesagem em campo, digita o peso do boi enquanto o app tenta sincronizar pesagens antigas em background via `fetch('/sync/deltas', ...)`. O `await fetch(...)` libera a call stack imediatamente: o campo de peso continua responsivo, o teclado numérico aparece na hora. Quando a resposta do servidor chega — seja em 200 ms ou em 3 s — o event loop retoma o callback, atualiza o ícone de "sincronizado" e segue.
- **Sem event loop (hipotético síncrono):** a tela travaria por segundos cada vez que o capataz batesse sinal de WiFi fraco. Impraticável no campo.

### Possíveis confusões

- *"async/await usa threads por baixo?"* → **Não.** A thread JS é uma só. `await` suspende a execução da função e devolve o controle ao event loop — não cria uma thread nova.
- *"Então nunca trava?"* → **Pode travar sim**, se o código síncrono na call stack for pesado (ex.: JSON.parse de um arquivo de 50 MB no main thread). O event loop só ajuda se você realmente delegar o I/O para as Web APIs.
- *"Microtask e macrotask — isso importa na prática?"* → **Importa quando há timers e Promises misturados.** Se o aluno colocar um `setTimeout(0)` esperando que ele rode antes de um `.then()`, vai se surpreender — o `.then()` sempre vai primeiro.

---

## Pergunta 2 — Por que `fetch()` não rejeita em 404 ou 500?

> *"Por que `fetch()` NÃO rejeita a Promise em um 404 ou 500? Onde mora o bug clássico que faz o front achar que o POST de pesagem deu certo quando na verdade falhou?"*

**Âncora:** especificação do Fetch API; distinção entre falha de rede e resposta HTTP com status de erro; propriedades `res.ok` e `res.status`.

### Resposta-âncora

`fetch()` só rejeita a Promise (cai no `catch`) quando há **falha na camada de rede** — o dispositivo está offline, o DNS não resolve, ocorre erro de CORS ou a conexão é abortada antes de qualquer byte de resposta chegar. Um 404 ou 500 **é uma resposta HTTP válida do ponto de vista da rede**: o servidor recebeu o pedido, processou e devolveu um status. Para o `fetch`, "funcionou" — o servidor respondeu.

1. **`res.ok` é o guardião.** `res.ok` é `true` somente quando `res.status` está entre 200 e 299. Para qualquer 4xx ou 5xx, `res.ok` é `false` — e você precisa verificar isso explicitamente antes de tratar a resposta como sucesso.
2. **O bug clássico.** O desenvolvedor escreve `const data = await res.json()` direto, sem checar `res.ok`. O servidor retorna 500 com `{"error":"banco fora do ar"}` e o front interpreta aquele JSON como se fosse dado válido — ou simplesmente não mostra erro nenhum ao usuário.
3. **Padrão correto.**
   ```js
   const res = await fetch('/pesagens', { method: 'POST', body: JSON.stringify(payload) });
   if (!res.ok) throw new Error(`HTTP ${res.status}`);
   const data = await res.json();
   ```
4. **Motivo do design.** A separação é intencional: `fetch` garante que você sempre recebe a resposta se a rede funcionou; o que fazer com códigos de erro HTTP é decisão da aplicação, não da API de rede.

### Exemplo BrPec aplicado

- **Cenário concreto:** o capataz sincroniza 20 pesagens. O endpoint `POST /pesagens` no servidor Node está com o banco SQLite bloqueado (outro processo aberto) e retorna HTTP 500. O fetch resolve normalmente — a Promise não rejeita. Se o front não checar `res.ok`, exibe "Sincronizado com sucesso ✓" e nenhuma das 20 pesagens foi gravada no banco. O gerente vai ao relatório no dia seguinte e não encontra os dados.
- **Onde no código BrPec:** toda chamada `fetch` em `assets/brpec-pwa/app.js` deve ter `if (!res.ok)` logo após o `await fetch(...)`. Se não tiver, é candidata a bug silencioso.

### Possíveis confusões

- *"Então o `try/catch` não pega 500?"* → **Correto — não pega automaticamente.** O `catch` só é acionado se você fizer `throw` manual após checar `res.ok`, ou se a rede cair de fato.
- *"E o 401 (não autorizado)?"* → **Mesma regra.** `res.ok` é `false`, mas a Promise não rejeita. Cabe ao front detectar `res.status === 401` e redirecionar para login.
- *"Por que não fizeram o fetch rejeitar em qualquer erro HTTP? Seria mais fácil."* → **Porque "erro" depende do contexto.** Uma API REST pode retornar 404 como resposta esperada ("recurso não existe ainda") — não é necessariamente uma falha. Deixar a decisão para a aplicação é mais flexível.

---

## Pergunta 3 — Por que a RTM "prova" o sistema e não é só burocracia?

> *"Por que uma matriz de rastreabilidade (RTM) é a prova de que o sistema cumpre o prometido — e não só um documento que alguém preenche para cumprir tabela?"*

**Âncora:** conceito de rastreabilidade em engenharia de requisitos (SWEBOK v4 Cap. 1); as 4 entregas mínimas da Ponderada III (≥3 personas / 5 RFs, 8 eixos de RNF, histórico de mudanças de contrato, índice de evidências com testes/screenshots).

### Resposta-âncora

A RTM é uma cadeia de elos verificáveis: **persona → necessidade → regra de negócio → requisito funcional → evidência (teste ou screenshot)**. Cada elo é uma afirmação que pode ser confirmada ou refutada. O documento não vale pelo preenchimento — vale pela **capacidade de refutação**: se alguém contestar "o sistema não faz X para o capataz", você aponta a linha da RTM, abre o teste, mostra o screenshot.

1. **Célula vazia = promessa sem prova.** Se a coluna "evidência" está em branco para um RF, o sistema pode ou não fazer aquilo — você não sabe. É o equivalente a dizer "eu acho que funciona" sem rodar nenhum teste. Em contexto de entrega para o parceiro BrPec, "acho que funciona" não fecha contrato.
2. **A rastreabilidade revela lacunas de requisito, não só de código.** Ao construir a RTM de trás para frente (evidência → RF → RN → persona), frequentemente se descobre que um RF não tem persona associada (feature órfã — por que está no sistema?), ou que uma persona tem necessidade sem nenhum RF correspondente (gap de escopo — o que o parceiro vai reclamar na entrega).
3. **Mudanças de contrato precisam de rastreabilidade dupla.** Quando o parceiro pede uma mudança mid-sprint ("o veterinário também precisa registrar pesagem"), a RTM mostra quais RFs novos entram, quais existentes são afetados e qual evidência nova é necessária. Sem RTM, a mudança "some" na memória da equipe e na entrega final falta exatamente esse pedaço.
4. **As 4 entregas mínimas da Ponderada III são elos da mesma cadeia.** Personas e RFs definem o escopo; RNFs em 8 eixos definem qualidade; histórico de mudanças documenta evoluções do contrato; índice de evidências fecha o ciclo com prova. Entregar só 3 das 4 deixa a cadeia aberta — alguém pode sempre perguntar "mas isso foi testado?" e você não tem resposta.

### Exemplo BrPec aplicado

- **Cenário concreto:** o gerente da BrPec questiona na reunião de entrega: "o sistema realmente suporta o veterinário registrando laudos offline?" A equipe abre a RTM, localiza RF-07 (veterinário registra laudo offline), aponta para o teste `vet-laudo-offline.test.js` e o screenshot do IndexedDB com o laudo salvo sem conexão. A conversa dura 30 segundos. Sem RTM, a equipe busca por 10 minutos no código, não acha, e a reunião vira auditoria.
- **Mini-RTM ao vivo (usar se a turma travar):** 1 RF de exemplo — "capataz registra pesagem offline" → RN: "sistema armazena localmente se sem conexão" → evidência: abrir DevTools → Application → IndexedDB e mostrar a entrada gravada. Tempo: 3 minutos. Isso é tudo que uma linha de RTM representa.

### Possíveis confusões

- *"Documentar não é perda de tempo quando a deadline aperta?"* → **É exatamente aí que a RTM economiza tempo.** Sem rastreabilidade, cada bug vira uma caça ao tesouro (qual persona afeta? qual RN viola?). Com RTM, você vai direto ao elo afetado.
- *"Posso fazer a RTM depois do código?"* → **Tecnicamente sim, mas o valor cai.** Feita depois, a RTM descreve o que foi construído — não o que foi prometido. A diferença aparece quando o que foi construído não é o que o parceiro esperava.
- *"Screenshots são evidência suficiente?"* → **São evidência válida, não suficiente sozinhas.** Screenshot prova que funcionou uma vez. Teste automatizado prova que continua funcionando após cada mudança. A combinação dos dois é o ideal; para a Ponderada III, qualquer evidência auditável (teste ou screenshot com data) já fecha o elo.

---

## Como conduzir as 3 perguntas-guia (instruções operacionais)

1. **Mostre o slide com a pergunta.** Não antecipe a resposta — nem com entonação.
2. **30 segundos de silêncio absoluto.** Resistir ao impulso de ajudar: o silêncio é o momento em que o modelo mental sobe à superfície.
3. **Chame 2–3 voluntários.** Colete sem corrigir ainda — anote mentalmente o que está certo e o que está errado.
4. **Revele a resposta-âncora** (próximo clique no slide). Use o exemplo BrPec correspondente desta folha.
5. **Amarre com o artefato real:**
   - Pergunta 1 → abra o DevTools → aba **Performance** ou **Console** e mostre o event loop em ação com um `fetch` real.
   - Pergunta 2 → abra o DevTools → aba **Network**, filtre por XHR/Fetch, mostre um POST e o campo `Status`. Troque para um endpoint inexistente e mostre que o `catch` não dispara sem o `if (!res.ok)`.
   - Pergunta 3 → abra o arquivo de RTM do próprio grupo (ou o template da Ponderada III) no projetor e percorra uma linha inteira: persona → RF → evidência.
6. **Não puna quem errou.** Use o erro como diagnóstico: erros consistentes indicam onde o lab precisa de reforço antes de soltar a atividade.

---

## Sinais de alarme

- **Se mais da metade da turma errar a Pergunta 1 (event loop):** pause antes do lab e faça uma demo ao vivo de 3 minutos: abra o Console, digite um `fetch` simples, mostre com `console.log` antes e depois do `await` que a execução "pula" e volta — tornando visível o que o event loop faz. Sem essa intuição, a depuração de bugs assíncronos no lab vai ser caótica.

- **Se mais da metade da turma errar a Pergunta 2 (fetch + res.ok):** antes do lab, abra o DevTools e induza um erro proposital: chame `fetch('/rota-inexistente')` sem `if (!res.ok)` e mostre que nenhum erro aparece no Console. Depois adicione o guard e mostre o `throw`. Este bug é o mais frequente nas Ponderadas — um demo de 2 minutos agora evita 30 minutos de debugging coletivo depois.

- **Se a turma travar na Pergunta 3 (RTM):** não solte a Ponderada III ainda. Faça um **mini-RTM ao vivo de 1 RF** antes: escolha "capataz registra pesagem" como exemplo, preencha as colunas no projetor (persona → necessidade → RN → RF → evidência), abra o IndexedDB no DevTools e mostre o dado gravado como evidência. Isso leva 3–4 minutos e elimina o principal bloqueio ("não sei o que colocar na coluna de evidência"). Só então libere a atividade.

- **Se quase ninguém errar as 3 perguntas:** ótimo sinal — avance direto para o lab, dando mais tempo à Ponderada III. Considere propor a pergunta-bônus: "como você rastrearia uma mudança de contrato que o parceiro pediu na sexta à tarde para entregar na segunda?"
