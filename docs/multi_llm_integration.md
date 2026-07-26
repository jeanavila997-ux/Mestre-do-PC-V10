# IA local, Multi-LLM e OpenAI Agents SDK

## Estado implementado

O runtime atual do Mestre do PC V10 é local:

- a interface V10 conversa com o Ollama por meio do launcher em
  `http://127.0.0.1:7777`;
- o MCP Node publica 33 ferramentas e usa `OLLAMA_URL` e `OLLAMA_MODEL`;
- o modelo padrão é `qwen2.5-coder:1.5b`;
- tags `:cloud` cadastradas no Ollama também aparecem na interface, mas continuam
  sendo acessadas pela API do Ollama;
- não há dependência `openai-agents`, `@openai/agents` ou consumo de
  `OPENAI_API_KEY`.

Portanto, OpenAI, Gemini, Anthropic e DeepSeek não são provedores implementados
no servidor atual. Os exemplos TypeScript antigos em `src/ai/` nunca fizeram
parte desta árvore e não devem ser tratados como funcionalidade disponível.

## Proposta opcional: OpenAI Agents SDK

Esta é uma proposta separada, ainda não habilitada. Ela só deve ser implementada
após autorização explícita, pois adiciona uma dependência de nuvem e exige
`OPENAI_API_KEY`.

Contrato mínimo sugerido:

| Item | Contrato |
|---|---|
| Objetivo | Analisar um relato de problema do PC e gerar um plano seguro |
| Entrada | Texto do usuário e, quando autorizado, métricas locais |
| Saída | Diagnóstico provável, evidências, passos e ações que exigem aprovação |
| Ferramentas | Leituras determinísticas do MCP; manutenção somente após aprovação |
| Estado | Histórico curto sem credenciais ou dados sensíveis |
| Agente | Um único `Agent` inicialmente; especialistas apenas se houver necessidade comprovada |
| Segurança | Nunca oferecer shell administrativo irrestrito; confirmar toda ação mutável |
| Runtime | Serviço Python separado, com `/health`, sem substituir Ollama/MCP |

Estrutura proposta:

```text
agents-sdk/
  agent.py
  main.py
  pyproject.toml
  docs/prompt.md
  evals/
```

Critérios antes de implementar:

1. escolher se o Agents SDK complementará ou substituirá apenas o chat da
   interface;
2. definir quais ferramentas MCP serão somente leitura;
3. configurar a chave por fluxo seguro, nunca em arquivos versionados;
4. adicionar testes de aprovação, rejeição de comandos e ausência de chave;
5. validar localmente antes de qualquer implantação.

Referências oficiais:

- <https://developers.openai.com/api/docs/guides/agents>
- <https://developers.openai.com/api/docs/guides/agent-evals>
- <https://github.com/openai/openai-agents-python>
