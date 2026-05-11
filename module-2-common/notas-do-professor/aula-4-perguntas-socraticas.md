# Aula 4 — Perguntas socráticas (cola do professor)

> **Slides 16, 17 e 18 da aula 4 · 3 perguntas · ~2 min cada**
> Formato: pergunta projetada · alunos pensam 30 s · 2–3 voluntários respondem · você revela a resposta-âncora e amarra com o autoestudo.
> **Não é prova.** É diagnóstico de leitura e amarração para a ponderada do final da aula.

---

## Pergunta 1 — Codd, álgebra e JOIN

> *"Por que dizemos que JOIN é 'álgebra relacional'? O nome importa, ou é só jargão acadêmico?"*

**Âncora de autoestudo:** *A Relational Model of Data for Large Shared Data Banks* (E. F. Codd, 1970) — o paper que introduz relações como conjuntos e operações sobre eles.

### Resposta-âncora

Codd descreveu o banco como um conjunto de **relações** (tabelas) sobre as quais se aplicam **operações** algébricas — seleção (`WHERE`), projeção (`SELECT col`), junção (`JOIN`), união (`UNION`), agregação. Três coisas importam aqui:

1. **Toda operação recebe relações e devolve relações.** É por isso que dá pra encadear: o resultado de uma subquery no `FROM` é uma "relação derivada" que serve de entrada para o `SELECT` externo.
2. **As operações têm propriedades algébricas conhecidas** — comutatividade (`A ⋈ B ≡ B ⋈ A` para `INNER`), associatividade. É por isso que o otimizador pode *reescrever* a sua query sem mudar o resultado (ex.: trocar ordem dos JOINs para usar o índice).
3. **O nome é fiel.** Você não está "consultando dados", está fazendo **matemática sobre conjuntos**. `JOIN` é, em essência, um produto cartesiano filtrado por uma condição.

### Exemplos aplicados ao BrPec

- **A query "eventos por capataz"** é, formalmente, o produto `capataz × evento` filtrado por `capataz.id = evento.capataz_id`, projetado em `(nome, count)`. O motor *não* faz 6 × 60 = 360 combinações — ele usa o índice `idx_evento_bovino` (ou `capataz_id`, se criarmos) e converge direto.
- **Encadear é grátis.** A query "bovinos com mais eventos que a média" (P08 da sandbox) é uma sequência: agregar por bovino → tirar média → comparar. Cada passo é uma relação. Em código imperativo seriam 3 loops aninhados; em SQL é uma frase.
- **A reescrita do otimizador acontece de verdade.** Mudar `WHERE c.id = e.capataz_id AND c.nome = 'João'` para `WHERE c.nome = 'João' AND c.id = e.capataz_id` dá o mesmo plano — o otimizador reordena para filtrar primeiro pela coluna mais seletiva.

### Possíveis confusões e como corrigir

- *"Álgebra é só nomenclatura, na prática SQL é só sintaxe."* → **Não.** Sem entender que JOIN é operação algébrica, você não entende por que o resultado de um `LEFT JOIN` *contém* o do `INNER JOIN` (é superset matemático). Confunde resultado errado com bug de query.
- *"Então JOIN é produto cartesiano lento?"* → **Sim em teoria, não na prática.** O motor reescreve para hash join, merge join, nested loop com índice. Mas o resultado é equivalente ao produto-filtrado — é por isso que dá pra *raciocinar* sobre cardinalidade antes de rodar.

---

## Pergunta 2 — Por que a tabela de junção não é "duplicação"?

> *"A tabela `capataz_retiro` guarda só dois ids. Não é 'duplicação'? Por que não colocar os capatazes em uma string CSV dentro de `retiro`, tipo `'1,3,4'`?"*

**Âncora de autoestudo:** 1FN (Primeira Forma Normal) da aula 3 — toda célula deve conter um valor atômico — e a discussão sobre N:N na seção de modelagem do material da aula 4.

### Resposta-âncora

Em uma tabela bem-modelada, **uma célula = um fato atômico**. Guardar `"1,3,4"` em uma célula viola isso por **quatro** razões concretas e independentes:

1. **Você perde índice.** Não dá pra fazer `WHERE retiro_id = 3`; vira `LIKE '%3%'` que casa indevidamente com `13`, `33`, `103`. Sem índice, qualquer consulta em produção destrói performance.
2. **Você perde FK.** O banco não consegue garantir que `"3"` existe em `retiro`. Vai ter capataz vinculado a retiro fantasma e ninguém percebe.
3. **Você perde atributos da ligação.** Quando o capataz começou nesse retiro? Está ativo? É temporário? Permanente? Tudo isso é informação **da relação**, não dos lados — só cabe se a relação tem uma tabela própria.
4. **Você perde JOIN.** Toda agregação ("quantos capatazes por retiro?") vira `string-split` na aplicação. Lento, bugado e impossível de otimizar.

A tabela de junção **não é duplicação** — é a **materialização** da relação N:N. Cada linha representa um fato indissolúvel: *"o capataz X está vinculado ao retiro Y desde Z, status W"*. Esse fato precisa de uma linha própria. Sem ele, a relação some.

### Exemplos aplicados ao BrPec

- **Vitor Gomes existe em `capataz`, mas não tem nenhuma linha em `capataz_retiro`.** Isso é informação relevante: ele entrou e ainda não foi alocado. Em CSV, essa situação seria uma string vazia — confundível com "todos os retiros" ou "nenhum dos retiros" ou simplesmente "esqueci de preencher".
- **João Pereira atua em Cabeceira e Mata-Burro simultaneamente.** Com tabela de junção, são duas linhas — o `GROUP_CONCAT` da query P07 mostra isso naturalmente. Em CSV, seria uma string `"1,2"` que cresce monoliticamente e torna *adicionar* ou *remover* uma operação cara.
- **A regra de negócio "capataz só registra evento em retiros sob sua responsabilidade"** pode virar uma `CHECK` ou um trigger usando `capataz_retiro`. Em CSV, vira código de aplicação — e regra em código de aplicação some quando o aluno troca de framework.

### Possíveis confusões

- *"Mas a tabela tem só 2 ids — é redundante, eu já tenho as duas tabelas."* → **Não.** A tabela `capataz_retiro` codifica **quais pares estão de fato vinculados**. Sem ela, você teria todos os pares possíveis (produto cartesiano), o que não é o mundo real.
- *"Posso usar JSON em vez de CSV?"* → **Marginalmente melhor**, mas ainda perde índice, FK e JOIN. Resolve a parte do parsing, não os 4 problemas. Use tabela de junção.

---

## Pergunta 3 — INNER vs LEFT: quando o tipo errado *mente*?

> *"'Quantos eventos cada capataz registrou?' Se você escolher o JOIN errado, em qual sentido sua resposta mente sobre a operação da fazenda?"*

**Âncora de autoestudo:** seção "INNER vs LEFT" do material da aula 4 + slide 7 sobre `COUNT(*)` vs `COUNT(e.id)`.

### Resposta-âncora

`INNER JOIN` traz **apenas** os capatazes que registraram pelo menos um evento. O coordenador olha o relatório e pensa: *"ótimo, todos os capatazes estão produtivos"*. **Vitor Gomes sumiu** — ele é capataz recém-contratado, ainda em treinamento, e o relatório o esconde.

- Se a pergunta era **"quem está performando?"**, a resposta `INNER` é técnica e correta — você quer mesmo só quem participou.
- Se a pergunta era **"quem é minha equipe?"**, a resposta `INNER` é **errada** e cria um furo no acompanhamento. Vitor entrou faz 3 meses e não registrou nada — e ninguém vai notar até alguém procurar pelo nome dele.

`LEFT JOIN` mostra todos os capatazes, incluindo Vitor com `0`. Aí o coordenador vê: *"Vitor entrou há 2 semanas, esperado"*. Ou: *"Vitor entrou há 3 meses e zero eventos — vamos conversar"*.

**Princípio geral:** o JOIN não é só sintaxe — ele **codifica a pergunta de negócio**. `INNER` pergunta *"quem participou?"*. `LEFT` pergunta *"quem está na lista, participou ou não?"*. Trocá-los troca a pergunta — e o aluno não percebe que o relatório virou outro.

### Exemplos aplicados ao BrPec

- **Relatório de aftosa por retiro.** Se você fizer `retiro INNER JOIN evento WHERE tipo='vacinacao'`, os retiros com **zero vacinas** somem do relatório. Você nunca vai descobrir que o Faxinal ficou de fora da campanha. `LEFT JOIN ... AND e.tipo='vacinacao'` força o Faxinal a aparecer com `0`.
- **Bovinos sem evento há 30 dias.** É exatamente um `bovino LEFT JOIN evento WHERE e.id IS NULL` (ou data antiga). `INNER` aqui é inviável — o bovino que você quer encontrar é, por definição, aquele que **não tem** par à direita.
- **`COUNT(*)` num `LEFT JOIN` sempre dá pelo menos 1.** Porque a linha esquerda sempre aparece, mesmo com par fantasma. Use `COUNT(e.id)` para contar pares reais. Erro clássico — fácil de cometer, difícil de notar.

### Possíveis confusões

- *"Sempre uso `LEFT JOIN` para garantir."* → **Não.** `LEFT` traz NULLs que podem mascarar lógica de filtro. Ex.: `LEFT JOIN ... WHERE r.area_ha > 200` exclui linhas com `r.area_ha IS NULL` — você desfez o `LEFT`. A condição vai no `ON`, não no `WHERE`, se o objetivo é preservar a esquerda.
- *"INNER é mais rápido que LEFT, então prefira."* → **Performance não é o critério primário.** O critério é *qual pergunta de negócio você quer responder*. Se as duas servem, aí sim `INNER` é geralmente mais leve.

---

## Como conduzir os 3 quizzes (instruções operacionais)

1. **Mostre o slide com a pergunta.** Não fale a resposta.
2. **30 segundos de silêncio absoluto.** Resista à vontade de preencher. Esse silêncio é o autoestudo encontrando o cérebro.
3. **Chame 2–3 voluntários.** Não corrija ainda — colete.
4. **Revele a resposta-âncora** (próximo clique no slide). Use 1–2 dos exemplos BrPec dessa folha.
5. **Amarre com o autoestudo:** *"quem leu o Codd, isso aqui está nas páginas X–Y; quem não leu, anota a referência."*
6. **Não puna quem errou** — diagnostique. Erros repetidos em uma pergunta indicam que aquele conceito precisa de mais reforço no lab e na ponderada.

### Sinal de alarme

- Se **mais da metade da turma** errar a Pergunta 3 (INNER vs LEFT), considere reduzir o tempo do lab em 5 minutos e fazer um exemplo guiado adicional ao vivo no sandbox — *exibindo lado a lado* o INNER e o LEFT da mesma pergunta. **A ponderada depende firmemente dessa distinção.**
- Se quase ninguém errar a Pergunta 2 (tabela de junção), pode pular o reforço — significa que a aula 3 (CRUD + 1FN) ficou bem fixada.

---

## Bônus · perguntas-pivô para o lab e ponderada

Quando um grupo travar no lab, em vez de dar a resposta, use uma destas perguntas-pivô:

| Sintoma | Pergunta-pivô |
|---|---|
| "Não sei se uso INNER ou LEFT" | *"A pergunta é 'quem participou?' ou 'quem está na lista, participou ou não?'"* |
| Query roda mas resultado parece estranho | *"Quantas linhas você esperava? Quantas vieram? Onde está a diferença?"* |
| Não sabe agrupar | *"Qual coluna se repete na sua saída atual? Aquela é a chave do GROUP BY."* |
| Confuso entre WHERE e HAVING | *"O filtro depende de uma agregação que ainda não existe? Então é HAVING."* |
| `COUNT(*)` retornando 1 indevidamente | *"Em LEFT JOIN, o lado esquerdo sempre aparece. O que conta é o id do lado direito."* |
