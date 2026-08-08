#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { sanitizeToolArgument, checkPromptInjection } from "./security.js";

const MESTRE_BASE_URL = (process.env.MESTRE_BASE_URL || "http://127.0.0.1:7777").replace(/\/+$/, "");
const MESTRE_RUN_URL = MESTRE_BASE_URL + "/run";
const MESTRE_STATUS_URL = MESTRE_BASE_URL + "/run-status";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function executeLauncherCommand(commandOrPayload, options = {}) {
  const payload = typeof commandOrPayload === "string" ? { cmd: commandOrPayload } : commandOrPayload;

  const submitRes = await fetch(MESTRE_RUN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Mestre-Client": "mcp",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(options.submitTimeoutMs || 10000),
  });

  const submitData = await submitRes.json();
  if (
    submitRes.ok === false ||
    submitData.success !== true ||
    submitData.accepted !== true ||
    submitData.jobId == null
  ) {
    throw new Error(submitData.output || "Falha ao enviar comando para o Launcher.");
  }

  const timeoutMs = options.timeoutMs || 900000;
  const pollIntervalMs = options.pollIntervalMs || 1200;
  const statusTimeoutMs = options.statusTimeoutMs || 5000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const statusRes = await fetch(
      MESTRE_STATUS_URL + "?id=" + encodeURIComponent(submitData.jobId),
      { signal: AbortSignal.timeout(statusTimeoutMs) },
    );
    const statusData = await statusRes.json();

    if (statusRes.ok === false) {
      throw new Error(statusData.output || "Falha ao consultar status do Launcher.");
    }

    if (statusData.state === "running") {
      await sleep(pollIntervalMs);
      continue;
    }

    return statusData;
  }

  throw new Error("Timeout aguardando conclusão do comando no Launcher.");
}

const server = new Server(
  {
    name: "mestre-do-pc-mcp",
    version: "1.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Mapeamento das ferramentas MCP para comandos/IDs do Mestre do PC V10.
// Comandos sem parâmetros podem usar apenas {id} (o launcher resolve em allowed-operations.json).
// Comandos com {{TOKEN}} enviam {id, params} e o launcher valida+substitui de forma segura.
const mestreTools = {
  limpeza_rapida_completa: {
    id: "limpeza_rapida_completa",
    description: "Executa uma limpeza rápida completa no sistema: esvazia a lixeira e limpa pastas temporárias.",
    command: 'Remove-Item "$env:TEMP\\*" -Recurse -Force -EA 0; Remove-Item "C:\\Windows\\Temp\\*" -Recurse -Force -EA 0; Clear-RecycleBin -Force -EA 0; Write-Host "✅ Limpeza concluida!" -ForegroundColor Green',
  },
  esvaziar_lixeira: {
    id: "esvaziar_lixeira",
    description: "Esvazia silenciosamente a lixeira do Windows.",
    command: 'Clear-RecycleBin -Force -ErrorAction SilentlyContinue; Write-Host "✅ Lixeira esvaziada!" -ForegroundColor Green',
  },
  limpar_cache_windows_update: {
    id: "limpar_cache_windows_update",
    description: "Limpa o cache do Windows Update paralisando e reiniciando o serviço.",
    command: 'Stop-Service wuauserv -Force; Remove-Item "C:\\Windows\\SoftwareDistribution\\Download\\*" -Recurse -Force -EA 0; Start-Service wuauserv; Write-Host "✅ Cache WU limpo!" -ForegroundColor Green',
  },
  limpar_logs_event_viewer: {
    id: "limpar_logs_event_viewer",
    description: "Limpa todos os logs do Event Viewer do Windows.",
    command: 'Get-EventLog -List | ForEach-Object { Clear-EventLog -LogName $_.Log -EA 0 }; Write-Host "✅ Logs de eventos limpos!" -ForegroundColor Green',
  },
  limpar_cache_thumbnail: {
    id: "limpar_cache_thumbnail",
    description: "Limpa o cache de miniaturas (thumbnails) do Windows.",
    command: 'ie4uinit.exe -show; Remove-Item "$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer\\thumbcache_*" -Force -EA 0; Write-Host "✅ Thumbnail cache limpo!" -ForegroundColor Green',
  },
  liberar_memoria_ram: {
    id: "liberar_memoria_ram",
    description: "Tenta liberar a memória RAM imediatamente usando o Garbage Collector do .NET.",
    command: '[System.GC]::Collect(); [System.GC]::WaitForPendingFinalizers(); Write-Host "✅ RAM liberada!" -ForegroundColor Green',
  },
  ver_uso_ram: {
    id: "ver_uso_ram",
    description: "Retorna o status atual mostrando a quantidade de memória RAM livre e o total instalado.",
    command: '$ram = Get-WmiObject Win32_OperatingSystem; $livre = [math]::Round($ram.FreePhysicalMemory/1MB,2); $total = [math]::Round($ram.TotalVisibleMemorySize/1MB,2); Write-Host "RAM Livre: $livre GB de $total GB"',
  },
  listar_processos_alto_consumo_ram: {
    id: "listar_processos_alto_consumo_ram",
    description: "Lista os 15 processos que mais estão consumindo memória RAM no momento.",
    command: 'Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 15 Name,@{N="RAM(MB)";E={[math]::Round($_.WorkingSet64/1MB,2)}} | Format-Table -AutoSize',
  },
  reiniciar_explorer: {
    id: "reiniciar_explorer",
    description: "Reinicia o Windows Explorer (explorer.exe).",
    command: 'Stop-Process -Name explorer -Force; Start-Process explorer; Write-Host "✅ Explorer reiniciado!" -ForegroundColor Green',
  },
  encerrar_processo: {
    id: "encerrar_processo",
    description: "Encerra um processo pelo nome. Informe o parâmetro 'nome' com o nome do processo (ex: chrome, notepad).",
    command: 'Stop-Process -Name "{{NOME}}" -Force -EA 0; if ($?) { Write-Host "✅ Processo {{NOME}} encerrado com sucesso!" -ForegroundColor Green } else { Write-Host "⚠️ Processo {{NOME}} não encontrado ou já encerrado." -ForegroundColor Yellow }',
  },
  desativar_servico: {
    id: "desativar_servico",
    description: "Desativa e para um serviço do Windows pelo nome. Informe 'nome_servico' (ex: wuauserv, SysMain, Spooler).",
    command: 'Set-Service -Name "{{NOME_SERVICO}}" -StartupType Disabled -EA 0; Stop-Service -Name "{{NOME_SERVICO}}" -Force -EA 0; if ($?) { Write-Host "✅ Serviço {{NOME_SERVICO}} desativado!" -ForegroundColor Green } else { Write-Host "⚠️ Serviço {{NOME_SERVICO}} não encontrado." -ForegroundColor Yellow }',
  },
  verificar_espaco_disco: {
    id: "verificar_espaco_disco",
    description: "Verifica e retorna o espaço usado, livre e total de todos os discos.",
    command: 'Get-PSDrive -PSProvider FileSystem | Select-Object Name,@{N="Usado(GB)";E={[math]::Round(($_.Used/1GB),2)}},@{N="Livre(GB)";E={[math]::Round(($_.Free/1GB),2)}},@{N="Total(GB)";E={[math]::Round((($_.Used+$_.Free)/1GB),2)}} | Format-Table -AutoSize',
  },
  verificar_saude_disco: {
    id: "verificar_saude_disco",
    description: "Verifica a saúde do disco (S.M.A.R.T.).",
    command: "Get-WmiObject -Namespace root/wmi -Class MSStorageDriver_FailurePredictStatus | Select-Object PredictFailure,Reason | Format-Table -AutoSize",
  },
  diagnostico_rede: {
    id: "diagnostico_rede",
    description: "Faz um diagnóstico mostrando informações completas da rede (ipconfig /all).",
    command: "ipconfig /all",
  },
  renovar_ip: {
    id: "renovar_ip",
    description: "Faz o flush do DNS e renova o endereço IP da máquina.",
    command: 'ipconfig /flushdns; ipconfig /release; ipconfig /renew; Write-Host "✅ IP renovado!" -ForegroundColor Green',
  },
  reparar_arquivos_sfc: {
    id: "reparar_arquivos_sfc",
    description: "Executa o sfc /scannow para reparar arquivos corrompidos do sistema.",
    command: "sfc /scannow",
  },
  reparar_imagem_dism: {
    id: "reparar_imagem_dism",
    description: "Executa a restauração da imagem do Windows (DISM /RestoreHealth).",
    command: "DISM /Online /Cleanup-Image /RestoreHealth",
  },
  verificar_informacoes_sistema: {
    id: "verificar_informacoes_sistema",
    description: "Lista o nome do produto Windows, arquitetura, nome do PC, Processador e Memória total.",
    command: "Get-ComputerInfo | Select-Object WindowsProductName,WindowsVersion,OsArchitecture,CsName,CsProcessors,CsTotalPhysicalMemory | Format-List",
  },
  verificar_temperatura_cpu: {
    id: "verificar_temperatura_cpu",
    description: "Tenta obter a temperatura da CPU via WMI.",
    command: 'Get-WmiObject MSAcpi_ThermalZoneTemperature -Namespace "root/wmi" | ForEach-Object { Write-Host "Zona: $($_.InstanceName) -> $(($_.CurrentTemperature - 2732)/10)°C" }',
  },
  diagnostico_completo: {
    id: "diagnostico_completo",
    description: "Executa um diagnóstico completo do PC: RAM, disco, rede, processos pesados e informações do sistema.",
    command: 'Write-Host "===== DIAGNÓSTICO COMPLETO =====" -ForegroundColor Cyan; Write-Host ""; Write-Host "--- RAM ---" -ForegroundColor Yellow; $ram = Get-WmiObject Win32_OperatingSystem; $livre = [math]::Round($ram.FreePhysicalMemory/1MB,2); $total = [math]::Round($ram.TotalVisibleMemorySize/1MB,2); Write-Host "RAM Livre: $livre GB de $total GB"; Write-Host ""; Write-Host "--- DISCO ---" -ForegroundColor Yellow; Get-PSDrive -PSProvider FileSystem | Select-Object Name,@{N="Usado(GB)";E={[math]::Round(($_.Used/1GB),2)}},@{N="Livre(GB)";E={[math]::Round(($_.Free/1GB),2)}} | Format-Table -AutoSize; Write-Host "--- TOP 10 PROCESSOS (RAM) ---" -ForegroundColor Yellow; Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 10 Name,@{N="RAM(MB)";E={[math]::Round($_.WorkingSet64/1MB,2)}} | Format-Table -AutoSize; Write-Host "--- REDE ---" -ForegroundColor Yellow; Test-Connection 8.8.8.8 -Count 1 -Quiet | ForEach-Object { if($_){Write-Host "Internet: OK" -ForegroundColor Green}else{Write-Host "Internet: SEM CONEXÃO" -ForegroundColor Red} }',
  },
  relatorio_rapido_pc: {
    id: "relatorio_rapido_pc",
    description: "Gera um relatório rápido do PC com Windows, uptime, RAM, disco C, top 10 processos e internet.",
    command: `Write-Host "===== RELATORIO RAPIDO DO PC =====" -ForegroundColor Cyan; $os=Get-WmiObject Win32_OperatingSystem; $cpu=Get-WmiObject Win32_Processor | Select-Object -First 1; $disk=Get-PSDrive C; $ramLivre=[math]::Round($os.FreePhysicalMemory/1MB,2); $ramTotal=[math]::Round($os.TotalVisibleMemorySize/1MB,2); $diskLivre=[math]::Round($disk.Free/1GB,2); $diskTotal=[math]::Round(($disk.Used+$disk.Free)/1GB,2); $boot=[Management.ManagementDateTimeConverter]::ToDateTime($os.LastBootUpTime); $uptime=New-TimeSpan -Start $boot -End (Get-Date); Write-Host "Computador: $env:COMPUTERNAME"; Write-Host "Windows: $($os.Caption) Build $($os.BuildNumber)"; Write-Host "CPU: $($cpu.Name)"; Write-Host "RAM: $ramLivre GB livre de $ramTotal GB"; Write-Host "Disco C: $diskLivre GB livre de $diskTotal GB"; Write-Host "Uptime: $($uptime.Days)d $($uptime.Hours)h"; Write-Host ""; Write-Host "Top 10 processos por RAM:" -ForegroundColor Yellow; Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 10 Name,@{N="RAM(MB)";E={[math]::Round($_.WorkingSet64/1MB,2)}} | Format-Table -AutoSize; Write-Host ""; if(Test-Connection 8.8.8.8 -Count 1 -Quiet){Write-Host "Internet: OK" -ForegroundColor Green}else{Write-Host "Internet: SEM CONEXAO" -ForegroundColor Red}`,
  },
  exportar_diagnostico: {
    id: "exportar_diagnostico",
    description: "Exporta um diagnóstico rápido para a pasta logs com nome diagnostico-YYYYMMDD-HHMMSS.txt.",
    command: `$project=$env:MESTRE_PROJETO_PATH; $logDir=Join-Path $project "logs"; New-Item -ItemType Directory -Force -Path $logDir | Out-Null; $file=Join-Path $logDir ("diagnostico-"+(Get-Date -Format "yyyyMMdd-HHmmss")+".txt"); $os=Get-WmiObject Win32_OperatingSystem; $disk=Get-PSDrive C; $top=Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 10 Name,@{N="RAM(MB)";E={[math]::Round($_.WorkingSet64/1MB,2)}} | Out-String; @("===== DIAGNOSTICO MESTRE DO PC =====","Data: $(Get-Date)","Computador: $env:COMPUTERNAME","Windows: $($os.Caption) Build $($os.BuildNumber)","RAM livre GB: $([math]::Round($os.FreePhysicalMemory/1MB,2))","Disco C livre GB: $([math]::Round($disk.Free/1GB,2))","",$top) | Set-Content -Path $file -Encoding UTF8; Write-Host "Diagnostico salvo em: $file" -ForegroundColor Green`,
  },
  listar_modelos_ollama: {
    id: "listar_modelos_ollama",
    description: "Lista modelos disponíveis no Ollama local e destaca modelos cloud no texto.",
    command: `try { $data=(Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5); Write-Host "Modelos Ollama instalados:" -ForegroundColor Cyan; if(-not $data.models){ Write-Host "Nenhum modelo retornado pelo Ollama." -ForegroundColor Yellow } else { $data.models | ForEach-Object { $cloud=if($_.name -match "cloud"){ " [cloud]" } else { "" }; Write-Host ("- " + $_.name + $cloud) } } } catch { Write-Host "Ollama offline ou inacessivel em localhost:11434" -ForegroundColor Yellow; Write-Host $_.Exception.Message }`,
  },
  abrir_pasta_logs: {
    id: "abrir_pasta_logs",
    description: "Abre a pasta logs do MestreDoPC no Windows Explorer.",
    command: `$project=$env:MESTRE_PROJETO_PATH; $logDir=Join-Path $project "logs"; New-Item -ItemType Directory -Force -Path $logDir | Out-Null; Start-Process $logDir; Write-Host "Pasta de logs aberta: $logDir" -ForegroundColor Green`,
  },
  ver_tarefas_mestre: {
    id: "ver_tarefas_mestre",
    description: "Lista as tarefas agendadas MestreDoPC_Admin_Launcher e MestreDoPC_Startup, quando existirem.",
    command: `$names=@("MestreDoPC_Admin_Launcher","MestreDoPC_Startup"); $rows=foreach($name in $names){ $task=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue; if($task){ $info=Get-ScheduledTaskInfo -TaskName $name -ErrorAction SilentlyContinue; [pscustomobject]@{Task=$name;State=$task.State;LastRun=$info.LastRunTime;LastResult=$info.LastTaskResult;NextRun=$info.NextRunTime} } else { [pscustomobject]@{Task=$name;State="Nao encontrada";LastRun="";LastResult="";NextRun=""} } }; $rows | Format-Table -AutoSize`,
  },
  git_status: {
    id: "git_status",
    description: "Executa 'git status' na pasta do projeto.",
    command: `Set-Location -LiteralPath $env:MESTRE_PROJETO_PATH; git status`,
  },
  git_pull: {
    id: "git_pull",
    description: "Executa 'git pull' na pasta do projeto.",
    command: `Set-Location -LiteralPath $env:MESTRE_PROJETO_PATH; git pull; Write-Host "\u2705 Repositório atualizado!" -ForegroundColor Green`,
  },
  verificar_defender: {
    id: "verificar_defender",
    description: "Verifica o status do Windows Defender.",
    command: "Get-MpComputerStatus | Select-Object AMRunningMode,AntivirusEnabled,RealTimeProtectionEnabled,AntivirusSignatureLastUpdated | Format-List",
  },
  scan_defender_rapido: {
    id: "scan_defender_rapido",
    description: "Executa um scan rápido no Defender.",
    command: 'Start-MpScan -ScanType QuickScan; Write-Host "✅ Scan rápido iniciado!" -ForegroundColor Green',
  },
};

const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5-coder:3b-instruct";
const OLLAMA_SYSTEM_PROMPT = `Você é o Mestre do PC, um assistente especializado em manutenção de computadores Windows.
Responda SEMPRE em português brasileiro.
Quando sugerir uma ação, inclua o comando PowerShell exato.
NUNCA invente comandos. Use APENAS comandos PowerShell reais do Windows.
Se o usuário pedir para analisar logs, identifique os erros mais críticos e sugira comandos sfc ou dism se necessário.
Seja direto e objetivo.`;

const TOOLS = [
  ...Object.entries(mestreTools).map(([name, config]) => {
    const cmdStr = typeof config.command === "string" ? config.command : "";
    const matches = [...cmdStr.matchAll(/\{\{([A-Z_]+)\}\}/g)];
    const uniqueTokens = [...new Set(matches.map((m) => m[1]))];
    const properties = {};
    for (const token of uniqueTokens) {
      const key = token.toLowerCase();
      properties[key] = { type: "string", description: `Valor para ${token}` };
    }
    return {
      name,
      description: config.description,
      inputSchema: {
        type: "object",
        properties,
        required: uniqueTokens.map((t) => t.toLowerCase()),
      },
    };
  }),
  {
    name: "perguntar_ia",
    description: "Envia uma pergunta ao modelo de IA local (Ollama) para obter sugestões de manutenção. Use para análise inteligente.",
    inputSchema: {
      type: "object",
      properties: {
        pergunta: { type: "string", description: "A pergunta ou problema do usuário sobre o PC." },
      },
      required: ["pergunta"],
    },
  },
  {
    name: "analisar_logs_sistema",
    description: "Coleta os últimos 20 erros do Event Viewer e os envia para a IA local resumir os problemas mais graves.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "verificar_modelo_ollama",
    description: "Verifica se o modelo qwen2.5-coder:3b-instruct está instalado no Ollama e tenta baixá-lo se necessário.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "verificar_prompt",
    description: "Analisa um prompt em busca de tentativas de prompt injection, jailbreak ou conteúdo malicioso. Retorna classificação e score.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "O texto do prompt a ser analisado." },
      },
      required: ["prompt"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "verificar_modelo_ollama") {
    try {
      const res = await fetch(OLLAMA_URL + "/api/tags");
      const data = await res.json();
      const hasModel = data.models?.some((m) => (m.name || m.model) === OLLAMA_MODEL);
      if (hasModel) {
        return { content: [{ type: "text", text: `✅ Modelo ${OLLAMA_MODEL} encontrado e pronto para uso.` }] };
      }
      void fetch(OLLAMA_URL + "/api/pull", {
        method: "POST",
        body: JSON.stringify({ name: OLLAMA_MODEL, stream: false }),
      });
      return { content: [{ type: "text", text: `🟡 Modelo ${OLLAMA_MODEL} não encontrado. Solicitação de download enviada ao Ollama. Isso pode demorar.` }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: "Erro ao conectar ao Ollama. Verifique se 'ollama serve' está rodando." }] };
    }
  }

  if (name === "verificar_prompt") {
    const promptText = args?.prompt;
    if (!promptText) throw new McpError(ErrorCode.InvalidParams, "Parametro 'prompt' obrigatorio.");
    const result = checkPromptInjection(promptText);
    let icon = "✅";
    if (result.classification === "suspeito") icon = "🟡";
    if (result.classification === "malicioso") icon = "🔴";
    const lines = [
      `${icon} Classificacao: ${result.classification.toUpperCase()}`,
      ...result.details,
    ];
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }

  if (name === "analisar_logs_sistema") {
    try {
      const logCmd = "Get-EventLog -LogName System -EntryType Error -Newest 20 | Select-Object TimeGenerated,Source,Message | ConvertTo-Json";
      const dataLogs = await executeLauncherCommand(logCmd, { timeoutMs: 300000 });
      if (!dataLogs.success) throw new Error(dataLogs.output);
      const prompt = `Aqui estão os últimos 20 erros do Windows (JSON). Resuma os 3 problemas mais críticos e sugira comandos para resolvê-los:\n\n${dataLogs.output}`;
      const resIA = await fetch(OLLAMA_URL + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [{ role: "user", content: prompt }],
          stream: false,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const dataIA = await resIA.json();
      return { content: [{ type: "text", text: dataIA.message?.content || "A IA não conseguiu analisar os logs." }] };
    } catch (e) {
      if (e.name === "AbortError" || e.name === "TimeoutError") {
        return { isError: true, content: [{ type: "text", text: "⏱️ Timeout ao analisar logs (30s). Ollama pode estar sobrecarregado." }] };
      }
      return { isError: true, content: [{ type: "text", text: "Falha na análise: " + e.message }] };
    }
  }

  if (name === "perguntar_ia") {
    const pergunta = args?.pergunta;
    if (!pergunta) throw new McpError(ErrorCode.InvalidParams, "Parâmetro 'pergunta' obrigatório.");
    try {
      const ollamaRes = await fetch(OLLAMA_URL + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [
            { role: "system", content: OLLAMA_SYSTEM_PROMPT },
            { role: "user", content: pergunta },
          ],
          stream: false,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const ollamaData = await ollamaRes.json();
      return { content: [{ type: "text", text: ollamaData.message?.content || "Sem resposta." }] };
    } catch (error) {
      if (error.name === "AbortError" || error.name === "TimeoutError") {
        return { isError: true, content: [{ type: "text", text: "⏱️ Timeout: Ollama demorou mais de 15s para responder. Tente novamente." }] };
      }
      return { isError: true, content: [{ type: "text", text: `Falha no Ollama: ${error.message}` }] };
    }
  }

  const toolConfig = mestreTools[name];
  if (!toolConfig) throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);

  try {
    // Substitui placeholders no comando localmente para fallback compatível.
    let finalCmd = toolConfig.command;
    const params = {};
    if (args && typeof args === "object") {
      for (const [key, value] of Object.entries(args)) {
        const sanitizedValue = sanitizeToolArgument(value);
        if (sanitizedValue == null) {
          return {
            isError: true,
            content: [{ type: "text", text: `Argumento inválido para o parâmetro: ${key}` }],
          };
        }
        params[key] = sanitizedValue;
        const placeholder = new RegExp(`\\{\\{${key.toUpperCase()}\\}\\}`, "g");
        finalCmd = finalCmd.replace(placeholder, sanitizedValue);
      }
    }

    const unfilledMatch = finalCmd.match(/\{\{[A-Z_]+\}\}/);
    if (unfilledMatch) {
      return {
        isError: true,
        content: [{ type: "text", text: `Parâmetro obrigatório ausente: ${unfilledMatch[0]}. Por favor, forneça o argumento necessário.` }],
      };
    }

    // Envia {id, params} quando possível; fallback para cmd exato se não houver params.
    const hasParams = Object.keys(params).length > 0;
    const payload = hasParams ? { id: toolConfig.id, params } : { id: toolConfig.id };
    const data = await executeLauncherCommand(payload, { timeoutMs: 900000 });
    return {
      isError: !data.success,
      content: [{ type: "text", text: data.output || (data.success ? "✅ Ok." : "❌ Erro.") }],
    };
  } catch (error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return { isError: true, content: [{ type: "text", text: "⏱️ Timeout: O comando demorou mais de 10s. Verifique se o Launcher está rodando na porta 7777." }] };
    }
    return { isError: true, content: [{ type: "text", text: `Falha no Mestre Server: ${error.message}` }] };
  }
});

async function startServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Mestre do PC V10 MCP Server iniciado em stdio.");
}

startServer().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
