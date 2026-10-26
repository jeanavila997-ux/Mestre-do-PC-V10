# Investigador OSINT-BR

Agente definido por instruções reutilizáveis, baseado nos três anexos enviados. Sua primeira tarefa foi pesquisar as eleições presidenciais de 2026 e verificar a alegação de revolta nacional após a reeleição de Lula.

## Como usar

1. Carregue [prompts/system-prompt.md](prompts/system-prompt.md) como instrução do agente na ferramenta de IA escolhida.
2. Opcionalmente, carregue o [perfil de defesa de Flávio Bolsonaro](perfis/defesa-flavio-bolsonaro.md), que organiza argumentos documentais e trata suspeitas de fraude como alegações a verificar.
3. Forneça um pedido conforme [templates/briefing.md](templates/briefing.md), ou reutilize [o briefing desta pesquisa](pesquisas/eleicoes-brasil-2026/briefing.md).
4. Disponibilize pesquisa web. Sem acesso, o agente deve declarar a limitação e não inventar atualizações.
5. Siga [o método](metodologia/protocolo.md) e salve cada investigação em `pesquisas/<tema>/`.
6. Atualize o relatório, as fontes e a memória com data e evidências. Preserve versões anteriores.

## Organização

```text
investigador-osint-br/
├── prompts/system-prompt.md
├── perfis/defesa-flavio-bolsonaro.md
├── metodologia/protocolo.md
├── referencias/originais/       # os três anexos e manifesto SHA-256
├── templates/                  # briefing e relatório reutilizáveis
└── pesquisas/eleicoes-brasil-2026/
    ├── briefing.md
    ├── relatorio-2026-10-26.md
    ├── fontes/fontes.json
    ├── fontes/consultas.md
    └── memoria/estado.json
```

O agente é documental e pode ser executado manualmente por uma IA. Não há processo em segundo plano nem coleta automática de redes sociais. O PDF em `referencias/originais/` é o modelo enviado pelo usuário; a pesquisa produzida está disponível separadamente abaixo.

## Pesquisa com o perfil de defesa

Consulte a [pesquisa de defesa documental de 26/10/2026](pesquisas/eleicoes-brasil-2026/defesa-flavio-2026-10-26/pesquisa.md), a [versão em PDF](pesquisas/eleicoes-brasil-2026/defesa-flavio-2026-10-26/defesa-flavio-2026-10-26.pdf), a [matriz preenchida](pesquisas/eleicoes-brasil-2026/defesa-flavio-2026-10-26/matriz-defesa.md) e as [fontes verificadas](pesquisas/eleicoes-brasil-2026/defesa-flavio-2026-10-26/fontes.json). Esta rodada identifica questões de procedimento sem demonstrar fraude atribuível a Lula.
