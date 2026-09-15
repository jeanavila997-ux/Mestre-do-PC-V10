# Mestre do PC — Versão Mobile (Plano Futuro)

> **Status:** planejamento
> **Objetivo:** levar o Mestre do PC para celulares (Android/iOS) com segurança, controle local e, opcionalmente, acesso remoto.

---

## 1. Visão

Uma versão mobile que permita:

- Monitorar o PC (CPU, RAM, disco, rede, processos).
- Executar comandos de manutenção previamente aprovados na whitelist.
- Conversar com o assistente de IA (Ollama) do Mestre do PC.
- Receber alertas e notificações sobre saúde do sistema.

---

## 2. Opções de Arquitetura

### 2.1 PWA (Progressive Web App) — Recomendado como primeiro passo

- Baseado no site estático em `dist/site/`.
- Instalável diretamente pelo navegador do celular.
- Sem necessidade de publicar em lojas.
- Conecta ao `mcp-server` via HTTP/SSE quando o celular e o PC estiverem na mesma rede.

**Arquivos futuros:**
- `mobile/pwa/manifest.json`
- `mobile/pwa/service-worker.js`
- `mobile/pwa/index.html`

### 2.2 App Híbrido com Capacitor

- Embrulha a interface web em um app Android/iOS nativo.
- Permite notificações push, acesso offline e melhor integração com o sistema.
- Pode usar a tela do `v10/` como ponto de partida.

**Arquivos futuros:**
- `mobile/capacitor/package.json`
- `mobile/capacitor/android/`
- `mobile/capacitor/ios/`
- `mobile/capacitor/capacitor.config.json`

### 2.3 App Nativo (Flutter ou React Native)

- Mais trabalho, mais controle nativo.
- Melhor para publicação nas lojas e experiência mobile otimizada.
- Consome a API do `mcp-server` via HTTP/SSE.

---

## 3. Conectividade

| Cenário | Como funciona |
| :--- | :--- |
| **Local (mesma rede)** | Celular acessa `http://<ip-do-pc>:7778/sse` usando token `MESTRE_LOCAL_MCP_TOKEN`. |
| **Remoto (internet)** | Requer um gateway seguro (ex.: tunnel, VPS ou servidor intermediário) com TLS e autenticação. |
| **Termux (Android)** | Opcional para usuários avançados rodarem o servidor MCP diretamente no celular. |

---

## 4. Requisitos de Segurança

- Sempre usar token de autenticação (`MESTRE_LOCAL_MCP_TOKEN`).
- Preferir HTTPS/TLS em qualquer acesso remoto.
- Nunca expor o `mcp-server` diretamente na internet sem proxy reverso.
- Manter a whitelist de operações (`v10/allowed-operations.json`) como controle de execução.
- Registrar todas as ações mobile nos logs de auditoria (`logs/audit/`).

---

## 5. Estrutura de Pastas Planejada

```
mobile/
├── README.md                 # Este arquivo
├── pwa/                      # Progressive Web App
│   ├── manifest.json
│   ├── service-worker.js
│   └── index.html
├── capacitor/                # App híbrido Android/iOS
│   ├── package.json
│   ├── capacitor.config.json
│   ├── android/
│   └── ios/
└── native/                   # App nativo futuro (Flutter/React Native)
    └── (a definir)
```

---

## 6. Próximos Passos Sugeridos

1. Validar o endpoint HTTP/SSE do `mcp-server` a partir de um celular na mesma rede.
2. Criar uma tela simples de status do PC usando o PWA.
3. Implementar autenticação por token na interface mobile.
4. Testar execução de comandos whitelistados via mobile.
5. Decidir se haverá backend remoto para acesso fora da rede local.

---

*Documento de planejamento do Mestre do PC V10.*
