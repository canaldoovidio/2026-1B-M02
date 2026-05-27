# Aula 7 — Perguntas de discussão (cola do professor)

> **Front-End I — HTML, DOM e JavaScript com SSR + EJS · 3 perguntas · ~2 min cada**
> Formato: pergunta projetada · alunos pensam 30 s · 2–3 voluntários respondem · você revela a resposta-âncora e amarra com o artefato real (template EJS + servidor Express).
> **Não é prova.** É diagnóstico do modelo mental — usado para calibrar o lab cooperativo.

---

## Pergunta 1 — SSR vs CSR para o BrPec

> *"Por que renderizar a página no servidor (SSR com EJS) em vez de mandar tudo pro cliente montar (CSR)?"*

**Âncora:** slides de SSR vs CSR da aula 7; template `views/pesagem.ejs` e rota `GET /pesagens` no servidor Express.

### Resposta-âncora

Porque o gargalo do capataz não é o computador dele — é a **rede instável no campo** e o **celular de entrada** que ele carrega. SSR resolve os dois problemas ao mesmo tempo:

1. **Primeira pintura rápida (First Contentful Paint).** Com SSR, o servidor manda HTML já preenchido com os dados. O browser só precisa renderizar. Com CSR, o browser recebe um HTML vazio, baixa o bundle JS, executa, faz um segundo request de dados, aí pinta. No 4G instável do pasto, esse segundo round-trip pode durar 8–10 s — ou simplesmente falhar.
2. **Menos JS no celular do capataz.** CSR transfere a lógica de montagem de tela para o cliente. Em um celular de R$ 400 com CPU de 2018, esse JS custa tempo de processamento real — bateria, aquecimento, lentidão visível. Com SSR, o celular só interpreta HTML e CSS, que é o que browser faz de graça desde 1995.
3. **Conteúdo já pronto — sem flash de conteúdo vazio.** Páginas CSR costumam piscar (loading spinners, skeleton screens) porque o HTML inicial não tem dados. Uma tela de pesagem que aparece com os dados já preenchidos é menos cognitiva para quem opera ao sol, com luva, sem óculos.
4. **SEO e acessibilidade de brinde.** Robôs e leitores de tela recebem HTML completo. Para o BrPec, isso importa menos que performance, mas é consequência zero-custo.

### Exemplo BrPec aplicado

- **Cenário concreto:** o gerente abre o relatório semanal de pesagens no tablet da fazenda via 3G. Com SSR, a tabela já chega montada no primeiro response — ele vê os dados em ~1,5 s. Com CSR, ele esperaria o bundle React/Vue (200+ KB), a execução do JS e depois o fetch dos dados. Em 3G com 500 ms de latência, isso facilmente passa de 6 s — e às vezes trava no meio.
- **Analogia útil:** SSR é como pedir uma pizza e receber ela pronta. CSR é receber a massa crua, o molho, o queijo e assar no celular. O resultado final pode ser igual, mas o esforço e o tempo são completamente diferentes.

### Possíveis confusões

- *"Então SPA (React, Vue, Angular) é errado?"* → **Não — depende do contexto.** SPA brilha quando a UX precisa ser altamente interativa (editor colaborativo, dashboard em tempo real com WebSocket). No BrPec, o gargalo é rede e dispositivo, não interatividade. Contexto determina a arquitetura, não modismo.
- *"Mas com SSR o servidor trabalha mais."* → **Sim, e tudo bem.** O servidor é fixo e tem CPU decente. O celular do capataz não. Deslocar processamento do dispositivo fraco para o servidor robusto é uma otimização clássica de sistemas distribuídos.
- *"Dá pra ter os dois — SSR inicial e depois CSR?"* → **Sim, é o que Next.js chama de hydration.** Para o escopo desta aula, SSR puro com EJS já resolve. Hydration aparece quando você precisar de interatividade rica após o carregamento inicial.

---

## Pergunta 2 — Validação dupla

> *"Por que validar o peso do bovino no cliente E no servidor? Não é redundante?"*

**Âncora:** slides de validação da aula 7; função de validação no frontend (JS) e middleware de validação no Express (`middlewares/validate.js`).

### Resposta-âncora

Não é redundante — são duas defesas com **propósitos completamente diferentes**:

1. **Validação no cliente = UX (feedback imediato).** Quando o capataz digita "−12" no campo de peso, o browser avisa em milissegundos — sem round-trip de rede, sem spinner, sem perder foco no input. O objetivo é conforto operacional: o capataz está em pé, no sol, pesando bovino. Erros descobertos na hora custam 2 segundos. Erros descobertos depois de submeter custam 10+ segundos e a paciência de quem está segurando o animal.
2. **Validação no servidor = segurança e integridade dos dados.** O cliente é completamente manipulável. Qualquer um com DevTools abiertos consegue remover o atributo `min` de um `<input>`, contornar o JavaScript de validação, ou forjar um `POST` com `curl`/Postman enviando `{ "peso": -999 }` direto para a API. **O servidor nunca pode confiar no que o cliente manda.** Nunca.
3. **As duas juntas fecham o ciclo.** Cliente cuida de quem usa de boa-fé. Servidor cuida de quem tenta corromper (ou de bugs no cliente). Tirar qualquer uma das duas quebra uma dessas garantias.

### Exemplo BrPec aplicado

- **Cenário concreto 1 — peso negativo:** o capataz digita acidentalmente "−45 kg". Validação no cliente avisa imediatamente, ele corrige em 2 s. Sem validação no cliente, ele submeteria, esperaria a resposta do servidor, leria a mensagem de erro, voltaria ao form. Menos ergonômico.
- **Cenário concreto 2 — 9999 kg:** nenhum bovino da raça Nelore atinge 9.999 kg. Se só existisse validação no cliente, um script automatizado poderia enviar `POST /pesagens` com `{ "peso": 9999, "brinco": "B-001" }` e esse dado corromperia o histórico de peso do animal, distorcendo o gráfico de ganho de peso e, possivelmente, as decisões de compra/venda do gerente.
- **Analogia:** o portão eletrônico da fazenda (cliente) evita que visitantes entrem sem avisar. O porteiro (servidor) é a segunda linha — ele checa documentos mesmo que o portão tenha aberto. Um fazendeiro sensato não dispensa o porteiro só porque tem portão.

### Possíveis confusões

- *"Se o servidor valida, pra que colocar validação no HTML5 (`required`, `min`, `max`)?"* → **Exatamente pelo conforto do usuário.** Validação HTML5 é zero-custo de desenvolvimento e já dá feedback instantâneo. Use sempre — ela não substitui a validação do servidor, mas poupa o capataz de round-trips desnecessários.
- *"E se o backend for uma API pública?"* → **Ainda mais importante validar no servidor.** API pública significa que qualquer cliente pode chamar — incluindo clientes que não têm sua validação de frontend. A regra é: **toda borda de entrada de dados no sistema valida.**
- *"Validação duplicada não significa manter duas regras em sincronia?"* → **Sim, e é o custo.** Em projetos maiores, isso é gerenciado com schemas compartilhados (ex.: Zod, Yup). Para o escopo do BrPec, manter os dois lugares manualmente é aceitável — o importante é entender o porquê antes de automatizar.

---

## Pergunta 3 — Persona → Requisito Funcional rastreável

> *"Como a necessidade do capataz ('registrar pesagem rápido') vira um requisito funcional que dá pra rastrear até um teste?"*

**Âncora:** slides de rastreabilidade da aula 7; SEBoK stakeholder needs → RF; ponte para o RTM da Ponderada III (aula 8).

### Resposta-âncora

Através de uma cadeia de rastreabilidade onde cada elo tem dono e pode ser verificado:

1. **Stakeholder Need (SEBoK).** "Como capataz, preciso registrar a pesagem de um bovino em menos de 30 segundos, mesmo sem sinal de internet." Essa frase é a persona falando — não é técnica, não é ambígua sobre quem, não é ambígua sobre o quê.
2. **Requisito Funcional (RF).** "RF-07: O sistema deve permitir registrar pesagem offline e sincronizar automaticamente quando a conexão for restaurada." RF é a tradução técnica da necessidade — testável, inequívoca, com ID rastreável.
3. **Tela / Artefato de front-end.** O formulário EJS em `views/pesagem.ejs` é a implementação do RF-07. Se o campo `peso` não existir na tela, o RF não foi implementado — dá pra checar visualmente e programaticamente.
4. **Teste automatizado.** `test('capataz registra pesagem offline e sincroniza', ...)` — o nome do teste cita a persona e o comportamento. Se o teste passa, o RF está cumprido. Se o teste quebra, o RF regrediu. **Cada elo é rastreável; célula vazia no RTM é promessa sem prova.**
5. **RTM (Requirement Traceability Matrix) — Ponderada III.** A matriz mapeia RF → tela → teste. Uma linha com RF preenchido mas sem teste na última coluna significa que aquele comportamento pode estar implementado — ou pode não estar. Ninguém sabe. Engenharia de software séria não opera no "acho que funciona".

### Exemplo BrPec aplicado

- **Persona → RF → tela → teste na prática:**

  | Elo | Artefato BrPec |
  |---|---|
  | Persona / necessidade | "Capataz registra pesagem rápido, sem sinal" |
  | RF-07 | Pesagem offline + sync automático |
  | Tela | `views/pesagem.ejs` + JS de enfileiramento offline |
  | Teste | `test('POST /pesagens retorna 201 com payload válido')` |
  | RTM | Célula RF-07 × Teste = verde = promessa cumprida |

- **O que acontece se pular um elo:** o gerente descobre na demo do Sprint 2 que a tela existe mas não funciona offline — porque ninguém escreveu o teste e ninguém checou o RTM. Isso é retrabalho caro perto da entrega, e é exatamente o padrão que o RTM existe para evitar.

### Possíveis confusões

- *"Persona é a mesma coisa que stakeholder?"* → **Quase, mas não exatamente.** Stakeholder é qualquer pessoa afetada pelo sistema (inclui o investidor, o veterinário, a MAPA). Persona é uma representação arquetípica de um usuário final específico — foco em comportamentos, contexto de uso, frustrações. Para o SEBoK, ambos alimentam *stakeholder needs*; para o design de tela, persona é mais acionável.
- *"RF sem teste ainda conta?"* → **Para fins de entrega, sim — mas é risco técnico documentado.** No RTM da Ponderada III, RF sem teste vai aparecer como célula vazia. O avaliador vai perguntar como você sabe que aquilo funciona. "Eu testei na mão" não é rastreável, não é repetível, e não sobrevive ao próximo refactor.
- *"E se a persona mudar depois?"* → **O RF pode precisar ser revisado, e o teste junto.** Esse é o valor da rastreabilidade: quando a persona muda (ex.: veterinário precisa da mesma tela), você sabe exatamente quais RFs, telas e testes precisam ser revistos — em vez de caçar impacto no código inteiro.

---

## Como conduzir as 3 perguntas (instruções operacionais)

1. **Mostre o slide com a pergunta.** Não fale a resposta — nem dê dicas com a entonação.
2. **30 segundos de silêncio absoluto.** O silêncio é o autoestudo subindo à consciência. Resista ao impulso de preencher o silêncio.
3. **Chame 2–3 voluntários.** Não corrija ainda — colete as respostas e anote mentalmente os erros mais comuns.
4. **Revele a resposta-âncora** (próximo clique no slide). Use um dos exemplos BrPec desta folha — nomes concretos (capataz, brinco, pasto, 3G) aterram o abstrato.
5. **Amarre com o artefato real:** *"abrindo o `views/pesagem.ejs` agora no projetor — repare que o servidor já manda o HTML com os dados preenchidos, exatamente o SSR que a gente acabou de discutir."*
6. **Não puna quem errou** — diagnostique. Erros consistentes apontam para reforço antes do lab.

---

## Sinais de alarme

- Se **mais da metade da turma** errar a Pergunta 1 (SSR vs CSR): pause e faça o experimento visual no projetor — abra o DevTools → Network, desabilite o cache, simule "Slow 3G" e carregue a mesma página com SSR e com uma SPA de exemplo. A diferença no waterfall é imediata e memorável.
- Se **mais da metade da turma** errar a Pergunta 2 (validação dupla): demonstre ao vivo a exploração do campo: abra DevTools → Console e rode `document.querySelector('input[name=peso]').removeAttribute('min')`. Depois submeta `−999`. O formulário aceita. Daí mostre que o servidor recusa. Nenhuma explicação vale mais que ver isso acontecer em tempo real.
- Se **mais da metade da turma** errar a Pergunta 3 (rastreabilidade RF → teste): abra o template do RTM da Ponderada III e mostre uma linha com célula de teste vazia. Pergunte: *"Como vocês provariam para um auditor que esse requisito está implementado?"* O silêncio que se segue é a aula.
- Se quase ninguém errar nenhuma pergunta: bom sinal — comprima o tempo de reveal e dê margem extra ao lab. A turma está pronta para construir; não a segure na teoria.
