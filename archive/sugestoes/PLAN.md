# Plano de ajuste e melhorias do Mestre do PC

## Resumo

Manter o Modo Livre para chat e MCP, permitindo qualquer comando PowerShell em um launcher exclusivamente local. Atualizar a base para Node 22.13+ e corrigir a injeção na operação parametrizada de teste HTTPS.

## Mudanças principais

- Fixar Node 22.13+ como mínimo em `package.json`, documentação, instaladores e CI; criar um bootstrap que rejeite versões incompatíveis antes de carregar `node:sqlite`.
- Corrigir o renderizador de parâmetros: valores inseridos em comandos PowerShell deverão usar codificação contextual segura; migrar o teste HTTPS para URI validada e literal PowerShell sem expansão de `$()`. Cobrir todos os templates parametrizados com a mesma regra.
- Manter `/run-free`, mas limitar o launcher permanentemente a loopback (`127.0.0.1`/`::1`); falhar no boot se houver tentativa de bind externo.
- Substituir autorização baseada só em header/origin por um segredo por instalação: MCP o recebe via `MESTRE_LAUNCHER_TOKEN`; UI local usa sessão `HttpOnly`, `SameSite=Strict` e proteção CSRF. Exigir autenticação também em status de jobs e demais rotas sensíveis.
- Transformar o Modo Livre em uma capacidade temporária, ligada ao cliente e expirada em 5 minutos; iniciar sempre desligado e remover a persistência após reinicialização.
- No chat principal e no chat integrado, exibir todo comando proposto em modal com texto integral, origem e aviso de risco; somente “Executar” dispara `/run-free`. O MCP poderá ativar e usar o modo com seu segredo, dentro da janela temporária.
- Preservar o catálogo whitelist para execução normal; o Modo Livre será uma rota e ação explicitamente separadas, visíveis no histórico e auditoria.
- Registrar execução livre com origem, horário, hash do comando, resultado, duração e código de saída; redigir segredos no preview e nunca imprimir comandos completos no console por padrão.
- Encerrar árvore de processos em timeout/cancelamento, adicionar cancelamento de job e impor os limites atuais de concorrência e duração também ao Modo Livre.
- Atualizar README, SECURITY e telas para declarar claramente a execução livre, suas confirmações e a restrição a este computador.

## Interfaces e contratos

- `POST /modo-livre` passa a criar/remover uma capacidade temporária vinculada ao cliente autenticado.
- `POST /run-free` exige capacidade válida; retorna `jobId`, expiração e metadados de auditoria, sem aceitar chamadas fora de loopback.
- Novos requisitos de autenticação para `/run`, `/run-free`, `/run-status`, `/classify`, `/shutdown`, memórias e APIs de chat.
- O catálogo de parâmetros passa a suportar metadados de codificação/formato, mantendo compatibilidade controlada com os templates existentes.

## Testes

- Regressão de injeção: URL contendo `$(whoami)`, aspas, backticks e separadores nunca pode ser executada.
- Startup em Node 22.13+ e erro claro em Node 20.
- Fluxos de chat: modo desligado, ativação, cancelamento do modal, confirmação por comando, expiração e reativação.
- Fluxos MCP: token ausente/inválido, ativação válida, comando livre válido, expiração e auditoria.
- Bloqueio de bind externo, acesso não autenticado a jobs e encerramento da árvore de processos.
- CI instala também `v10/`, executa testes de integração do launcher em Node 22 e mantém verificações da extensão/MCP.

## Premissas adotadas

- O launcher permanece exclusivo para o computador local.
- O chat executa qualquer comando somente após confirmação explícita para cada comando.
- O MCP pode executar comandos livres, mas apenas com segredo de instalação e uma autorização temporária.
- Node 22.13+ é o requisito oficial do produto.
