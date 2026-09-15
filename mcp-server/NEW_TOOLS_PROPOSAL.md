# Novas Ferramentas MCP - Proposta

## Visão Geral

Este documento propõe **6 novas ferramentas** para o MCP Server do Mestre do PC V10, baseadas em gaps identificados na validação e nas melhores práticas do MCP Builder.

---

## Ferramentas Propostas

### 1. `mestre_diagnosticar_saude_sistema`

**Categoria:** Diagnóstico
**Tipo:** Read-only
**Complexidade:** Alta

#### Descrição
Coleta métricas abrangentes de saúde do sistema e gera um resumo executivo com ações recomendadas.

#### Input Schema
```typescript
const DiagnosticInputSchema = z.object({
  incluir_historico: z.boolean()
    .default(false)
    .describe("Incluir últimos 50 eventos críticos do Event Viewer"),
  verificar_smart: z.boolean()
    .default(true)
    .describe("Verificar saúde do disco via S.M.A.R.T."),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
});
```

#### Output (Markdown)
```markdown
# 📊 Diagnóstico de Saúde - PC-ADMIN

## Resumo Executivo
✅ Sistema operacional: Saudável
⚠️ Disco C: 85% usado (atenção em 7 dias)
❌ Serviço Windows Update: Falhando

## Métricas
- CPU: 23% (8 núcleos)
- RAM: 12GB/16GB (75%)
- Disco C: 170GB/200GB livres
- Temperatura: 65°C

## Ações Recomendadas
1. Limpar arquivos temporários (recupera ~10GB)
2. Reiniciar serviço wuauserv
3. Executar sfc /scannow
```

#### Output (JSON)
```json
{
  "status": "warning",
  "timestamp": "2026-09-10T14:30:00Z",
  "metrics": {
    "cpu_percent": 23,
    "ram_used_gb": 12,
    "ram_total_gb": 16,
    "disk_c_used_percent": 85,
    "temperature_c": 65
  },
  "issues": [
    {
      "severity": "warning",
      "component": "disk",
      "message": "Disco C com 85% de uso",
      "recommended_action": "limpar_temp_usuario"
    }
  ],
  "services_failing": ["wuauserv"],
  "actions_recommended": [
    { "operation_id": "limpar_temp_usuario", "reason": "Recuperar 10GB" },
    { "operation_id": "iniciar_servico_audio", "reason": "Reiniciar wuauserv" }
  ]
}
```

#### Implementação
```javascript
async function diagnosticarSaudeSistema(args) {
  const { incluir_historico, verificar_smart, response_format } = args;

  // Coletar métricas
  const [os, disk, services, events] = await Promise.all([
    fetch(MESTRE_STATUS_URL).then(r => r.json()),
    getDiskInfo(),
    getFailingServices(),
    incluir_historico ? getCriticalEvents(50) : Promise.resolve([])
  ]);

  // Gerar diagnóstico
  const issues = identifyIssues(os, disk, services, events);
  const actions = recommendActions(issues);

  const output = {
    status: issues.some(i => i.severity === 'critical') ? 'critical' :
            issues.some(i => i.severity === 'warning') ? 'warning' : 'healthy',
    timestamp: new Date().toISOString(),
    metrics: { ... },
    issues,
    actions_recommended: actions
  };

  return formatResponse(output, response_format);
}
```

---

### 2. `mestre_otimizar_sistema_automatico`

**Categoria:** Automação
**Tipo:** Destrutiva (requer aprovação)
**Complexidade:** Alta

#### Descrição
Executa otimizações seguras automaticamente baseadas em análise do sistema.

#### Input Schema
```typescript
const OptimizeInputSchema = z.object({
  nivel: z.enum(['seguro', 'moderado', 'agressivo'])
    .default('seguro')
    .describe("Nível de otimização: seguro (sem confirmação), moderado (confirma destrutivas), agressivo (tudo)"),
  excluir: z.array(z.string())
    .optional()
    .describe("Operações para excluir (ex: ['limpar_prefetch'])"),
  approval_id: z.string()
    .optional()
    .describe("Token de aprovação para ações destrutivas")
});
```

#### Exemplo de Uso
```javascript
// Modo seguro (apenas não-destrutivas)
mestre_otimizar_sistema_automatico({ nivel: 'seguro' })

// Modo moderado (requer approval_id para destrutivas)
mestre_otimizar_sistema_automatico({
  nivel: 'moderado',
  approval_id: 'APV-123456'
})
```

#### Implementação
```javascript
async function otimizarSistemaAutomatico(args) {
  const { nivel, excluir = [], approval_id } = args;

  // Diagnosticar primeiro
  const diagnostic = await diagnosticarSaudeSistema({});

  // Selecionar otimizações
  const optimizations = selectOptimizations(diagnostic.issues, nivel);
  const filtered = optimizations.filter(op => !excluir.includes(op.id));

  // Validar aprovação para destrutivas
  const destructive = filtered.filter(op => op.destructive);
  if (destructive.length > 0 && nivel !== 'seguro') {
    if (!approval_id || !await validateApprovalId(approval_id)) {
      throw new Error("Aprovação necessária para ações destrutivas");
    }
  }

  // Executar
  const results = [];
  for (const op of filtered) {
    try {
      const result = await executeLauncherCommand({ cmd: op.command });
      results.push({ operation: op.id, success: result.success });
      await auditLog(AuditLevel.INFO, "auto_optimization", { operation: op.id });
    } catch (e) {
      results.push({ operation: op.id, error: e.message });
      await auditLog(AuditLevel.ERROR, "auto_optimization_failed", { operation: op.id });
    }
  }

  return {
    content: [{
      type: "text",
      text: `✅ Otimização concluída: ${results.filter(r => r.success).length}/${results.length} bem-sucedidas`
    }]
  };
}
```

---

### 3. `mestre_exportar_operacoes_json`

**Categoria:** Integração
**Tipo:** Read-only
**Complexidade:** Baixa

#### Descrição
Exporta catálogo completo de operações em JSON para integração com sistemas externos.

#### Input Schema
```typescript
const ExportInputSchema = z.object({
  incluir_metadata: z.boolean()
    .default(true)
    .describe("Incluir metadata (versão, timestamp, checksum)"),
  categorias: z.array(z.string())
    .optional()
    .describe("Filtrar por categorias (ex: ['Limpeza', 'Memória'])"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.JSON)
});
```

#### Output
```json
{
  "metadata": {
    "version": "1.0.0",
    "exported_at": "2026-09-10T14:30:00Z",
    "total_operations": 101,
    "checksum": "sha256:abc123..."
  },
  "operations": [
    {
      "id": "limpar_temp_usuario",
      "title": "Limpar TEMP Usuário",
      "category": "Limpeza",
      "destructive": false,
      "command": "Remove-Item -Path \"$env:TEMP\\*\" -Recurse -Force",
      "description": "Limpa pasta TEMP do usuário",
      "estimated_duration_sec": 5,
      "requires_approval": false
    }
  ]
}
```

---

### 4. `mestre_agendar_tarefa_inteligente`

**Categoria:** Automação
**Tipo:** Destrutiva
**Complexidade:** Média

#### Descrição
Cria tarefa agendada no Windows Task Scheduler com gatilhos inteligentes.

#### Input Schema
```typescript
const ScheduleInputSchema = z.object({
  operacao_id: z.string()
    .describe("ID da operação (ex: 'limpar_temp_usuario')"),
  gatilho_tipo: z.enum(['diario', 'semanal', 'evento', 'inicio'])
    .describe("Tipo de gatilho"),
  gatilho_config: z.object({
    hora: z.string().optional(), // "14:30"
    dia_semana: z.string().optional(), // "DOMINGO"
    evento_id: z.number().optional(), // Event ID
    log_nome: z.string().optional() // "Application"
  }),
  executar_como_admin: z.boolean()
    .default(true),
  condicoes: z.object({
    apenas_se_ocioso: z.boolean().default(false),
    apenas_se_bateria: z.boolean().default(false),
    acordar_pc: z.boolean().default(false)
  }).optional()
});
```

#### Exemplo
```javascript
mestre_agendar_tarefa_inteligente({
  operacao_id: "limpar_temp_usuario",
  gatilho_tipo: "diario",
  gatilho_config: { hora: "03:00" },
  executar_como_admin: true,
  condicoes: {
    apenas_se_ocioso: true,
    acordar_pc: false
  }
})
```

---

### 5. Resource: `mestre://status`

**Tipo:** Resource (URI-based)
**MIME:** application/json

#### Descrição
Expõe status do sistema em tempo real via URI.

#### Implementação
```typescript
server.registerResource(
  {
    uri: "mestre://status",
    name: "System Status",
    description: "Real-time CPU, RAM, and disk usage metrics",
    mimeType: "application/json"
  },
  async (uri: string) => {
    const status = await fetch(MESTRE_STATUS_URL, {
      signal: AbortSignal.timeout(5000)
    }).then(r => r.json());

    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify({
          timestamp: new Date().toISOString(),
          cpu: status.cpu,
          ram: {
            total_gb: Math.round(status.ramTotal / 1024),
            free_gb: Math.round(status.ramFree / 1024),
            used_percent: Math.round((1 - status.ramFree / status.ramTotal) * 100)
          },
          disk: {
            total_gb: Math.round((status.diskUsed + status.diskFree) / 1024),
            free_gb: Math.round(status.diskFree / 1024),
            used_percent: Math.round(status.diskUsed / (status.diskUsed + status.diskFree) * 100)
          }
        }, null, 2)
      }]
    };
  }
);
```

---

### 6. Resource: `mestre://operations/{category}`

**Tipo:** Resource (URI-based)
**MIME:** application/json

#### Descrição
Lista operações filtradas por categoria via URI.

#### Implementação
```typescript
server.registerResource(
  {
    uri: "mestre://operations/{category}",
    name: "Operations by Category",
    description: "List operations filtered by category (e.g., Limpeza, Memória, Rede)",
    mimeType: "application/json"
  },
  async (uri: string, category?: string) => {
    const allOps = operationRegistry.getAllOperations();
    const filtered = category
      ? allOps.filter(op => op.category === category)
      : allOps;

    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify({
          category: category || "all",
          count: filtered.length,
          operations: filtered.map(op => ({
            id: op.id,
            title: op.title,
            destructive: op.destructive
          }))
        }, null, 2)
      }]
    };
  }
);
```

---

## Roadmap de Implementação

### Fase 1 (Alta Prioridade)
- [ ] `mestre_diagnosticar_saude_sistema`
- [ ] `mestre_exportar_operacoes_json`
- [ ] Resource `mestre://status`

### Fase 2 (Média Prioridade)
- [ ] `mestre_otimizar_sistema_automatico`
- [ ] Resource `mestre://operations/{category}`

### Fase 3 (Baixa Prioridade)
- [ ] `mestre_agendar_tarefa_inteligente`

---

## Benefícios Esperados

| Ferramenta | Benefício | Métrica |
|------------|-----------|---------|
| Diagnosticar Saúde | Reduz tempo de troubleshooting | -50% tempo diagnóstico |
| Otimizar Automático | Mantém PC performático | +20% performance média |
| Export JSON | Integração com SIEM/ITSM | 100% operações documentadas |
| Agendar Tarefa | Automação contínua | 0 tarefas manuais repetitivas |
| Resources | Acesso programático | 3rd-party integrations |

---

## Critérios de Aceite

Todas as ferramentas devem:
- ✅ Ter input schema com Zod
- ✅ Suportar response_format (markdown/json)
- ✅ Incluir exemplos na description
- ✅ Ter error handling com actionable guidance
- ✅ Ser auditadas (auditLog)
- ✅ Ter testes unitários
- ✅ Seguir naming convention (`mestre_*`)

---

## Próximos Passos

1. **Aprovar proposta** → Definir quais ferramentas implementar
2. **Criar estrutura modular** → Refatorar index.js em src/tools/
3. **Implementar Fase 1** → 3 ferramentas + resources
4. **Escrever testes** → Cobertura >90%
5. **Documentar** → README com exemplos de uso
