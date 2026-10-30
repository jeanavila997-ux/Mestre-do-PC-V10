# Mestre Mobile V11 — Ultimate Plus Mobile Edition

PWA do Mestre do PC feita para Android e iOS (Samsung S26 Ultra, iPhone 15 e telas parecidas). O código vive em `v10/mobile/` dentro do [Mestre-do-PC-V10](https://github.com/jeanavila997-ux/Mestre-do-PC-V10) e pode ser publicado sozinho em [mestre-do-pc-mobile](https://github.com/jeanavila997-ux/mestre-do-pc-mobile).

CSS, JavaScript, ícones e o service worker são locais. Não há CDN.

## Uso integrado ao launcher

O `v10/launcher.js` entrega esta pasta em `/mobile/`:

- `/mobile/`
- `/mobile/index.html`
- `/mobile/manifest.json`
- `/mobile/sw.js`
- `/mobile/app.js`
- `/mobile/styles.css`

No Desktop, o botão **Versão Mobile** aponta para `/mobile/`. Um navegador de celular que abre `/` cai na versão mobile. Para ficar no Desktop, use **Desktop** dentro do app ou abra `/?desktop=1`. `/?mobile=1` volta a forçar a versão mobile.

O launcher continua escutando só em `127.0.0.1`. Para o celular alcançar o PC, publique um túnel ou um proxy reverso:

```bash
cloudflared tunnel --url http://127.0.0.1:7777
```

Abra `https://<id>.trycloudflare.com/mobile/`.

## Uso standalone

A mesma pasta é o site inteiro. Dá para hospedar em GitHub Pages, Cloudflare Pages ou na VPS `72.62.11.116`.

1. O app abre na aba **Chat**. No topo, escolha **PC Desktop**, **VPS** ou **9Router**.
2. Toque em **Conexão** (ou no banner “Alvo offline”) e salve a URL do launcher:
   - PC na rede local: `http://192.168.x.x:7777` (atrás de um proxy; o processo não abre em `0.0.0.0`)
   - Túnel: `https://<id>.trycloudflare.com`
   - VPS: `http://72.62.11.116:7777`
   - 9Router: `http://127.0.0.1:20128` ou o host da VPS na porta `20128`
3. Use **Testar** no sheet para validar o endpoint (`/ping` ou `/api/health` no 9Router). A bolinha no header mostra online/offline e a latência.
4. Quando a página é servida pelo próprio launcher, o alvo Desktop começa em `window.location.origin`.
5. Se o servidor tiver `MESTRE_MOBILE_TOKEN`, cole o mesmo valor no campo token. Ele vai no header `X-Mestre-Mobile-Token`.

## App Android (PWA, sem APK)

Não há APK na Play Store neste momento. O “download” no Android é instalar o PWA na tela inicial.

No app, o botão **App** (topo), **Baixar app Android** (Pulso), o card em **Mais → Prontos** e o chip **App Android** no Chat abrem o mesmo sheet:

1. **Instalar agora** — aparece quando o Chrome dispara `beforeinstallprompt`.
2. **Copiar link** / **Compartilhar** — o link público e o da sessão atual.
3. No Chrome Android: menu **⋮** → **Instalar app** (ou **Adicionar à tela inicial**).

Link público (GitHub Pages):

https://jeanavila997-ux.github.io/Mestre-do-PC-V10/mobile/

Na LAN/túnel, use a URL desta sessão (`/mobile/` no launcher).

O app chama o launcher com `X-Mestre-Client: v10-web`. Origens aceitas: localhost, LAN privada, `*.trycloudflare.com`, `72.62.11.116`, `*.72-62-11-116.sslip.io`, `jeanavila997-ux.github.io` e `mestre-do-pc-mobile.pages.dev`. Outras origens entram por `MESTRE_MOBILE_ORIGINS` (lista separada por vírgula; `*.pages.dev` é um curinga de host).

Antes de deixar um túnel no ar, defina `MESTRE_MOBILE_TOKEN`. Sem esse token, qualquer página numa origem confiável consegue chamar `/run` enquanto o túnel existir.

## Abas (nav inferior)

Ordem: **Pulso** · **Cmds** · **Chat** (centro, padrão) · **VPS** · **Mais** (Prontos, Arquiteto & Memórias).

1. **Chat** — tela principal: `/ollama/chat` ou 9Router `/v1/chat/completions`, modelos, ditado pela Web Speech API e chips de prompts/comandos prontos.
2. **Pulso** — medidores de CPU, RAM, disco C: e latência (`/status`, `/ping`) e o Stream Deck (`POST /run`).
3. **Comandos** — filtro **Atalhos** com 21 operações embutidas da whitelist (RAM, limpeza, DNS, rede, Defender…), mais o catálogo completo de `/operations`, busca, categorias, favoritos e histórico. Destrutivas pedem confirmação; a saída chega por `/run-status`.
4. **VPS & Cloud** — os oito apps `*.72-62-11-116.sslip.io` e as portas MySQL `32768`, PostgreSQL `32769`, Adminer `32771`, Ollama `11434`, Nexus-Terminal `3100`, Hermes `8642`, n8n `5677` e 9Router `20128`.
5. **Mais** — **Prontos** (prompts e atalhos já no menu), Arquiteto de Prompts v2 (R.C.T.R.F.) e memórias em `/memories/list`, `/memories/create`, `/memories/search` e `/memories/stats`, com cache em `localStorage` e IndexedDB.

Favoritos, histórico, endpoint e a última cópia das memórias ficam no aparelho. Dá para consultar o cache com o PC desligado.

## Sincronizar com o repositório mobile

O workflow `.github/workflows/sync-mobile-repo.yml` roda no `main` quando `v10/mobile/` muda, e também manualmente. Com o secret `MOBILE_REPO_TOKEN` (PAT com escrita em `jeanavila997-ux/mestre-do-pc-mobile`) ele publica a pasta. Sem o secret, o job avisa e termina com sucesso, sem falhar o workflow.

No Windows:

```powershell
$env:MOBILE_REPO_TOKEN = "<token>"
pwsh scripts/sync-mobile-repo.ps1 -Push
```

No Linux:

```bash
MOBILE_REPO_TOKEN="<token>" bash scripts/sync-mobile-repo.sh --push
```

Sem `-Push` / `--push`, os scripts só listam os arquivos. O conteúdo de `v10/mobile/` vira a raiz do outro repositório. A pasta `.github` de lá é preservada, para um workflow de Pages continuar existindo.

No GitHub Pages, publique a branch `main` a partir da raiz (`/` ). O arquivo `.nojekyll` já está incluído. No Cloudflare Pages, o `_headers` aplica a CSP.
