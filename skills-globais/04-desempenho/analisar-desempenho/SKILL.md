---
name: analisar-desempenho
description: Analisa desempenho web com Lighthouse, performance trace e métricas de navegação. Use para página lenta, Core Web Vitals, LCP/INP/CLS, Farol/Lighthouse ou painel Desempenho do DevTools.
---

# Analisar Desempenho

Equivalente das ferramentas **Desempenho**, **Farol (Lighthouse)**, **Cobertura** e **Memória** do Edge DevTools.

## Regras
- Separe **carregamento** (navigation) de **runtime** (interação depois do load).
- Lighthouse `chrome_lighthouse_audit` **não** inclui performance completa — para CWV use `chrome_performance_start_trace`.
- Rode auditoria em URL estável; diga se foi desktop ou mobile.
- Não declare “está rápido” sem número (LCP, score, ou duration).

## Passo a passo
1. Abra a página alvo e espere `readyState=complete`.
2. Métricas rápidas: `chrome_evaluate_script` lendo `performance.getEntriesByType('navigation')[0]`.
3. Auditoria: `chrome_lighthouse_audit` (`mode=navigation|snapshot`, `device=desktop|mobile`).
4. Trace: `chrome_performance_start_trace` (reload/autoStop conforme o caso) → insights → `chrome_performance_analyze_insight` se precisar.
5. Memória só se houver suspeita de leak: `chrome_take_heapsnapshot` (arquivo grande).

## Mapeamento DevTools → MCP
| DevTools | Tool MCP |
|---|---|
| Lighthouse / Farol | `chrome_lighthouse_audit` |
| Performance panel | `chrome_performance_start_trace` / `stop` / `analyze_insight` |
| Memory heap | `chrome_take_heapsnapshot` |

## Referência oficial
- https://learn.microsoft.com/pt-br/microsoft-edge/devtools/performance/
- https://learn.microsoft.com/pt-br/microsoft-edge/devtools/lighthouse/lighthouse-tool
- https://learn.microsoft.com/pt-br/microsoft-edge/devtools/coverage/

## Entrega
Scores + 3 achados acionáveis (o que mudar no código), com severidade.
