---
description: Verifica, reinicia e reporta o status do Mestre do PC V10 (launcher, MCP e porta 7777)
argument-hint: "[restart | ui | logs] (opcional)"
---

# Mestre do PC V10 — verificação e ativação

Execute os passos em ordem. O argumento "$ARGUMENTS" ajusta o comportamento:
- *(vazio)* → apenas health-check + relatório.
- `restart` → força reinício do launcher (Passo 2).
- `ui` → health-check + abrir a interface no navegador.
- `logs` → pular direto ao diagnóstico de logs (Passo 3).

## Passo 1 — Health-check

```
curl -s -m 5 http://127.0.0.1:7777/ping
```

- JSON com `"status":"ok"` → reporte `version`, `admin`, `state`, `activeJobs` e `pid`.
  - Se `$ARGUMENTS` for `ui`, abra `http://127.0.0.1:7777` no navegador padrão antes do relatório.
  - Se `$ARGUMENTS` for vazio, encerre com o relatório final.
- Sem resposta, OU `$ARGUMENTS` == `restart` → Passo 2.

## Passo 2 — Iniciar/reiniciar o launcher

1. Diagnóstico prévio (leitura, seguro):
   ```
   pwsh mcp-server/check-status.ps1
   ```
2. Iniciar o launcher:
   ```
   pwsh mcp-server/start-launcher.ps1
   ```
   > **Aviso ao usuário antes de rodar:** o launcher executa como **ADMINISTRADOR** — o UAC
   > do Windows aparecerá; o usuário deve clicar em **"Sim"**.
3. Aguarde ~15 s e repita o health-check do Passo 1 (máx. 5 tentativas, 1 por vez, com pausa).

## Passo 3 — Diagnóstico (falha persistente ou `$ARGUMENTS` == `logs`)

Verifique, sem editar nada:
- Últimas 30 linhas de `launcher.log` e do arquivo mais recente em `logs\`;
- Tarefas agendadas:
  ```
  schtasks /query /tn MestreDoPC_Admin_Launcher /v /fo LIST
  schtasks /query /tn MestreDoPC_Startup /v /fo LIST
  ```
- Ollama ativo: `ollama ps`;
- Porta em conflito: `netstat -ano | findstr :7777`.

## Passo 4 — Relatório final

Apresente uma tabela:

| Item | Valor |
|---|---|
| Launcher (:7777) | ok / fora do ar |
| Versão / PID | … / … |
| State / activeJobs | … / … |
| Tarefa `MestreDoPC_Admin_Launcher` | Ready / Running / ausente |
| Ollama | modelo carregado ou offline |

- Se tudo ok: feche em uma linha confirmando que o Mestre do PC está pronto.
- Se falhou: cause provável + comando sugerido para o usuário.

## Regras de segurança

- **NUNCA** edite `v10/allowed-operations.json` sem pedir confirmação explícita (é a whitelist de segurança do sistema).
- Não invente resultados: só reporte o que os comandos realmente retornaram. Erro é dado diagnóstico, não motivo para reescrever a história.
- Não desinstale nem reregistre tarefas agendadas sem pedido explícito do usuário.