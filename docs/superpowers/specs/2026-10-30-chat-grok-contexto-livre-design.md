# Design curto — Chat estilo Grok + contexto livre

**Data:** 2026-10-30  
**Escopo:** chat da home (`v10/chat/chat-module.js`) + Chat Integrado (`v10/chat-integrado/chat-integrado.js`) + `v10/chat/Soul.md`

## Intent
Dar ao chat do Mestre a liberdade de conversa do Grok: tom direto, bem-humorado e útil, assuntos livres, com histórico longo — sem abrir a whitelist de execução (`/run`).

## Goals
- Tom Grok: franco, pt-BR, pode sair do “só PC” quando o Jean quiser
- Contexto longo: enviar bem mais do histórico ao modelo
- Soul.md alinhado (persona editável em Gerenciar Comandos)
- Manter segurança de execução: comandos destrutivos e whitelist intactos

## Non-goals
- Não desligar `/classify` nem a whitelist
- Não expor senhas/chaves no prompt
- Não mudar o backend Ollama/9Router

## Approaches
1. **Prompt Grok + histórico longo (escolhido)** — reescrever SYSTEM_PROMPT nos dois chats + Soul.md; `slice(-20)` → histórico longo (~80–100 msgs) com teto de caracteres
2. Prompt Grok + Soul unificado só — menos código no JS hardcoded
3. Só tom, histórico igual — rejeitado (Jean pediu contexto livre)

## How
- Constante compartilhada de estilo Grok (texto) nos dois SYSTEM_PROMPT + Soul.md
- `HISTORY_MESSAGE_LIMIT = 80` (ou similar) + `HISTORY_CHAR_BUDGET` para não estourar contexto do modelo pequeno
- Greeting inicial menos “só manutenção”
- Call do builder: se o modelo ativo for cloud/grande, pode usar o teto alto; local 3B ainda se beneficia do histórico maior truncado pelo budget

## Builder calls
- Limite padrão: 80 mensagens / ~48k caracteres de histórico (além do system)
- Whitelist e Modo Livre: inalterados
