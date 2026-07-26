# Plano de Integração com Ecossistema Microsoft (Entra + Graph + Teams)

## 1) Contexto do repositório analisado

O `MestreDoPC-V7` já é um servidor MCP em Node.js/TypeScript com foco em automações de manutenção Windows via launcher local (HTTP `:7777`) e possui:

- Camada de segurança (sanitização + whitelist).
- Execução de ferramentas de manutenção e diagnóstico.
- Integração local com IA (Ollama).

Esse perfil se encaixa bem em uma integração Microsoft para:

1. **SSO corporativo** com Microsoft Entra ID.
2. **Automação operacional** e notificações via Microsoft Graph/Teams.
3. **Governança e auditoria** (permissões mínimas, throttling, observabilidade).

## 2) Objetivo da integração Microsoft

Criar uma integração empresarial que permita:

- Autenticar operadores/admins via conta Microsoft corporativa.
- Autorizar chamadas por escopo (RBAC + princípio do menor privilégio).
- Consumir APIs Microsoft (usuários, grupos, Teams, notificações).
- Publicar alertas de saúde do sistema no Teams.

## 3) Fontes oficiais usadas (Microsoft Learn)

1. Microsoft identity platform – OAuth 2.0 Authorization Code Flow (com PKCE):
   https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
2. Boas práticas de integração com identity platform (usar MSAL, segurança):
   https://learn.microsoft.com/en-us/entra/identity-platform/identity-platform-integration-checklist
3. Validação de claims para proteger APIs:
   https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation
4. Microsoft Graph permissions overview (delegated vs application):
   https://learn.microsoft.com/en-us/graph/permissions-overview
5. Microsoft Graph throttling guidance (HTTP 429 + Retry-After):
   https://learn.microsoft.com/en-us/graph/throttling
6. Microsoft Graph SDK overview (inclui TypeScript/JavaScript):
   https://learn.microsoft.com/en-us/graph/sdks/sdks-overview
7. Teams bot overview (estado atual, Teams SDK):
   https://learn.microsoft.com/en-us/microsoftteams/platform/bots/what-are-bots
8. Graph change notifications via webhooks:
   https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks

## 4) Arquitetura alvo (incremental)

### Fase A — Identidade e acesso (fundação)

- Registrar app no **Microsoft Entra ID**.
- Usar **Authorization Code Flow + PKCE** para login web/desktop administrativo.
- Adotar **MSAL** (evitar implementação manual de OAuth).
- Validar `aud`, `tid`, `sub`/`oid` e `azp`/`appid` nas APIs internas.

### Fase B — Integração Graph para governança

- Integrar Microsoft Graph SDK (TypeScript) no backend Node.
- Começar com permissões delegadas mínimas (ex.: `User.Read`).
- Mapear grupos Entra (ex.: `MestreDoPC-Admins`) para autorização das ferramentas críticas (`reset_windows_update`, etc.).
- Implementar cache curto para perfis/grupos e reduzir chamadas Graph.

### Fase C — Teams para operação diária

- Publicar notificações de eventos operacionais no Teams:
  - Falha em limpeza/reparo.
  - Timeout recorrente no launcher.
  - Suspeitas de entrada maliciosa bloqueada.
- Evoluir para bot de comando no Teams apenas após controles de autorização estarem maduros.

### Fase D — Eventos reativos (webhooks Graph)

- Em vez de polling, usar **change notifications/webhooks** para eventos relevantes.
- Implementar endpoint HTTPS público para subscription lifecycle.
- Persistir assinatura e rotina de renovação antes do vencimento.

## 5) Plano técnico por entregáveis

## Entregável 1 — SSO + token validation

- [ ] Criar módulo `src/auth/entra.ts` (config MSAL, authority, scopes).
- [ ] Criar middleware `src/auth/validateToken.ts` para validação condicional.
- [ ] Variáveis de ambiente:
  - `ENABLE_MICROSOFT_AUTH` (booleano, default: `false`)
  - `ENTRA_TENANT_ID`
  - `ENTRA_CLIENT_ID`
  - `ENTRA_CLIENT_SECRET` (se fluxo confidencial)
  - `ENTRA_REDIRECT_URI`
- [ ] Política default: **Modo Standalone / Local-Only** por padrão. Se `ENABLE_MICROSOFT_AUTH` for `false` (ou não configurado), o acesso local é totalmente liberado sem necessidade de token.
- [ ] Se `ENABLE_MICROSOFT_AUTH=true`, o middleware passa a negar acesso a requisições sem token corporativo válido.

**Critério de aceite:** 
1. Por padrão (out-of-the-box), o servidor MCP roda localmente sem qualquer dependência ou obrigatoriedade de conta Microsoft ou internet.
2. Com a flag ativada, a autenticação passa a ser validada de forma estrita.

## Entregável 2 — Autorização por grupos/roles (Opcional)

- [ ] Definir matriz de permissão por ferramenta MCP.
- [ ] Resolver associação Entra Group -> Role interna.
- [ ] Bloquear ferramentas de alto risco para role padrão.

**Critério de aceite:** usuário sem role admin não executa comandos críticos.

## Entregável 3 — Cliente Microsoft Graph resiliente (Opcional)

- [ ] Criar `src/integrations/graph-client.ts` usando SDK oficial.
- [ ] Implementar política de retry para 429 com `Retry-After`.
- [ ] Telemetria de latência/erro por endpoint Graph.
- [ ] Comportamento default: Desativado se variáveis do Graph não configuradas. Erros de conexão ou autenticação não impedem a execução de ferramentas locais (degradação graciosa).

**Critério de aceite:** sem falhas por burst simples; se desabilitado, ferramentas funcionam normalmente sem fazer chamadas externas.

## Entregável 4 — Notificações Teams (Opcional)

- [ ] Definir canal operacional (ex.: `#infra-alertas`).
- [ ] Publicar alertas estruturados (tipo, host, jobId, severidade, timestamp UTC).
- [ ] Limitar ruído com deduplicação e rate limit.
- [ ] Comportamento default: Desativado se Webhook/Connector do Teams não fornecido. Falhas de entrega de alertas apenas geram logs de aviso (`logger.warn`) sem interromper a execução das tarefas.

**Critério de aceite:** incidentes chegam ao Teams se configurado; se não configurado ou offline, o app funciona sem erros visíveis ao usuário.

## Entregável 5 — Webhooks e eventos (Opcional)

- [ ] Endpoint seguro para receber notificações Graph.
- [ ] Verificação de validade da subscription.
- [ ] Job de renovação automática.
- [ ] Comportamento default: Ignorado se não habilitado.

**Critério de aceite:** renovação contínua apenas se ativo; nenhuma falha se inativo.

## 6) Segurança e compliance (recomendação oficial aplicada)

- **Menor privilégio** para permissões Graph e roles Entra.
- **Não interpretar access token no cliente**; validação no backend/API.
- **Tratamento explícito de throttling** (`429`, `Retry-After`).
- **Segredo fora de código** (Key Vault ou equivalente).
- **Auditoria** de ações sensíveis (quem, quando, qual ferramenta, resultado).

## 7) Roadmap sugerido (6 semanas)

- **Semana 1:** desenho IAM + registro app Entra + PoC login.
- **Semana 2:** middleware de validação token + política deny-by-default.
- **Semana 3:** autorização por grupos + testes de acesso negativo.
- **Semana 4:** Graph client resiliente + observabilidade.
- **Semana 5:** notificações Teams + deduplicação de alertas.
- **Semana 6:** webhooks + hardening + testes de carga e segurança.

## 8) Riscos e mitigação

- **Risco:** over-permission no app registration.
  - **Mitigação:** revisão de escopos por feature + aprovação de segurança.
- **Risco:** throttling Graph em picos.
  - **Mitigação:** backoff, fila interna, cache e redução de polling.
- **Risco:** exposição de endpoint webhook.
  - **Mitigação:** HTTPS, validações estritas, assinatura/validação de origem e monitoramento.

## 9) Próximo passo prático no repositório

Iniciar com PR técnico contendo:

1. `src/auth/*` (autenticação/validação)
2. `src/integrations/graph-client.ts`
3. `docs/microsoft_integration_runbook.md` com operação e troubleshooting
4. testes unitários para autorização por role/grupo

Esse é o menor incremento com valor alto e risco controlado.
