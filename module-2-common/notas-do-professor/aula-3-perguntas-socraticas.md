# Aula 3 — Perguntas socráticas (cola do professor)

> **Bloco 1 da instrução · 7 minutos · 3 perguntas · ~2 min cada**
> Formato: pergunta projetada · alunos pensam 30 s · 2–3 voluntários respondem · você revela a resposta-âncora e amarra com o autoestudo correspondente.
> **Não é prova.** É diagnóstico de leitura e ponte pro Bloco 2 (storytelling boleta→tabela).

---

## Pergunta 1 — Codd e a independência física

> *"Codd, em 1970, separou a álgebra relacional do armazenamento físico. Por que isso ainda importa em 2026?"*

**Âncora de autoestudo:** *A Relational Model of Data for Large Shared Data Banks* (E. F. Codd).

### Resposta-âncora

A grande sacada de Codd não foi o SQL — foi declarar que o **dado lógico é independente da forma física como ele está armazenado**. Você descreve *o que* quer (relação, projeção, seleção), e o SGBD decide *como* buscar (qual índice, qual ordem de junção, qual algoritmo). Em 2026 isso continua sendo a razão pela qual o SQL atravessou décadas, hardwares e paradigmas sem precisar ser reescrito.

### Exemplos aplicados ao BrPec

- **Stack do MVP:** vamos rodar o BrPec em **SQLite**. Se em 2 anos a fazenda escalar e exigir Postgres, o `SELECT * FROM eventos_zootecnicos WHERE retiro_id = 3` continua valendo — o que muda é o motor por baixo. **Independência física na prática.**
- **Otimização sem reescrever:** quando criarmos um índice em `eventos_zootecnicos(data)`, **nenhuma query precisa ser alterada**. O SGBD detecta e usa. Isso é álgebra relacional + otimizador, não programação imperativa.
- **Contraste com NoSQL document-store:** se modelássemos o BrPec em MongoDB com documentos aninhados (`retiro` com `bovinos[]` dentro), trocar a forma de busca exigiria reescrever o código da aplicação. Codd previu e evitou esse acoplamento.

### Possíveis confusões e como corrigir

- *"É porque SQL é mais rápido"* → **não**. É porque é declarativo e isolado da física. Velocidade é consequência, não causa.
- *"Significa que não precisa pensar em performance"* → **não**. Significa que pensamos em performance via **índices e estatísticas**, não reescrevendo a lógica da aplicação.

---

## Pergunta 2 — ORM como anti-padrão

> *"Em qual momento da modelagem do BrPec um ORM nos faria perder informação?"*

**Âncora de autoestudo:** *ORM is an Offensive Anti-Pattern* (Yegor Bugayenko, vídeo) + crítica de Chen sobre OO sobre relacional.

### Resposta-âncora

ORMs (Sequelize, TypeORM, Prisma, Hibernate) mapeiam tabelas em objetos. Funcionam bem pra **CRUD trivial de uma única entidade**. Quebram — ou viram fonte de bugs sutis — quando o problema exige **álgebra relacional de verdade**: agregações, junções multinível, constraints declarativas, queries analíticas. O ORM esconde o SQL; quando o SQL escondido fica caro ou errado, o aluno não tem ferramenta pra investigar.

### Exemplos aplicados ao BrPec

| Cenário BrPec | O que um ORM tende a fazer | O que perdemos |
|---|---|---|
| Coordenador exporta movimentações por retiro/período (Excel) | Hidrata `Retiro → Bovino → Evento → Capataz` em loop de objetos | **N+1 queries** — 1 SELECT vira centenas. Em offline-first com sync, isso destrói a janela de upload. |
| "Quantos bovinos por retiro hoje?" | Carrega lista inteira na memória e conta no JS | Perde a agregação no banco (`GROUP BY retiro_id`), que é onde ela é barata |
| Constraint "capataz só registra evento em retiros sob sua responsabilidade" | Vira `if` na camada de Service | Vira **regra documentada apenas no código**. Em SQL seria uma `CHECK` ou `FK` composta — declarativa, auditável, durável. |
| Sincronização offline → servidor | Usa `save()` por entidade | Perde `INSERT ... ON CONFLICT DO UPDATE` (upsert), que é a primitiva natural pra reconciliação |

### Recado pedagógico

**Nesta aula, escrevemos SQL à mão.** Não é purismo — é pra *enxergar* o que o ORM esconde. Quando vocês usarem um ORM no Módulo 5/6, vão saber **quando confiar nele e quando puxar SQL puro**. Quem nunca escreveu SQL à mão usa ORM por medo, não por escolha.

---

## Pergunta 3 — ER vs DER

> *"Qual a diferença entre um diagrama ER e um DER, em uma frase?"*

**Âncora de autoestudo:** *Entity-Relationship Modeling: Historical Events, Future Trends, and Lessons Learned* (Peter Chen).

### Resposta-âncora (uma frase)

**ER é o esboço da história — quais entidades existem e como se conectam. DER é o storyboard rotulado — atributos explícitos, chaves primárias e estrangeiras, cardinalidades exatas.**

### Detalhamento (caso alguém peça mais)

| Camada | ER | DER |
|---|---|---|
| Pergunta que responde | "*Que coisas existem no mundo?*" | "*Como cada coisa vira tabela?*" |
| Atributos | Opcionais ou agrupados | Todos listados, com tipo |
| Chaves | Implícitas | PK e FK explícitas |
| Cardinalidade | Genérica (*relaciona-se*) | Precisa (1:1, 1:N, N:N) |
| Público | Pessoa de negócio + dev | Dev + DBA |
| Tradução para DDL | Ainda tem ambiguidade | **Mecânica** — quase 1:1 com `CREATE TABLE` |

### Exemplos aplicados ao BrPec

**ER (esboço):**
```
Capataz —[ registra ]— EventoZootécnico —[ ocorre em ]— Retiro
                              |
                              [ envolve ]
                              |
                            Bovino
```

**DER (storyboard):**
```
Capataz(id PK, nome, cpf)                           1
   ↑                                                 │
   │ FK capataz_id                                   │ N
   │                                                 ↓
EventoZootécnico(id PK, tipo, data, capataz_id FK, retiro_id FK, bovino_id FK)
                                          │ N             │ N            │ N
                                          ↓               ↓              ↓
                                          1               1              1
                                       Retiro(id PK)    Bovino(id PK, sexo, mae_id FK)
```

### Recado pedagógico

A passagem ER → DER é onde **rastreabilidade RN→Tabela é cravada**. Toda regra de negócio que vocês mapearem nas aulas 1–2 vai virar **uma constraint específica no DER**. Sem DER, a constraint vira "vou validar no JS" — e aí a integridade dos dados depende da disciplina do dev. **Com DER, depende do banco.**

---

## Como conduzir o quiz (instruções operacionais)

1. Mostre o slide com a pergunta. **Não fale a resposta.**
2. **30 segundos de silêncio absoluto.** Resista à vontade de preencher. Esse silêncio é o autoestudo encontrando o cérebro.
3. Chame **2–3 voluntários**. Não corrija ainda — colete.
4. **Revele a resposta-âncora** no slide (próximo clique). Use 1 dos exemplos BrPec dessa folha.
5. **Amarre com o autoestudo:** "*quem leu o Codd, isso aqui está nas páginas X–Y; quem não leu, anota a referência pro fim de semana.*"
6. **Não puna quem errou** — diagnostique. Erros consistentes em 1 pergunta indicam que o autoestudo correspondente precisa de mais reforço nas próximas aulas.

### Sinal de alarme

Se **mais da metade da turma** errar a Pergunta 3 (ER vs DER), suspenda o cronograma do Bloco 5 (modelagem em grupos) e volte 5 minutos pra um exemplo guiado de tradução ER→DER. **A modelagem em grupos depende dessa distinção estar firme.**
