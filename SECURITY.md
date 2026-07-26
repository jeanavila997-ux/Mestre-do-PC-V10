# Política de Segurança

Não abra vulnerabilidades publicamente. Use o recurso **Report a vulnerability** do GitHub quando disponível.

## Regras do projeto

- A interface não deve enviar comandos PowerShell livres ao launcher.
- O launcher V10 aceita apenas comandos presentes em `v10/allowed-operations.json`.
- Comandos produzidos por Ollama, Claude ou outros modelos não são autorizados automaticamente.
- Operações administrativas devem ser revisadas e testadas antes de entrar no catálogo.
- Nunca publique tokens, credenciais, certificados, bancos de licença ou chaves privadas.

## Aviso

Este software executa operações de manutenção do Windows. Faça backup e revise ações classificadas como destrutivas antes do uso em produção.
