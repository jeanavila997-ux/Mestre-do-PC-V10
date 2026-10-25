# Extensão do navegador - Mestre do PC V10

Extensão Manifest V3 para integrar o navegador com o **Mestre do PC V10** e, opcionalmente, com outros apps locais como **Chat Hub**.

## Funcionalidades

- Ver status do Launcher, Ollama e Chat Hub.
- Executar comandos rápidos pelo popup: diagnóstico, limpeza, enviar página para IA.
- Menu de contexto: diagnóstico, limpeza e análise de texto selecionado.
- Configuração segura por token (`MESTRE_EXTENSION_TOKEN`).

## Segurança

A extensão só consegue falar com o launcher se:

1. A variável `MESTRE_EXTENSION_TOKEN` estiver definida no ambiente do launcher.
2. A origem da extensão (`chrome-extension://<id>` ou `moz-extension://<id>`) estiver na allowlist `MESTRE_EXTENSION_ORIGINS`.
3. As requisições enviarem os headers `X-Mestre-Client: browser-extension` e `X-Mestre-Extension-Token: <token>`.

Nunca compartilhe o token. Ele é a única credencial da extensão.

Token e configurações ficam em `chrome.storage.local`, sem sincronização entre
dispositivos. Dados de versões anteriores são copiados para armazenamento local
antes de serem removidos de `storage.sync`. Armazenamento local não é cofre criptografado.
Somente URLs HTTP em `127.0.0.1` são aceitas; redirecionamentos são bloqueados.

## Instalação

### 1. Configurar o Launcher

No PowerShell onde o launcher é iniciado, defina o token e as origens permitidas:

```powershell
$env:MESTRE_EXTENSION_TOKEN="seu-token-seguro-aqui"
$env:MESTRE_EXTENSION_ORIGINS="chrome-extension://SEU_ID_AQUI"
node v10/launcher.js
```

> Para descobrir o ID da extensão, carregue-a primeiro no modo desenvolvedor (passo 3) e depois copie o ID exibido.

Você pode permitir múltiplas origens separando por vírgula:

```powershell
$env:MESTRE_EXTENSION_ORIGINS="chrome-extension://ID_CHROME, moz-extension://ID_FIREFOX"
```

### 2. Gerar ícones (se necessário)

Os ícones PNG já estão em `icons/`. Para regenerá-los:

```bash
node browser-extension/icons/build-icons.js
```

### 3. Carregar no Chrome / Edge

1. Abra `chrome://extensions/` (ou `edge://extensions/`).
2. Ative o **Modo desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `browser-extension`.
5. Copie o ID da extensão e adicione-o em `MESTRE_EXTENSION_ORIGINS`.

### 4. Configurar a extensão

1. Clique no ícone da extensão → **⚙️ Configurações**.
2. Cole o mesmo token definido no launcher.
3. (Opcional) Habilite e configure a URL do Chat Hub.
4. Salve.
5. Para usar IA, leia o aviso e marque **Autorizar envio para IA**. O envio de título,
   URL e seleção fica bloqueado até esse consentimento, inclusive no menu de contexto.

Portas locais adicionais exigem permissão opcional do navegador ao salvar.
HTTP é usado apenas no loopback deste computador; servidores remotos não são aceitos.

## Integração com Chat Hub

Por padrão a extensão verifica o status de `http://127.0.0.1:3000/ping`. Para usar outro app local, altere a URL nas opções da extensão e certifique-se de que o app responda em `GET /ping`.

## Distribuição

Requisitos: Node.js e PowerShell do Windows. A extensão não depende de pacotes npm externos; não precisa de `npm install`.

Para validar e gerar os pacotes:

```bash
# Chrome / Edge
node --test browser-extension/build.test.js browser-extension/settings.test.js
node browser-extension/build.js chrome

# Firefox
node browser-extension/build.js firefox
```

O arquivo será gerado em `browser-extension/dist/mestre-do-pc-extension-<target>-v<versao>.zip`.

O build valida nome, descrição (até 132 caracteres), versão e presença dos recursos.
O `manifest.json` fica na raiz do ZIP. Arquivos obrigatórios ausentes interrompem o
build sem substituir o ZIP anterior. O pacote Firefox recebe seu próprio manifesto.

### Antes de enviar à Chrome Web Store

1. Extraia o ZIP e carregue a pasta extraída em `chrome://extensions/` pelo botão **Carregar sem compactação**.
2. Configure token e origem no launcher. Confira status, opções, popup, menu de contexto e envio para IA; teste limpeza apenas quando quiser executá-la.
3. Revise nome, descrição e ícones PNG (16, 32, 48 e 128 pixels). A versão atual é `1.0.2`; cada envio posterior exige uma versão maior nos dois manifestos e em `package.json`.
4. Prepare descrição da loja, capturas de tela, imagens promocionais, URLs de suporte/privacidade e declarações sobre permissões e dados enviados para IA.
5. Envie o ZIP pelo painel da conta de desenvolvedor quando todos os testes e materiais estiverem completos.

Como os textos estão diretamente em português e não existe pasta `_locales`, o manifesto não declara `default_locale`.
O ZIP gerado não comprova aprovação da loja nem substitui teste funcional no navegador.

Referências oficiais: [preparar extensão](https://developer.chrome.com/docs/webstore/prepare),
[default_locale](https://developer.chrome.com/docs/extensions/reference/manifest/default-locale),
[página da loja](https://developer.chrome.com/docs/webstore/best_listing).

Texto sugerido, categoria e minuta de privacidade: [STORE-LISTING.md](STORE-LISTING.md).

### Teste no Chrome

```powershell
npm.cmd --prefix browser-extension run test:e2e
```

O teste usa Chrome instalado e Puppeteer já incluído no `chrome-devtools-mcp` do
projeto. Abre perfil temporário, verifica migração do token, consentimento, opções
e comando com resposta simulada. Não executa manutenção real. `CHROME_PATH` permite
indicar outro executável do Chrome. Firefox é validado no pacote, não neste teste.

Sem script permanente nas páginas, não há listeners `unload`, WebSockets ou WebRTC
injetados pela extensão. Botões do popup funcionam enquanto consultas de status
ocorrem em paralelo. Testes manuais de navegação voltar/avançar, diferentes versões
do navegador e rede lenta continuam parte da revisão antes da publicação.

### Firefox

O Firefox usa o arquivo `manifest-firefox.json` durante o build. A principal diferença é que o background usa `scripts` em vez de `service_worker`, e inclui `browser_specific_settings` com o ID da extensão.

## Desenvolvimento

Arquivos principais:

- `manifest.json` — configuração da extensão (Chrome/Edge).
- `manifest-firefox.json` — configuração da extensão (Firefox).
- `popup.html` / `popup.js` — interface e ações do popup.
- `background.js` — service worker, menu de contexto e chamadas ao launcher.
- `settings.js` — armazenamento local, migração e acesso ao app local.
- `options.html` / `options.js` — página de configurações.
- `build.js` — script de empacotamento.

## Permissões

- `storage`: salvar token, URLs e consentimento neste perfil.
- `activeTab`: obter a aba ativa para enviar página/selection.
- `contextMenus`: menu de contexto.
- `scripting`: extrair seleção da página.
- `host_permissions`: acesso apenas a `http://127.0.0.1:7777/*` (launcher local).
- `notifications`: resultados e erros das ações do menu de contexto.
- `optional_host_permissions`: outras portas de `127.0.0.1`, solicitadas ao configurar apps locais.

Não há `content_scripts` nem recursos públicos em `<all_urls>`. A leitura da página
usa `activeTab` e `scripting` somente após ação explícita.
