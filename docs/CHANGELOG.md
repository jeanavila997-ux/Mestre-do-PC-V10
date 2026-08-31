# Changelog

## [Unreleased]

### feat
- **Ollama Cloud**: suporte a `OLLAMA_API_KEY` para modelos cloud em `ollama.com/api` com auth header automático. Base URL muda automaticamente quando a key está definida.
- **Opções de geração configuráveis**: `OLLAMA_TEMPERATURE`, `OLLAMA_TOP_P`, `OLLAMA_TOP_K`, `OLLAMA_NUM_PREDICT`, `OLLAMA_SEED`, `OLLAMA_KEEP_ALIVE` via env vars.
- **Modo thinking**: parâmetro `pensar` em `perguntar_ia` ativa raciocínio (`think`) para modelos compatíveis (gpt-oss, deepseek-r1).
- **Metadata de resposta**: respostas da IA agora incluem contagem de tokens e tempo de geração.
- **Tratamento de erros HTTP**: parsing de respostas de erro estruturadas da API (400, 404, 429, 500, 502).
- **Função centralizada `ollamaChat()`**: elimina duplicação de código entre `perguntar_ia` e `analisar_logs_sistema`.
- **`verificar_modelo_ollama`**: detecta modo cloud, exibe tamanho do modelo, mensagens de erro contextuais.

### docs
- Adicionada seção "Docker" ao guia `docs/INSTALACAO-CLIENTE.md` com instruções para rodar Ollama via container (CPU, NVIDIA GPU, AMD GPU e Vulkan).
- Tabelas de env vars atualizadas em `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, `mcp-server/README.md`.

## 10.0.0 - Base inicial

- Base limpa da interface V10.
- Servidor MCP e integração opcional com Ollama.
- Exclusão de versões legadas e arquivos de desenvolvimento.
- Restrição do launcher aos comandos cadastrados em `allowed-operations.json`.
