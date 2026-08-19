# Chat Agent — pasta dedicada

Pasta de perfis e referências de design do agente de chat IA da V10.

> **Estado atual:** a implementação modular em desenvolvimento está em `../chat/`. Esta pasta permanece como fonte dos perfis/personas e das decisões visuais; não é mais o destino do código executável do chat.

O chat usado pela página principal ainda vive em `v10/index.html`. O componente reutilizável está em `v10/chat/chat-module.js` e ainda não substitui o monólito.

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

## Roteiro de migração (ainda não executado)

Quando a extração do chat do monólito for autorizada, o plano é:

1. Validar `v10/chat/chat-module.js`, `chat-styles.css` e o exemplo de integração.
2. Integrar o módulo ao `v10/index.html`, removendo gradualmente o CSS e o JavaScript duplicados.
3. Preservar os contratos de segurança, os IDs necessários e a confirmação explícita de todo comando sugerido pela IA.
4. Preservar todos os IDs e o padrão `.cmd-confirm-overlay` já existente — ver `sugestoes/chat-ia-redesign/README.md` para o mapa completo.
5. Cada etapa acompanhada de teste manual no app real antes do merge (regra do projeto: mudança de comportamento sempre com verificação).

Essa migração não foi concluída — esta pasta contém apenas perfis e referências de design.
