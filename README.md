# Mestre do PC V10

Aplicativo local de diagnóstico e manutenção do Windows com interface V10, integração opcional com Ollama e servidor MCP.

## Recursos

- diagnóstico de memória, disco, rede e sistema;
- limpeza e reparos do Windows;
- painel local em `http://127.0.0.1:7777`;
- integração opcional com Ollama;
- servidor MCP para agentes compatíveis;
- execução restrita a operações cadastradas.

## Requisitos

- Windows 10 ou Windows 11, 64 bits;
- PowerShell 5.1 ou superior;
- Node.js 22.13 ou superior para a versão atual;
- Ollama opcional.

## Instalação para desenvolvimento

```powershell
git clone https://github.com/jeanavila997-ux/Mestre-do-PC-V10.git
cd Mestre-do-PC-V10

cd mcp-server
npm ci
npm test

cd ..\v10
npm install
npm start
```

## Segurança

O launcher executa por padrão apenas comandos cadastrados em `v10/allowed-operations.json`. O Modo Livre é opt-in, exige confirmação no chat para cada comando e registra a execução em auditoria.

Este projeto executa funções administrativas. Leia [SECURITY.md](SECURITY.md) antes de usar em computadores de produção.

## Estrutura

- `v10/`: interface e launcher local;
- `mcp-server/`: integração MCP;
- `docs/`: documentação;
- `startup/`: arquivos auxiliares de inicialização;
- `v10/notepad-plus-plus/`: integração com Notepad++.

## Integração com Notepad++

O Mestre do PC pode ser invocado diretamente do Notepad++ para explicar código, perguntar à IA, sugerir comandos, gerar diagnósticos e buscar na web. Veja [docs/notepad-plus-plus-integration.md](docs/notepad-plus-plus-integration.md).

## Produto comercial

Licenciamento por computador, pagamentos, painel administrativo e chaves de assinatura não fazem parte deste repositório público.

## Licença

MIT. Consulte [LICENSE](LICENSE).
