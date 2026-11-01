# Análise Wi-Fi & LAN — Mestre do PC

Pasta para **executar**, **guardar** e **repartir** a análise de rede da sessão (REDE-24 → REDE-5G).

## Conteúdo

| Arquivo | Para quê |
|---|---|
| `analisar-rede-mestre.ps1` | Script de execução (Wi-Fi, ARP, latência, Cloudflare, ISP, usuários) |
| `dados-coletados.json` | Snapshot da coleta 31/10/2026 |
| `dashboard-rede.html` | Dashboard React (CDN) com **seções** — ideal para compartilhar |
| `web/` | App **Vite + React** com as mesmas seções |
| `scripts/gerar-escaping-ips.sh` | Gerador híbrido ipset/iptables (Linux/VPS) |

## Seções do dashboard

1. Resumo  
2. Wi-Fi antes/depois  
3. Speed & latência  
4. LAN / máquinas  
5. Usuários  
6. Vizinhança Wi-Fi  
7. Códigos usados  
8. Scripts da pasta  

## Como usar

### 1) Rodar a análise de novo

```powershell
cd $env:MESTRE_PROJETO_PATH\skills-globais\03-rede\analise-wifi-lan
pwsh -NoProfile -File .\analisar-rede-mestre.ps1
```

Gera `dados-coletados.live.json` nesta pasta.

### 2) Abrir o HTML (repartir)

O HTML já embute o snapshot em `window.__DADOS__`. Abra no navegador:

```powershell
Start-Process .\dashboard-rede.html
```

Ou sirva a pasta:

```powershell
npx --yes serve .
```

### 3) App Vite

```powershell
cd web
npm install
npm run dev
```

Abre em `http://127.0.0.1:5177`.
