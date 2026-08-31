# 📋 Template de Informações - Modelo de IA

> Use este template para documentar **novos modelos** de IA adicionados ao Mestre do PC V11.
> Preencha todos os campos para garantir documentação consistente.

---

## 🆔 Identificação

| Campo | Valor |
|-------|-------|
| **Nome do Modelo** | `(ex: qwen2.5-coder:3b-instruct)` |
| **Apelido/Label** | `(ex: "Qwen Coder 3B")` |
| **Tipo** | `(Local / Cloud)` |
| **Proveedor/Fabricante** | `(ex: Alibaba, Moonshot AI, Mistral AI, etc.)` |
| **Data de Adição** | `(YYYY-MM-DD)` |
| **Adicionado Por** | `(seu nome)` |

---

## 📊 Especificações Técnicas

| Campo | Valor |
|-------|-------|
| **Tamanho do Modelo** | `(ex: 3.5 GB, 7B parâmetros, etc.)` |
| **Arquitetura** | `(ex: Transformer, MoE, etc.)` |
| **Context Window** | `(ex: 8192 tokens, 32768 tokens)` |
| **RAM Mínima** | `(ex: 4 GB)` |
| **RAM Recomendada** | `(ex: 8 GB)` |
| **GPU Recomendada** | `(Sim / Não / Opcional)` |
| **VRAM Mínima (se GPU)** | `(ex: 6 GB)` |

---

## ⭐ Avaliação de Desempenho

| Critério | Avaliação (1-5) | Justificativa |
|----------|-----------------|---------------|
| **Velocidade** | ⭐⭐⭐⭐⭐ | `(ex: "Respostas em < 1s localmente")` |
| **Precisão** | ⭐⭐⭐⭐⭐ | `(ex: "Raramente alucina em código")` |
| **Consumo de RAM** | ⭐⭐⭐⭐⭐ | `(ex: "Leve, < 4GB")` |
| **Versatilidade** | ⭐⭐⭐⭐⭐ | `(ex: "Bom em código e texto geral")` |
| **Custo-Benefício** | ⭐⭐⭐⭐⭐ | `(ex: "Gratis e eficiente")` |

---

## 🎯 Casos de Uso

### ✅ Melhor Para
- `(ex: Geração de scripts PowerShell)`
- `(ex: Explicação de conceitos técnicos)`
- `(ex: Chat geral do Mestre do PC)`
- `(ex: Debugging de código simples)`

### ❌ Limitações
- `(ex: Não é ideal para raciocínio muito complexo)`
- `(ex: Context window limitado)`
- `(ex: Requer API key se for cloud)`
- `(ex: Lento em máquinas sem GPU)`

### 🎯 Caso de Uso no Mestre do PC
```powershell
# Exemplo de comando MCP usando este modelo
mcp__mestre-do-pc__perguntar_ia `
  -Pergunta "Sua pergunta aqui" `
  -Modelo "nome-do-modelo"
```

---

## 🔧 Configuração no Mestre do PC

### Perfil Recomendado
```json
{
  "profile": "balanced",
  "model": "nome-do-modelo",
  "options": {
    "num_ctx": 8192,
    "temperature": 0.6,
    "top_p": 0.9,
    "top_k": 40,
    "num_predict": 1024
  }
}
```

### Variáveis de Ambiente
```powershell
$env:OLLAMA_MODEL = "nome-do-modelo"
$env:OLLAMA_MODEL_PROFILE = "balanced"
```

---

## 📈 Benchmarks (Opcional)

| Teste | Resultado | Unidade |
|-------|-----------|---------|
| **Tokens/segundo (local)** | `(ex: 45)` | tokens/s |
| **Tempo de Resposta (cloud)** | `(ex: 350)` | ms |
| **RAM em Uso** | `(ex: 3.2)` | GB |
| **VRAM em Uso (se GPU)** | `(ex: 4.1)` | GB |

---

## 💰 Custo (se Cloud)

| Plano | Custo | Unidade |
|-------|-------|---------|
| **Input** | `(ex: $0.50)` | por 1M tokens |
| **Output** | `(ex: $1.50)` | por 1M tokens |
| **Request Mínimo** | `(ex: $0.00)` | USD |

---

## 📝 Notas Adicionais

`(Espaço para observações extras, dicas de uso, problemas conhecidos, links para documentação oficial, etc.)`

**Exemplo:**
- Link para paper oficial: `https://arxiv.org/abs/xxxx.xxxxx`
- Link para repositório: `https://github.com/...`
- Problema conhecido: `(descrever)`
- Dica de uso: `(ex: "Use temperature=0.3 para código")`

---

## 🧪 Testes Realizados

| Teste | Data | Resultado | Observações |
|-------|------|-----------|-------------|
| `(ex: "Gerar script de limpeza")` | `YYYY-MM-DD` | ✅ Pass | `(ex: "Script funcionou perfeitamente")` |
| `(ex: "Explicar erro BSOD")` | `YYYY-MM-DD` | ⚠️ Partial | `(ex: "Explicação boa, mas solução incompleta")` |
| `(ex: "Analisar log do Windows")` | `YYYY-MM-DD` | ✅ Pass | `(ex: "Identificou causa raiz corretamente")` |

---

## ✅ Checklist de Validação

Antes de adicionar este modelo à configuração oficial:

- [ ] Modelo testado localmente (se local) ou API key configurada (se cloud)
- [ ] Benchmarks básicos realizados
- [ ] Casos de uso validados no Mestre do PC
- [ ] Limitações documentadas
- [ ] Perfil de configuração criado em `model-profiles.json` (se aplicável)
- [ ] Este template preenchido e salvo em `docs/modelos/`

---

**Preenchido por:** `(seu nome)`  
**Data:** `YYYY-MM-DD`  
**Status:** `(Rascunho / Validado / Oficial)`

---

## 📚 Referências

- Documentação oficial: `(URL)`
- Paper/Artigo: `(URL)`
- Discussão/Review: `(URL)`

---

**Mestre do PC V11** - Desenvolvido por JEAN  
*Template de Documentação de Modelos v1.0*
