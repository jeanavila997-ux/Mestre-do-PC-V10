# Enviar o Mestre do PC para a VPS (pasta completa)

Unidade de deploy: **uma pasta só**. Nada vai para a Área de Trabalho do Windows.

| Lado | Caminho |
|---|---|
| PC (projeto) | `C:\Users\Jean\Projetos\Mestre-do-PC-V10` |
| Staging local | `dist/vps-bundle/mestre-do-pc` (dentro do projeto) |
| Arquivo único | `dist/vps-bundle/mestre-do-pc.tgz` |
| VPS | `/opt/apps/mestre-do-pc` |
| HTTPS | `https://mestre.72-62-11-116.sslip.io` |
| App Android (PWA) | `https://mestre.72-62-11-116.sslip.io/mobile/` |

O launcher Windows (`v10/launcher.js`) continua no PC, em `127.0.0.1:7777`. Na VPS sobe só o **site + PWA** em `127.0.0.1:7780`, atrás do Traefik.

## Por que uma pasta só

O instalador do Desktop cria **apenas atalhos `.lnk`**. Código, ícones e `node_modules` ficam no `InstallDir`. Extrair o ZIP na Área de Trabalho espalha `locales/`, `resources/` e dezenas de arquivos soltos — isso já aconteceu com outros apps Electron na pasta `Jean\` da Área de Trabalho. Este deploy **não copia nada para lá**.

## Comando

```powershell
Set-Location C:\Users\Jean\Projetos\Mestre-do-PC-V10
pwsh -NoProfile -File scripts\deploy-vps.ps1
```

Só empacotar, sem SSH:

```powershell
pwsh -NoProfile -File scripts\deploy-vps.ps1 -SkipRemote
```

## SSH deste PC

- Chave: `%USERPROFILE%\.ssh\id_ed25519_vps` (privada, fora do Git)
- Pública (cole no hPanel Hostinger → VPS → Settings → SSH keys, **sem apagar as outras**):

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC1oIyzPxeccreaAMlN9fCXjTnV6KSp6DtPZRkSGKb9d jean@desktop-mestre-vps
```

Firewall da VPS: 22, 80 e 443. Porta `7780` só em loopback.

## Depois do envio

```bash
cd /opt/apps/mestre-do-pc
docker compose -f deploy/vps/docker-compose.yml up -d
curl -fsS http://127.0.0.1:7780/ping
curl -I https://mestre.72-62-11-116.sslip.io/mobile/
```

Segredos (`.env`, chaves, tokens) **não** entram no tarball.
