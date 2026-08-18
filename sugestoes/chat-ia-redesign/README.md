# Sugestão: Redesign do Chat Mestre IA

Proposta de redesign visual do chat de IA da V10, **sem alterar o app em produção**. Protótipo interativo em [`mockup.html`](./mockup.html) — abra direto no navegador (Chrome/Edge para os recursos de voz).

## Por que

O chat atual (`v10/index.html:905-968`) é um modal central fixo de 760px, sem opção de minimizar, redimensionar ou manter aberto lateralmente enquanto se usa o resto do app. Também não existe nenhum recurso de voz nem configuração de perfil do agente pela interface (os perfis já existem em `mcp-server/model-profiles.json`, mas só são trocados por variável de ambiente).

## O que muda

| Recurso | Hoje | Proposta |
|---|---|---|
| Posição | Modal central, bloqueia a tela | Painel lateral fino, docado à direita, não bloqueia o app |
| Minimizar | Não existe | Botão 🗕 recolhe para uma pílula flutuante com badge de não lidas |
| Redimensionar | Tamanho fixo | Arrasta a borda esquerda (300–640px) + botão de expandir/encolher |
| Voz (entrada) | Não existe | Botão de microfone com Web Speech API (STT), pt-BR |
| Voz (saída) | Não existe | Botão 🔊 por mensagem + toggle "ler automaticamente" |
| Perfil do agente | Só via env var `OLLAMA_MODEL_PROFILE` | Nova aba "Perfil": troca visual entre fast/balanced/agent/coding/reasoning, persona/system prompt, temperature, toggles de comportamento |
| Abas existentes | Chat / Memórias | Chat / Memórias / **Perfil** (nova) |

## Funcionalidade preservada (nada foi removido)

Todos os elementos e IDs funcionais do chat atual têm equivalente direto no mockup:

- Toolbar completa: anexar contexto do app, imagem, arquivo, terminal, salvar JSON, exportar Markdown, limpar anexos, limpar conversa
- Chips de contexto anexado (`.ia-attach-panel`)
- Aba de Memórias com CRUD
- Bolhas de mensagem user/ai, blocos de código executáveis com botão "▶ Executar"
- Indicador de "digitando..."
- Seleção de modelo Ollama
- Pipeline de segurança existente (`classifyCommand` → `askCommandConfirmation` para comandos destrutivos, execução direta para low-risk) — o botão "▶ Executar (low-risk)" no mockup ilustra esse fluxo já implementado no app real

## Perfil do agente — integração real

A aba "Perfil" mapeia diretamente para `mcp-server/model-profiles.json` (fast, balanced, agent, coding, reasoning). Na integração real, a troca de perfil pela UI chamaria o mesmo mecanismo hoje controlado por `OLLAMA_MODEL_PROFILE`, expondo-o como preferência salva em `localStorage` (padrão já usado por `iaConversation`) em vez de exigir reiniciar o launcher.

## Voz — viabilidade técnica

Nenhuma dependência nova é necessária: `SpeechRecognition`/`webkitSpeechRecognition` (STT) e `speechSynthesis` (TTS) são APIs nativas do navegador, já suportadas no Chrome/Edge que hospedam a UI da V10. Nenhuma lib foi encontrada referenciada no projeto (`v10/index.html`, `v10/launcher.js`, `v10/package.json`) — é feature nova, 100% client-side, sem tocar no launcher ou no MCP.

## Guia de integração (quando for implementar de fato)

1. Manter os IDs atuais (`iaOverlay`→pode virar `iaPanel`, `iaMessages`, `iaInput`, `iaSendBtn`, `iaStatus`, `ollamaModelSelect`, `iaAttachPanel`, `iaMemoriesList` etc.) ou atualizar em conjunto todos os `getElementById`/`onclick` inline que referenciam esses IDs (ver mapa completo do arquivo atual — chat ocupa `v10/index.html:673-755` no CSS e `905-968` no HTML, lógica JS principal em `~1572-2900`).
2. Reaproveitar o padrão `.cmd-confirm-overlay`/`.cmd-confirm-modal` já existente para confirmação de comandos destrutivos — não recriar.
3. Persistir estado de UI (largura do painel, minimizado/expandido, perfil selecionado, toggles de voz) em `localStorage`, seguindo o padrão de `mestre_v10_ia_conversation`.
4. Migrar de `.ia-overlay` (`position:fixed; inset:0`) para o painel docado é uma mudança de z-index/layout; verificar que `.cmd-confirm-overlay` continua renderizando por cima do chat (hoje ambos coexistem por z-index 10000/10050).

## Como ver

Abra `mockup.html` em um navegador. Testado visualmente para os estados: painel padrão, expandido, minimizado, tema claro/escuro (reaproveita as mesmas variáveis CSS do app real), aba de Perfil.
