# Chat Integrado — layout Conversa

Data: 2026-11-11. Escolha do Jean no mockup: **B — Conversa**.

## Intenção

O Chat Integrado em `http://127.0.0.1:7777/chat-integrado/chat-integrado.html` está difícil de usar: a área central fica vazia, painéis de ferramentas/skills podem cobrir a conversa (no tema claro isso vira uma folha branca), e a lista lateral mostra prompts crus, duplicados ou só um `]`.

O layout Conversa põe a conversa no centro da tela e o campo de mensagem preso embaixo, no mesmo espírito de um chat moderno, sem trocar o motor (launcher, whitelist, skills, Ollama).

## Objetivos

- A coluna de mensagens ocupa a altura útil. O composer fica fixo no rodapé dessa coluna.
- Estado vazio: título curto, composer e no máximo uma linha de atalhos. Sem bloco enorme no meio da tela.
- Ferramentas, skills e memórias abrem como menu ancorado no botão, e fecham ao clicar fora ou em Escape. Não cobrem a conversa inteira.
- Títulos da lista lateral são curtos e legíveis.
- Tema claro usa cinza de página (`#f6f8fa`). Branco só em cartões pequenos (composer, bolha).
- O fluxo atual continua: enviar mensagem, `/skill`, executar na whitelist, voltar ao painel, tema, novo chat, limpar chat.

## Fora de escopo

- Novo provedor de modelo, login, ou mudança na whitelist (`allowed-operations.json`).
- Redesign do painel principal (`v10/index.html`) ou do PWA mobile.
- Apagar conversas antigas do armazenamento. Só muda como o título aparece.
- Empacotador, framework ou biblioteca de UI nova.

## Anti-objetivos

- Uma tela “dashboard” com painel de status permanente à direita (isso era a opção C, rejeitada).
- Manter o hero centralizado com dezenas de chips em volta (opção A, rejeitada como direção).

## Restrições

- HTML/CSS/JS servidos direto, sem bundler. Arquivos: `v10/chat-integrado/chat-integrado.html`, `styles.css`, `chat-integrado.js`.
- Textos visíveis em pt-BR.
- Clientes e origem do launcher não mudam (`127.0.0.1`, `X-Mestre-Client`).
- O JS que fala com `/run`, skills e memórias permanece; muda casca e abertura de painel.

## Abordagens

1. **A — Oficina.** Mesma estrutura, só CSS. Menos risco, mas o composer continua no meio no estado vazio e os painéis absolutos continuam fáceis de cobrir o chat. Rejeitada.
2. **B — Conversa.** Coluna flex: mensagens rolam, composer no fim. Menus no lugar dos painéis grandes. Escolhida.
3. **C — Operação.** Igual a B mais uma coluna fixa de status/jobs. Mais densa e foge do pedido de conversa. Rejeitada.

## Como fica a tela

Barra superior fina, à direita da área principal: voltar ao painel, novo chat, tema, estado Online/modelo. Sem segunda fileira de botões soltos.

Lateral esquerda, largura ~260 px, recolhível como hoje:

- Novo chat
- Lista de conversas (o conteúdo principal da lateral)
- Um item “Mais” que agrupa Memórias, Ferramentas, Skills, Configurar API, Gerenciar, Diagnóstico, Manutenção, Dashboard, Limpar chat
- Perfil / sair no rodapé

Área principal, `display: flex; flex-direction: column; min-height: 0; height: 100%`:

- Região de mensagens com `flex: 1; overflow: auto`. No vazio, um título de uma linha no topo da região, não no centro geométrico da janela.
- Composer no fluxo normal, no fim da coluna (não `position: fixed` na viewport, para não brigar com a lateral). Largura máxima ~760 px, centralizado.
- Atalhos: uma faixa horizontal com rolagem, logo acima ou logo abaixo do composer, só no estado vazio. Some quando já há mensagens (comportamento atual de esconder o hero pode ser reaproveitado).

Menus de Ferramentas (55), Skills (43) e modo (Equilibrado):

- `popover="auto"` no painel, ancorado no botão (`anchor-name` / `position-anchor`) quando o navegador suporta.
- Sem suporte: o painel abre `position: absolute` logo acima do botão, largura máxima 760 px, altura máxima ~40 vh, com scroll interno, e um listener de Escape / clique fora fecha.
- Fundo do menu: `--panel` escuro ou, no claro, `#ffffff` só nesse cartão, com borda. Nunca um retângulo sem conteúdo cobrindo `main`.

Tema claro:

- `--bg: #f6f8fa`, `--sidebar-bg: #f0f2f4`, `--panel: #ffffff` apenas para cartões.
- Texto do título sem gradiente animado (o gradiente some no claro e parece “vazio”). Cor sólida `--text`.

Títulos de conversa (decisão do desenho, não do armazenamento):

- Primeira linha não vazia da primeira mensagem do usuário.
- Cortar em 42 caracteres com reticências.
- Se sobrar só pontuação ou menos de 2 letras, mostrar “Conversa”.
- Não fundir nem apagar itens duplicados; podem continuar lado a lado com o mesmo título curto.

## O que fica com quem implementa

- Nomes exatos de classes CSS, desde que o comportamento acima se mantenha.
- Se “Mais” é `<details>` ou menu. Preferir controle nativo acessível por teclado.
- Ordem interna dos atalhos, desde que caibam numa faixa rolável.
- Ajuste fino de espaçamento.

## Verificação

- Abrir a página no tema escuro e no claro, com conversa vazia e com mensagens (o atalho de RAM já existente serve).
- Abrir Ferramentas e Skills: o menu não cobre a lista de mensagens inteira; Escape fecha.
- Lateral: nenhum título é só `]`.
- Enviar uma mensagem e o botão “Executar na whitelist” de um bloco powershell continua clicável.
- Largura ~390 px: lateral vira gaveta; composer não sai da tela.
