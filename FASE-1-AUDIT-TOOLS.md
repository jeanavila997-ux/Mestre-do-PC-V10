# FASE 1 — Auditoria e Refatoração de Tools

**Objetivo:** Reescrever descriptions em linguagem de intenção (não implementação).

**Data:** 23/08/2026  
**Status:** Auditoria em andamento

---

## Padrão Atual vs. Alvo

### ❌ Problema: Descriptions focam em COMO

```
"Executa uma limpeza rápida completa..."
"Executa o sfc /scannow..."
"Faz um diagnóstico..."
```

### ✅ Alvo: Descriptions focam em QUANDO e POR QUÊ

```
"Limpa o sistema removendo arquivos temporários. Use quando o PC está lento ou ocupando espaço."
"Verifica e repara arquivos corrompidos. Use quando há erros de sistema ou travamentos."
"Diagnostica saúde completa do PC. Retorna RAM, disco, rede e processos pesados."
```

---

## Categorização de Ferramentas

### 📊 DIAGNÓSTICO (Leitura - Seguro)

| ID | Description Atual | ✅ Nova Description |
|----|-------------------|-------------------|
| `verificar_espaco_em_disco` | Verifica e retorna o espaço usado... | **Mostra espaço livre/usado em todos os discos. Use para confirmar se o HD está cheio ou para planejar limpeza.** |
| `diagnostico_completo` | Executa um diagnóstico completo... | **Diagnóstico completo do PC: RAM, disco, processos pesados, rede e sistema. Use para triagem rápida de problemas.** |
| `relatorio_rapido_do_pc` | Gera um relatório rápido... | **Gera relatório resumido: Windows, CPU, RAM, disco C, uptime, top 10 processos e internet. Use para situação geral rápida.** |
| `ver_uso_ram` | Retorna o status atual mostrando... | **Mostra memória RAM livre e total. Use quando o PC está lento ou travando.** |
| `listar_processos_por_uso_de_ram` | Lista os 15 processos... | **Lista os 15 processos que mais consomem RAM. Use para identificar aplicações causando lentidão.** |
| `verificar_saude_do_disco_smart` | Verifica a saúde do disco... | **Verifica saúde do disco via S.M.A.R.T. Use para detectar falhas no HD antes que ele quebre.** |
| `temperatura_do_cpu_wmi` | Tenta obter a temperatura da CPU... | **Mostra temperatura atual do processador. Use quando o PC está esquentando ou travando.** |
| `diagnostico_de_rede_completo` | Faz um diagnóstico mostrando... | **Mostra configuração completa de rede (IP, DNS, gateways, etc.). Use para diagnosticar problemas de conexão.** |
| `informacoes_do_sistema` | Lista o nome do produto... | **Mostra specs do PC: Windows, processador, memória total, arquitetura. Use para validar hardware.** |

### 🔧 MANUTENÇÃO & LIMPEZA (Escrita - Requer confirmação)

| ID | Description Atual | ✅ Nova Description | Confirmação? |
|----|-------------------|-------------------|--------------|
| `limpeza_rapida_completa` | Executa uma limpeza rápida... | **Limpa arquivos temporários e esvazia lixeira. Use quando o PC está lento ou espaço em disco está baixo.** | ✅ SIM |
| `esvaziar_lixeira` | Esvazia silenciosamente... | **Esvazia a lixeira permanentemente. Use quando espaço em disco está crítico.** | ✅ SIM |
| `limpar_cache_do_windows_update` | Limpa o cache do WU... | **Remove cache do Windows Update para liberar espaço. Use se Update estiver com problemas ou espaço cheio.** | ✅ SIM |
| `limpar_eventviewer_logs` | Limpa todos os logs... | **Limpa logs do Event Viewer. Cuidado: apaga histórico de erros. Use apenas em limpeza profunda.** | ✅ SIM |
| `limpar_thumbnail_cache` | Limpa o cache de miniaturas... | **Remove cache de miniaturas. Use se preview de imagens estiver lenta.** | ✅ SIM |

### ⚡ PERFORMANCE (Escrita - Requer confirmação)

| ID | Description Atual | ✅ Nova Description | Confirmação? |
|----|-------------------|-------------------|--------------|
| `liberar_memoria_ram_imediatamente` | Tenta liberar RAM... | **Força liberação de memória RAM. Use quando aplicações estão travando por falta de RAM.** | ⚠️ Parcial |
| `reiniciar_explorer` | Reinicia o Windows Explorer... | **Reinicia Windows Explorer (interface gráfica). Use quando ícones não atualizam ou menus não respondem.** | ⚠️ Parcial |

### 🛡️ SEGURANÇA & SISTEMA (Escrita - Requer confirmação)

| ID | Description Atual | ✅ Nova Description | Confirmação? |
|----|-------------------|-------------------|--------------|
| `sfc_scan_reparo_de_arquivos` | Executa o sfc /scannow... | **Verifica e repara arquivos corrompidos do Windows. Use quando há erros de sistema ou travamentos frequentes.** | ✅ SIM |
| `dism_restaurar_saude` | Executa a restauração... | **Restaura integridade da imagem Windows (DISM). Use após SFC falhar ou para problemas graves de sistema.** | ✅ SIM |
| `verificar_status_do_windows_defender` | Verifica o status... | **Mostra status do Windows Defender (antivírus). Use para confirmar proteção em tempo real.** | ❌ Não |
| `scan_rapido_com_defender` | Executa um scan rápido... | **Inicia scan rápido do antivírus. Use se suspeita de malware ou rotina de segurança mensal.** | ⚠️ Parcial |

### 🔌 REDE (Escrita - Requer confirmação)

| ID | Description Atual | ✅ Nova Description | Confirmação? |
|----|-------------------|-------------------|--------------|
| `flush_e_renovar_ip` | Faz o flush do DNS... | **Renova conexão de rede (flush DNS, release/renew IP). Use quando internet não conecta ou anda lenta.** | ⚠️ Parcial |

### 🔂 SERVIÇOS & PROCESSOS (Escrita - PERIGOSO - Requer confirmação)

| ID | Description Atual | ✅ Nova Description | Confirmação? |
|----|-------------------|-------------------|--------------|
| `encerrar_processo` | Encerra um processo... | **Encerra aplicação ativa. Use quando programa trava e não responde. ⚠️ CUIDADO: pode perder dados.** | ✅ SIM MANDATÓRIO |
| `desativar_servico` | Desativa e para um serviço... | **Desativa serviço Windows. ⚠️ AVISO: pode quebrar sistema. Só use se sabe o que faz.** | ✅ SIM MANDATÓRIO |

### 📂 GIT (Leitura/Escrita mínima)

| ID | Description Atual | ✅ Nova Description |
|----|-------------------|-------------------|
| `git_status_do_projeto` | Executa 'git status'... | **Mostra status do repositório local (arquivos modificados, commits, branches). Use antes de commitar.** |
| `git_pull_atualizar_local` | Executa 'git pull'... | **Atualiza repositório local com mudanças remotas. Use para sincronizar com equipe.** |

### 🗂️ SISTEMA (Navegação - Seguro)

| ID | Description Atual | ✅ Nova Description |
|----|-------------------|-------------------|
| `abrir_windows_terminal` | Abre uma nova janela... | **Abre Windows Terminal. Use para tarefas de linha de comando avançadas.** |
| `abrir_windows_terminal_no_projeto` | Abre o WT já na pasta... | **Abre Windows Terminal na pasta do projeto. Use para desenvolvimento.** |
| `abrir_cmd_no_projeto` | Abre o Prompt de Comando... | **Abre CMD (Prompt de Comando) na pasta do projeto. Use para tarefas de sistema.** |
| `abrir_pasta_logs` | Abre a pasta logs... | **Abre pasta de logs em Explorer. Use para revisar histórico de operações.** |
| `listar_modelos_ollama` | Lista modelos disponíveis... | **Mostra modelos de IA disponíveis no Ollama. Use para confirmar qual modelo está ativo.** |

### 📋 AGENDAMENTO & STATUS

| ID | Description Atual | ✅ Nova Description |
|----|-------------------|-------------------|
| `ver_tarefas_mestredopc` | Lista tarefas agendadas... | **Mostra tarefas automáticas agendadas do MestreDoPC. Use para confirmar se rotinas estão rodando.** |
| `exportar_diagnostico_para_logs` | Exporta um diagnóstico... | **Salva relatório de diagnóstico em arquivo. Use para documentar estado do PC em determinado momento.** |

---

## 🎯 Padrão de Confirmação

### Operações que SEMPRE exigem confirmação (Destrutivas)

```
✅ MANDATÓRIO:
- encerrar_processo
- desativar_servico
- limpeza_rapida_completa
- esvaziar_lixeira
- limpar_cache_do_windows_update
- limpar_eventviewer_logs
- sfc_scan_reparo_de_arquivos
- dism_restaurar_saude

⚠️ PARCIAL (só se afeta experiência):
- liberar_memoria_ram_imediatamente
- reiniciar_explorer
- flush_e_renovar_ip
- scan_rapido_com_defender

❌ NENHUMA:
- Tudo em diagnóstico (apenas leitura)
- Navegação/interface
```

---

## 📋 Checklist FASE 1

- [ ] **1. Reescrever todas as descriptions** (40 tools approx)
  - [ ] 1.1 Diagnóstico (9 tools)
  - [ ] 1.2 Limpeza (5 tools)
  - [ ] 1.3 Performance (2 tools)
  - [ ] 1.4 Segurança (4 tools)
  - [ ] 1.5 Rede (1 tool)
  - [ ] 1.6 Serviços/Processos (2 tools - PERIGOSO)
  - [ ] 1.7 Git (2 tools)
  - [ ] 1.8 Sistema/Navegação (8 tools)
  - [ ] 1.9 Agendamento/Status (2 tools)

- [ ] **2. Adicionar confirmação explícita**
  - [ ] 2.1 Marcar todas operações destrutivas
  - [ ] 2.2 Adicionar `requiresApproval: true` no JSON Schema
  - [ ] 2.3 Gerar modal de confirmação no launcher

- [ ] **3. Padronizar retornos**
  - [ ] 3.1 Formato: `{ success: bool, message: string, data: any }`
  - [ ] 3.2 Erro: `{ success: false, error: string, code: "ERROR_CODE" }`
  - [ ] 3.3 Avisos: `{ success: true, message: "OK", warnings: ["aviso 1"] }`

- [ ] **4. Revisar `allowed-operations.json`**
  - [ ] 4.1 Conferir que IDs em `.json` == IDs em `index.js`
  - [ ] 4.2 Adicionar `destructive: true` nos apropriados
  - [ ] 4.3 Adicionar `requiresApproval` onde necessário

- [ ] **5. Testes**
  - [ ] 5.1 Rodar `npm test` após mudanças
  - [ ] 5.2 Testar cada tool confirmação com Claude Desktop
  - [ ] 5.3 Verificar descriptions aparecem corretamente no MCP

---

## Próximas Ações

**Esta semana:**
1. Reescrever descriptions no `index.js` (mcp-server)
2. Atualizar JSON Schema com `requiresApproval`
3. Implementar modal de confirmação no launcher
4. Validar com testes

**Resultado esperado:**
- Agente entende quando usar cada tool
- Agente pede confirmação automática para operações perigosas
- Retornos padronizados e legíveis

---

**Documento criado:** 23/08/2026  
**Responsável:** Phase 1 Refactor
