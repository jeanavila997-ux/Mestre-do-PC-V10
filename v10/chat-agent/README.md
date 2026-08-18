# Chat Agent — pasta dedicada

Home único para tudo relacionado ao agente de chat IA da V10: onde o código de produção do chat deve morar quando for extraído do monólito, os perfis/personas que a UI usa, e o vínculo com a proposta de design.

Esta pasta é **aditiva** — nada em `v10/index.html` foi alterado para criá-la. É o destino planejado para a próxima etapa (extração do chat do monólito), não uma reescrita já aplicada.

## Estrutura

```
v10/chat-agent/
├── README.md              este arquivo
├── profiles/
│   └── agent-profiles.json   perfis do agente (persona, system prompt, voz, parâmetros do modelo)
└── design/
    └── README.md           vínculo com a proposta visual em sugestoes/chat-ia-redesign/
```

## profiles/agent-profiles.json

Estende `mcp-server/model-profiles.json` (fast/balanced/agent/coding/reasoning) com os campos que a aba "Perfil" do redesign (`sugestoes/chat-ia-redesign/mockup.html`) precisa: `persona` (texto exibido), `systemPrompt` (instrução real enviada ao modelo) e `voice` (preferências de leitura em voz alta). Os campos `model`/`options` continuam espelhando o arquivo original do MCP — **não duplicar a fonte de verdade dos parâmetros do modelo**, apenas adicionar o que é específico da UI do chat.

## design/

Não duplica o mockup — aponta para `../../sugestoes/chat-ia-redesign/` (proposta aprovável) e registra, conforme a proposta evolui, quais decisões visuais já foram validadas e prontas para virar código real aqui dentro.

## Roteiro de extração (ainda não executado)

Quando a extração do chat do monólito for autorizada, o plano é:

1. Mover a lógica JS (`sendIA`, `addIAMessage`, `renderIAContent`, `runIACmd`, `classifyCommand`, `askCommandConfirmation`, gestão de `iaConversation`/memórias) de `v10/index.html:~1572-2900` para `v10/chat-agent/chat.js`, carregado via `<script src>` no lugar do código inline.
2. Mover o CSS (`v10/index.html:673-755`) para `v10/chat-agent/chat.css`.
3. Mover o HTML do painel (`v10/index.html:905-968`) para um template injetado no DOM (evita reescrever todos os `getElementById` de uma vez).
4. Preservar todos os IDs e o padrão `.cmd-confirm-overlay` já existente — ver `sugestoes/chat-ia-redesign/README.md` para o mapa completo.
5. Cada etapa acompanhada de teste manual no app real antes do merge (regra do projeto: mudança de comportamento sempre com verificação).

Essa extração não foi feita ainda — esta pasta só contém o scaffold e os perfis.
