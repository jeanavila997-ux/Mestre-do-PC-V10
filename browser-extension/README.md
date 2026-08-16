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

## Instalação

### 1. Configurar o Launcher

No PowerShell onde o launcher é iniciado, defina o token e as origens permitidas:

```powershell
$env:MESTRE_EXTENSION_TOKEN="seu-token-seguro-aqui"
$env:MESTRE_EXTENSION_ORIGINS="chrome-extension://SEU_ID_AQUI"
.\MestreDoPC-Launcher.ps1
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

## Integração com Chat Hub

Por padrão a extensão verifica o status de `http://127.0.0.1:3000/ping`. Para usar outro app local, altere a URL nas opções da extensão e certifique-se de que o app responda em `GET /ping`.

## Distribuição

Para gerar um `.zip` pronto para publicação na Chrome Web Store ou para instalação manual:

```bash
# Chrome / Edge
node browser-extension/build.js chrome

# Firefox
node browser-extension/build.js firefox
```

O arquivo será gerado em `browser-extension/dist/mestre-do-pc-extension-<target>-v<versao>.zip`.

### Firefox

O Firefox usa o arquivo `manifest-firefox.json` durante o build. A principal diferença é que o background usa `scripts` em vez de `service_worker`, e inclui `browser_specific_settings` com o ID da extensão.

## Desenvolvimento

Arquivos principais:

- `manifest.json` — configuração da extensão (Chrome/Edge).
- `manifest-firefox.json` — configuração da extensão (Firefox).
- `popup.html` / `popup.js` — interface e ações do popup.
- `background.js` — service worker, menu de contexto e chamadas ao launcher.
- `content.js` — script injetado nas páginas.
- `options.html` / `options.js` — página de configurações.
- `build.js` — script de empacotamento.

## Permissões

- `storage`: salvar token e URLs.
- `activeTab`: obter a aba ativa para enviar página/selection.
- `contextMenus`: menu de contexto.
- `scripting`: extrair seleção da página.
- `host_permissions`: acesso apenas a `http://127.0.0.1:7777/*` (launcher local).
