# Mestre do PC — Chat Mobile Android

O mobile é uma PWA instalável no Chrome Android, servida pelo gateway local
`mobile/gateway/`. O gateway autentica o usuário com senha + TOTP, cria uma
sessão curta e encaminha chat, status e ferramentas para o launcher local.

## O que está implementado

- `pwa/` — interface de chat responsiva, manifest e service worker.
- `gateway/server.mjs` — gateway HTTP local com autenticação, sessão e proxy.
- `gateway/create-user.mjs` — criação interativa do usuário e segredo TOTP.
- Ações limitadas às APIs e operações existentes do Mestre do PC.
- PowerShell livre não é exposto pelo gateway.

## Configuração no PC Windows

1. Inicie o launcher do Mestre do PC na porta `7777`.
2. Crie o usuário mobile:

```powershell
cd mobile\gateway
npm run setup
```

Registre a URL `otpauth://` exibida pelo comando em Google Authenticator,
Microsoft Authenticator ou outro aplicativo TOTP.

3. Inicie o gateway:

```powershell
$env:MOBILE_COOKIE_SECURE="0" # apenas teste HTTP local
npm start
```

O gateway local ficará em `http://127.0.0.1:8787`.

## Acesso Android local e remoto

Instale o Tailscale no PC e no Android e entre na mesma tailnet. Publique o
gateway somente pela rede privada:

```powershell
tailscale serve --https=443 http://127.0.0.1:8787
```

Abra no Chrome Android o endereço HTTPS fornecido pelo Tailscale e selecione
“Adicionar à tela inicial”. O endereço funciona na mesma rede Wi-Fi e também
fora dela, desde que ambos estejam conectados ao Tailscale.

Em produção, não defina `MOBILE_COOKIE_SECURE=0`; o padrão usa cookies Secure.
Não publique diretamente as portas `7777` ou `8787` na internet.

## Permissões

O acesso mobile pode conversar com a IA, consultar status, listar ferramentas e
encaminhar operações reconhecidas pelo launcher. Operações destrutivas devem ser
confirmadas na interface. O modo livre continua bloqueado.

## Variáveis úteis

| Variável | Padrão | Uso |
|---|---|---|
| `MOBILE_GATEWAY_HOST` | `127.0.0.1` | Interface de escuta local |
| `MOBILE_GATEWAY_PORT` | `8787` | Porta do gateway |
| `MOBILE_AUTH_FILE` | `mobile/gateway/data/users.json` | Usuários e hashes locais |
| `MOBILE_COOKIE_SECURE` | `1` | Cookies Secure; desligue apenas para teste HTTP |
| `MESTRE_BASE_URL` | `http://127.0.0.1:7777` | Launcher do PC |

O arquivo de usuários está ignorado pelo Git. Nunca publique o segredo TOTP.
