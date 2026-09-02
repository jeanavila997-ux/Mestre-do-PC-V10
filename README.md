# Mestre do PC V10

[![Website](https://img.shields.io/badge/Website-Live%20Demo-00d4ff?style=for-the-badge&logo=googlechrome)](https://jeanavila997-ux.github.io/Mestre-do-PC-V10/index.html)
[![Hostinger](https://img.shields.io/badge/Hostinger-avilamix.shop-FFD700?style=for-the-badge&logo=cloudflarepages)](https://avilamix.shop)
[![GitHub Repository](https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github)](https://github.com/jeanavila997-ux/Mestre-do-PC-V10)
[![Git Clone](https://img.shields.io/badge/Git-Clone%20HTTPS-1081C2?style=for-the-badge&logo=git)](https://github.com/jeanavila997-ux/Mestre-do-PC-V10.git)
[![Issues](https://img.shields.io/github/issues/jeanavila997-ux/Mestre-do-PC-V10?style=for-the-badge)](https://github.com/jeanavila997-ux/Mestre-do-PC-V10/issues)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6?style=for-the-badge&logo=windows)](https://github.com/jeanavila997-ux/Mestre-do-PC-V10)

Aplicativo local de diagnóstico, manutenção e automação do Windows com interface web V10, integração opcional com IA local (Ollama) e servidor MCP (*Model Context Protocol*).

---

## 🔗 Links Oficiais do Projeto

- 🌍 **Website Oficial (GitHub Pages):** [https://jeanavila997-ux.github.io/Mestre-do-PC-V10/index.html](https://jeanavila997-ux.github.io/Mestre-do-PC-V10/index.html)
- 🌟 **Mirror Hostinger:** [https://avilamix.shop](https://avilamix.shop)
- 🌐 **Repositório GitHub:** [https://github.com/jeanavila997-ux/Mestre-do-PC-V10](https://github.com/jeanavila997-ux/Mestre-do-PC-V10)
- 📦 **Clone URL:** `https://github.com/jeanavila997-ux/Mestre-do-PC-V10.git`
- 🐛 **Reportar Problemas / Issues:** [https://github.com/jeanavila997-ux/Mestre-do-PC-V10/issues](https://github.com/jeanavila997-ux/Mestre-do-PC-V10/issues)
- 🔀 **Pull Requests:** [https://github.com/jeanavila997-ux/Mestre-do-PC-V10/pulls](https://github.com/jeanavila997-ux/Mestre-do-PC-V10/pulls)
- 🖥️ **Painel Local:** `http://127.0.0.1:7777` *(quando o launcher estiver ativo)*

---

## 🚀 Principais Recursos

- **Diagnóstico Completo:** Análise em tempo real de memória RAM, disco, processos, rede e saúde do sistema.
- **Limpeza e Reparo:** Automação de tarefas de manutenção, limpeza de arquivos temporários e otimização do Windows.
- **Servidor MCP Integrado:** Mais de 480 ferramentas publicadas via protocolo MCP (`stdio` e `HTTP-SSE`) para assistentes como Claude Code, VS Code, Codex e Google Antigravity SDK.
- **Integração com IA (Ollama):** Suporte nativo a modelos locais e cloud (Qwen, Kimi, GLM, Gemma, etc.) para análise de logs e suporte interativo.
- **Execução Segura:** Controle estrito via whitelist (`v10/allowed-operations.json`), validação de tokens e auditoria com logs.

---

## 💻 Requisitos do Sistema

- **Sistema Operacional:** Windows 10 ou Windows 11 (64 bits).
- **Shell:** PowerShell 5.1 ou PowerShell 7+ (pwsh).
- **Node.js:** Versão **22.13.0** ou superior.
- **Ollama (Opcional):** Para recursos de IA generativa e assistência inteligente local.

---

## 📥 Instalação e Desenvolvimento

### 1. Clonar o Repositório

```powershell
git clone https://github.com/jeanavila997-ux/Mestre-do-PC-V10.git
cd Mestre-do-PC-V10
```

### 2. Configurar o Servidor MCP

```powershell
cd mcp-server
npm ci
npm test
```

### 3. Iniciar o Painel / Launcher Local (V10)

```powershell
cd ..\v10
npm install
npm start
```

Ou execute o script de inicialização rápida:
```powershell
.\start-mestre.bat
```

---

## 🛡️ Segurança e Whitelist

O launcher executa exclusivamente comandos cadastrados na whitelist em [`v10/allowed-operations.json`](v10/allowed-operations.json).
- Comandos com parâmetros são sanitizados para evitar injeção.
- O Modo Livre é estritamente opt-in e requer aprovação explícita para cada execução.
- Todas as ações são auditadas e salvas em `logs/audit/`.

Consulte o arquivo [SECURITY.md](SECURITY.md) para diretrizes de segurança completas.

---

## 📂 Estrutura do Repositório

| Diretório | Descrição |
| :--- | :--- |
| [`v10/`](v10/) | Interface web do usuário e backend do launcher local (`127.0.0.1:7777`). |
| [`mcp-server/`](mcp-server/) | Servidor MCP com mais de 480 ferramentas de automação e integração de IA. |
| [`dist/site/`](dist/site/) | Landing page e documentação estática do projeto. |
| [`docs/`](docs/) | Guias de arquitetura, instalação, segurança e integrações. |
| [`scripts/`](scripts/) | Scripts utilitários de automação, validação e sincronização Git. |
| [`browser-extension/`](browser-extension/) | Extensão para navegadores (Chrome / Firefox). |
| [`startup/`](startup/) | Atalhos e arquivos de inicialização do sistema. |

---

## 📝 Integrações Adicionais

- **Notepad++:** O Mestre do PC pode ser acionado diretamente pelo Notepad++ para explicar código, analisar logs e sugerir comandos. Consulte [docs/notepad-plus-plus-integration.md](docs/notepad-plus-plus-integration.md).
- **Extensão de Navegador:** Integração rápida via [browser-extension/README.md](browser-extension/README.md).

---

## 📜 Licença

Distribuído sob a licença **MIT**. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---
*Desenvolvido por **Jean Carlos de Avila** — [GitHub @jeanavila997-ux](https://github.com/jeanavila997-ux)*
