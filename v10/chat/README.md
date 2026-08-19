# Módulo de Chat IA do Mestre do PC

Pasta dedicada ao **chat de IA** do Mestre do PC V10/V11.

Aqui vivem, de forma isolada:

- A documentação do chat
- Os estilos CSS
- O template HTML
- O módulo JavaScript que realiza as chamadas ao launcher e ao Ollama
- Exemplos de integração

## Objetivo

Separar a funcionalidade de chat do monólito `v10/index.html`, permitindo:

1. Manutenção independente da lógica de conversação
2. Reutilização em outras páginas (ex: `chat-ia.html`, extensão, Notepad++)
3. Testes isolados do módulo
4. Evolução gradual para o redesign proposto em `sugestoes/chat-ia-redesign/`

## Arquivos

| Arquivo | Função |
|---|---|
| `README.md` | Este documento |
| `ARCHITECTURE.md` | Detalhes técnicos, chamadas HTTP e segurança |
| `chat-styles.css` | Estilos do modal/painel de chat |
| `chat-template.html` | Referência da marcação HTML do painel; deve acompanhar o template interno do módulo |
| `chat-module.js` | Fonte executável do componente: template interno, Ollama, memórias, anexos e execução de comandos |
| `example-integration.html` | Página mínima demonstrando como usar o módulo |

## Como usar

### 1. Integração básica em uma página

```html
<!doctype html>
<html>
  <head>
    <link rel="stylesheet" href="/chat/chat-styles.css" />
  </head>
  <body>
    <!-- Container onde o chat sera injetado -->
    <div id="chat-root"></div>

    <script type="module">
      import { initChat } from '/chat/chat-module.js';
      initChat({
        rootSelector: '#chat-root',
        launcherUrl: window.location.origin,
        clientHeader: 'v10-web'
      });
    </script>
  </body>
</html>
```

### 2. Via launcher

O `v10/launcher.js` ja serve arquivos estaticos da pasta `v10/`. Basta acessar `/chat/example-integration.html` ou carregar os recursos em outra pagina.

## Chamadas realizadas pelo chat

Todas as chamadas partem do navegador e passam pelo launcher local (`127.0.0.1:7777`):

- `GET /ping` — status do launcher
- `GET /status` — metricas do sistema (CPU, RAM, disco)
- `GET /ollama/tags` — modelos disponiveis
- `POST /ollama/chat` — conversacao com streaming
- `POST /classify` — verifica se um comando esta na whitelist
- `POST /run` — executa comando PowerShell aprovado

Veja `ARCHITECTURE.md` para o detalhamento completo.

## Seguranca

- Input do usuario passa por heuristica de prompt injection antes de ser enviado ao Ollama
- Comandos sugeridos pela IA sao classificados contra a whitelist (`v10/allowed-operations.json`)
- Todo comando sugerido pela IA exige confirmacao explicita, inclusive operações de baixo risco
- Nenhum comando livre e executado

## Estado atual

Este modulo e uma **refatoracao modularizada** do chat original que vive em `v10/index.html`.
Ainda nao substitui o chat embarcado no `index.html` principal — essa migracao pode ser feita futuramente sem risco, pois o modulo preserva todos os IDs e comportamentos originais.

Enquanto a migracao nao for concluida, alteracoes de comportamento e seguranca devem ser aplicadas tanto ao chat ativo no `index.html` quanto ao `chat-module.js`.
