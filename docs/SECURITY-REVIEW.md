# Security Review Report

**Data:** 2026-08-02  
**Projeto:** Mestre do PC V10  
**Escopo:** `mcp-server/`, `v10/`  

---

## Resumo Executivo

Foram identificadas **2** questões de segurança de alta confiança no projeto. Ambas foram corrigidas nesta revisão.

---

## Achados

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🟠 HIGH | `mcp-server/prompt-guard-server.py` | 44, 48 | `trust_remote_code=True` permite execução de código arbitrário durante o carregamento do modelo HuggingFace. O repositório do modelo não está pinado a um commit SHA imutável. | 9/10 |
| 2 | ⚪ LOW (Arquitetura) | `v10/rede-dashboard.js` | 261, 311 | Envia comandos PowerShell brutos para endpoint `/api/executar` inexistente. Se esse endpoint for implementado sem whitelist, resultará em injeção de comando crítica. | 7/10 |

---

## Correções Aplicadas

### 1. 🟠 HIGH – Removido `trust_remote_code=True`

**Arquivo:** `mcp-server/prompt-guard-server.py`  
**Mudança:** Removido `trust_remote_code=True` das chamadas `AutoTokenizer.from_pretrained()` e `AutoModelForSequenceClassification.from_pretrained()`. O modelo oficial da Meta não requer código remoto customizado.

**Antes:**
```python
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, trust_remote_code=True)
```

**Depois:**
```python
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
```

---

### 2. ⚪ LOW (Arquitetura) – `rede-dashboard.js` migrado para `/run`

**Arquivo:** `v10/rede-dashboard.js`  
**Mudança:** Reescritas as funções `obterInfo()` e `testarRede()` para usar o endpoint `/run` existente com IDs de operações previamente cadastradas em `allowed-operations.json`. Adicionado helper `executarOperacao(id)` com polling de job.

**Operações utilizadas:**
- `rede_info_wifi_completo`
- `diagnostico_de_rede_completo`
- `rede_testar_gateway`
- `rede_testar_internet_multiplos`
- `rede_testar_dns_google_cloudflare`
- `rede_testar_https443`

---

## Regras Hard Validadas ✅

| Regra | Status |
|-------|--------|
| Nunca passar input do usuário diretamente para PowerShell | ✅ `sanitizeToolArgument()` e `validateParam()` ativos |
| Nunca adicionar comandos free-form | ✅ Todas as operações em `allowed-operations.json` |
| Nunca reabilitar `file://` ou CORS `*` | ✅ CORS restrito a `BASE_URL` |
| Operações destrutivas requerem confirmação | ✅ Flag `destructive` presente |
| Manter separação MCP (não-elevado) / Launcher (elevado) | ✅ Preservada |

---

## Recomendações Pendentes

1. **Pinagem de modelo:** Considerar fixar o modelo `meta-llama/Prompt-Guard-2-86M` a um commit SHA ou tag de release específica via parâmetro `revision` no `from_pretrained()`.
2. **Testes de launcher:** Os testes `launcher-security.test.js` falham por timeout ao iniciar o launcher no ambiente de CI/teste local. Investigar se há conflito de porta ou dependência de ambiente.
3. **Teste `project-smoke.test.js`:** O teste espera 1 tag `<script>` em `index.html`, mas há 2 (inline + `rede-dashboard.js` externo). Avaliar se o teste precisa ser atualizado ou se o script externo deve ser consolidado.

---

## Histórico de Revisões

- **2026-08-01:** Revisão inicial — bugs de sintaxe JS corrigidos, Prompt Guard implementado.
- **2026-08-02:** Revisão de segurança focada — `trust_remote_code=True` removido, `rede-dashboard.js` migrado para endpoint `/run` seguro.

---

*Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>*
