# Design: Painel NVIDIA no Mestre do PC V10

**Data:** 2026-11-08  
**Status:** aguardando aprovação  
**Repo:** `C:\Users\Jean\Projetos\Mestre-do-PC-V10`

## Intent

Dar ao Jean um painel NVIDIA no launcher (`:7777`), no mesmo espírito do Diagnóstico de Rede: cards ao vivo, atalhos via `/run`, histórico local, sem depender do MCP `nvidia-app` na UI.

## Goals

- Mostrar GPU, driver, VRAM usada/total, utilização GPU/memória, temperatura e potência quando `nvidia-smi` estiver disponível.
- Botões de atalho que disparam operações whitelistadas (`nvidia_*`).
- Categoria **NVIDIA** na lista de comandos do Mestre.
- Intervalo configurável (igual Rede: 5/15/30 min / 1h) e TESTAR / ATIVAR / PARAR.
- Funcionar no Acer Nitro 5 (RTX 3050 Laptop 4 GB, driver Game Ready 621.14).

## Non-goals

- Controles do NVIDIA App (Overlay, Battery Boost, WhisperMode) nesta entrega.
- Integração MCP `nvidia-app` na UI.
- Página mobile dedicada (só desktop `index.html` + ops que o mobile já lista por categoria, se a API de ops as expuser).
- Análise IA (bloco opcional do Rede fica de fora na v1).
- DDU / reinstalação forçada de driver.

## Anti-goals

- Comandos destrutivos disfarçados de diagnóstico.
- Confiar no número “memória total ~12 GB” da App como VRAM útil (teto real = dedicada 4 GB).
- Quebrar o painel Rede ou exigir restart complexo além do reloadRegistry / restart do launcher quando a whitelist mudar.

## Constraints

- Ops só via `v10/allowed-operations.json` + `/classify` + `/run` (header `X-Mestre-Client: v10-web`).
- Scripts PowerShell seguros; saída via `textContent` nos atalhos.
- `nvidia-smi` em `C:\Windows\System32\nvidia-smi.exe` (confirmado neste host).
- Servir o JS pelo launcher (rota estática como `/rede-dashboard.js`).
- Após editar whitelist: `reloadRegistry` ou restart do processo em `:7777`.

## Approaches considered

1. **Espelhar Rede Dashboard (escolhido)** — `nvidia-dashboard.js` injeta `#nvidia-dash` em `#dashboard`, cards + quick ops + histórico; ops `nvidia_*` na whitelist. Trade-off: mais código JS, mas UX familiar e consistente.
2. **Só categoria + comandos** — sem painel dedicado. Trade-off: mais barato, sem monitoramento contínuo.
3. **Rede + controles do NVIDIA App** — Overlay/Battery Boost. Trade-off: frágil (processos/respawn nvcontainer); fora de escopo v1.

## How (v1)

### Arquivos

| Arquivo | Mudança |
|---------|---------|
| `v10/nvidia-dashboard.js` | Novo módulo (padrão `RedeDashboard`) |
| `v10/index.html` | `<script src="nvidia-dashboard.js" defer>` |
| `v10/launcher.js` | Rota estática `/nvidia-dashboard.js` |
| `v10/allowed-operations.json` | Ops categoria `NVIDIA` |
| `mcp-server/test/…` | Teste mínimo de whitelist dos novos IDs (se já houver padrão semelhante) |
| `docs/NVIDIA-DIAGNOSTICO.md` | Doc curta espelhando `REDE-DIAGNOSTICO.md` (opcional se o tempo apertar; preferível incluir) |

### Ops propostas (whitelist)

Todas `destructive: false`, category `NVIDIA`:

| id | Função |
|----|--------|
| `nvidia_status` | Query CSV `nvidia-smi` (nome, driver, temp, util GPU/mem, VRAM total/usada/livre, power, clocks) — op principal do ciclo do painel |
| `nvidia_smi` | `nvidia-smi` tabela completa (atalho) |
| `nvidia_processos` | `nvidia-smi --query-compute-apps=…` / processes |
| `nvidia_driver` | Driver + data via WMI/`nvidia-smi` |
| `nvidia_vram` | Resumo VRAM dedicada vs shared (WMI + smi) |
| `nvidia_abrir_app` | Abre NVIDIA App se instalado (`Start-Process` no executável conhecido) |
| `nvidia_limpar_dxcache` | Limpa `%LOCALAPPDATA%\NVIDIA\DXCache` (já existe ideia em `limpar_cache_de_sombras_gpu`; esta versão NVIDIA-only, com confirmação verbal na description) |

Ops genéricas existentes (`info_gpu`, `placa_de_video_gpu`, etc.) **permanecem**; não são removidas nesta entrega.

### UI do painel

- Cards: GPU (nome curto), Driver, Temp °C, Util %, VRAM usada/total, Power W.
- Linha info: clocks, UUID curto, PCIe se fácil via smi.
- Quick buttons: Status, Processos, Driver, VRAM, nvidia-smi, Abrir App, Limpar DXCache.
- Histórico localStorage (`nvidiaDashHistorico`) com hora / temp / util / VRAM.
- Sem bloco IA na v1.
- Tema visual: acento verde NVIDIA (`#76b900`) em vez do ciano do Rede; mesma estrutura de grid `1 / -1`.

### Ciclo de monitoramento

- Uma op `nvidia_status` por ciclo (não encadear várias `/run` como Rede faz com Wi-Fi) — evita 429/busy.
- Intervalos: 5 / 15 / 30 / 60 min (default 5).
- Parse da saída CSV no JS; cores warn/err para temp (>70 / >85) e VRAM (>80% / >95% de 4096).

### Builder calls (decididos aqui)

- Prefixo de IDs: `nvidia_`.
- Não tocar mobile `app.js` além do que a API de ops já lista.
- Não reutilizar `monitorar_temperatura_gpu` (depende de OpenHardwareMonitor); preferir `nvidia-smi`.

## Success

- Em `http://127.0.0.1:7777/`, painel NVIDIA visível abaixo/ao lado do fluxo do dashboard.
- TESTAR preenche cards com dados reais da RTX 3050.
- Atalhos mostram saída no `<pre>` do painel.
- `/classify` + `/run` aceitam os novos IDs com cliente `v10-web`.
- Rede Dashboard continua intacto.

## What’s left to the implementer

- Detalhe do parse CSV e mensagens PT-BR.
- Texto exato das descriptions.
- Onde inserir o painel relativo ao Rede (após `#rede-dash` se existir, senão append em `#dashboard`).
- Cobertura de teste mínima alinhada ao repo.
