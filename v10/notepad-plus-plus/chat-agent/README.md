# Chat Agent — pasta dedicada

Pasta de perfis e referências de design do agente de chat IA da V10.

> **Estado atual:** a implementação modular em desenvolvimento está em `../chat/`. Esta pasta permanece como fonte dos perfis/personas e das decisões visuais; não é mais o destino do código executável do chat.

A página principal não monta `v10/chat/chat-module.js`. Os botões de chat em `v10/index.html` redirecionam para `/chat-integrado/`. O módulo antigo permanece em `example-integration.html`.

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

A home já não usa este módulo. Esta pasta contém apenas perfis e referências de design.
