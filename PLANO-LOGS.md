# Plano de Implementação: Sistema de Log de Eventos - Mestre do PC V10

Este documento detalha o plano para a criação de um sistema de logs automatizado para monitorar a saúde, execuções e erros do Mestre do PC V10.

## 1. Objetivos
O objetivo é ter um registro histórico (audit trail) de tudo o que acontece com o sistema, facilitando a depuração de erros e a análise de performance sem a necessidade de monitorar o terminal em tempo real.

## 2. Estrutura de Arquivos
Propomos a criação de uma pasta dedicada para logs para evitar a poluição do diretório raiz:
- **Caminho:** `C:\Users\JEANPC\Mestre-do-PC-V10\logs\`
- **Arquivos principais:**
    - `system.log`: Logs gerais de inicialização e desligamento.
    - `launcher.log`: Logs específicos do processo Node.js (`launcher.js`).
    - `mcp.log`: Logs de interação com o MCP Server e Claude.
    - `errors.log`: Registro exclusivo de exceções e falhas críticas.

## 3. Estratégia de Gravação
Para cada evento, o log deverá seguir o formato:
`[YYYY-MM-DD HH:mm:ss] [NÍVEL] [MÓDULO] Mensagem do evento`

**Níveis de Log:**
- `INFO`: Operações normais (ex: "Launcher iniciado").
- `WARN`: Alertas que não impedem o funcionamento (ex: "Ollama demorando a responder").
- `ERROR`: Falhas que interrompem funcionalidades (ex: "Porta 7777 ocupada").
- `CRITICAL`: Falhas que derrubam o sistema.

## 4. Plano de Implementação Técnica

### Fase 1: Infraestrutura (PowerShell)
Modificar o script `start-mestre-v10.ps1` para:
- Criar a pasta `\logs` caso não exista.
- Redirecionar a saída do terminal (`stdout` e `stderr`) para os arquivos `.log` usando `Tee-Object` (para que apareça na tela e no arquivo simultaneamente).

### Fase 2: Integração Node.js (`launcher.js`)
Implementar ou configurar a biblioteca `winston` ou `morgan` no `launcher.js` para que cada requisição HTTP recebida no porto 7777 seja registrada no `launcher.log`.

### Fase 3: Automação de Manutenção (Rotation)
Criar um script de limpeza para evitar que os arquivos de log cresçam indefinidamente:
- Manter logs apenas dos últimos 7 dias.
- Compactar logs antigos em `.zip` antes de deletar.

## 5. Próximos Passos
1. [ ] Criar a pasta de logs.
2. [ ] Atualizar o script de inicialização para capturar a saída.
3. [ ] Testar a gravação de erros simulados.
