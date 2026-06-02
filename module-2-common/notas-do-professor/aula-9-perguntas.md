# Notas do Professor — Aula 9 (11/06/2026)
## Front-End III — CSS e JavaScript · Semana 08

---

### Pergunta 1 — CSS Variables vs valores repetidos

**Pergunta:**
> "Qual é a diferença entre declarar uma cor em `:root { --cor-primaria: #1863dc }` e simplesmente usar `color: #1863dc` direto em cada seletor? Para um projeto pequeno, faz diferença?"

**Resposta-âncora:**
Funcionalmente, não há diferença na renderização imediata — o browser aplica a cor do mesmo jeito. A diferença aparece na **manutenção**: quando o cliente pede para trocar a cor primária, com variável você muda em um lugar; sem variável, você faz `grep` no projeto inteiro e torce para não ter esquecido nenhum seletor. Para o projeto BrPec com 3-4 páginas, já vale: trocar de paleta é uma linha. O segundo ganho é o **tema escuro** — `[data-theme="dark"] { --cor-primaria: #60a5fa }` e o toggle funciona para todo o CSS ao mesmo tempo.

**Exemplo BrPec aplicado:**
O botão de cadastro de animal usa `background: var(--cor-primaria)`. Se o Capataz pedir que o BrPec mude o visual para uma nova identidade visual, a troca é uma linha no `:root`. Sem variável, caçaria ocorrências em `public/css/*.css`.

**Possíveis confusões:**
- Alunos podem confundir CSS Variables com variáveis de pré-processadores (Sass `$var`). A diferença: CSS Variables existem em runtime e podem ser lidas/modificadas por JavaScript; Sass é compilado e desaparece no CSS final.
- Alguns acham que variáveis afetam performance — não afetam de forma mensurável para projetos desse porte.

**Sinais de alarme:**
- Se o aluno disser "uso Bootstrap para tudo, não preciso de variáveis" → explorar que Bootstrap v5 usa CSS Variables internamente, e saber declarar as suas permite customizar o Bootstrap sem sobrescrever classes.
- Se o aluno não conseguir fazer o toggle de tema funcionar → verificar se o JS está trocando o atributo no `<html>`, não no `<body>`.

---

### Pergunta 2 — Quando usar Flexbox e quando usar Grid?

**Pergunta:**
> "Tanto Flexbox quanto Grid podem centralizar elementos e criar colunas. Como decido qual usar em cada situação?"

**Resposta-âncora:**
A regra prática: **Flexbox** para **uma dimensão** (barra de navegação, linha de cards, botões alinhados), **Grid** para **duas dimensões** (layout de página inteiro — header, sidebar, main, footer). Quando você precisa que um item ocupe colunas e linhas ao mesmo tempo, Grid é a escolha certa. Quando você só quer distribuir itens em uma linha e ajustar o espaço entre eles, Flexbox é mais simples. Na prática, os dois coexistem: Grid para o layout da página, Flexbox para os componentes internos.

**Exemplo BrPec aplicado:**
O layout principal da página de pesagens usa Grid para posicionar sidebar (filtros) + main (tabela) + header. Dentro do header, a navbar usa Flexbox: `display:flex; justify-content:space-between` alinha logo à esquerda e o menu à direita. Quando o layout quebra para mobile, o Grid colapsa com uma media query; o Flexbox da navbar vira coluna com `flex-direction:column`.

**Possíveis confusões:**
- Confundir `gap` de Flexbox (novo, amplamente suportado) com `margin` entre itens. Hoje `gap` funciona igual nos dois.
- Achar que `grid-template-areas` é obrigatório — é opcional, mas melhora muito a legibilidade para layouts com nomes.

**Sinais de alarme:**
- Aluno usando `position: absolute` para layout geral → é o sinal mais claro de que não entendeu Flex/Grid. Abordar: absolute remove o elemento do fluxo e torna responsividade muito mais difícil.
- Aluno aninhando vários `float: left` → padrão dos anos 2010. Mostrar que Grid resolve o mesmo problema em 3 linhas.

---

### Pergunta 3 — O que é estado e por que UI = f(estado) importa?

**Pergunta:**
> "Na palestra do Rich Harris ele fala em 'estado'. Mas o que exatamente é o estado de uma aplicação? E se eu já uso `fetch` e `localStorage`, já estou sendo reativo?"

**Resposta-âncora:**
Estado é **qualquer dado que determina o que a UI deve mostrar naquele momento**: a lista de animais carregada, o usuário logado, se um modal está aberto, o tema claro/escuro. UI = f(estado) significa que se você soubesse o estado completo da aplicação em um instante, conseguiria reconstruir exatamente o que o usuário está vendo — sem precisar perguntar ao DOM.

Usando `fetch` e `localStorage` você já gerencia estado — mas provavelmente de forma **imperativa**: você busca os dados, depois manualmente atualiza cada elemento (`el.innerText = item.nome`, `el.classList.add('loading')`). O problema surge quando dois trechos de código atualizam o mesmo elemento de formas conflitantes, ou quando você esquece de atualizar um seletor.

**Reactivity** automatiza isso: você declara que "a lista renderizada depende de `dados`", e toda vez que `dados` mudar — seja por um fetch, por um evento de usuário, por um timer — a UI reflete. Frameworks como Vue, React, Svelte implementam isso. Mas mesmo sem framework, o pattern de ter uma função `render(state)` que escreve no DOM e chamar ela toda vez que o estado mudar já é um passo significativo.

**Exemplo BrPec aplicado:**
A página de pesagens tem pelo menos 4 estados: loading (aguardando fetch), empty (sem pesagens cadastradas), error (servidor caiu) e populated (lista pronta). Se o aluno tem quatro blocos de `if/else` espalhados pelo código que tocam o mesmo `<div>`, a manutenção é frágil. Com um objeto `{ status: 'loading', data: [] }` e uma função `render(state)` centralizada, adicionar um quinto estado (ex.: "filtrando") é uma linha.

**Possíveis confusões:**
- Achar que "reactivity" exige um framework — não exige. O princípio é independente de tecnologia.
- Confundir estado com variáveis globais — estado pode ser global, mas deve ser **controlado**: mutado apenas por funções designadas, nunca diretamente em event listeners espalhados.

**Sinais de alarme:**
- Aluno com múltiplos `document.querySelector('#tabela').innerHTML = ...` em lugares diferentes → o mesmo elemento sendo escrito por múltiplos donos é o sintoma clássico de ausência de state management.
- Se nenhum aluno entender a diferença, ancorar nos UI states da Aula 8: loading/empty/error/success são estados literais — o que o slide do Rich Harris chama de "estado" é exatamente isso, generalizado.
