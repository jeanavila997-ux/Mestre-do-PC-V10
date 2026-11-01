# Híbrido ipset + iptables (`escaping_ips`)

## Arquivos

| Arquivo | Função |
|---|---|
| `gerar-escaping-ips.sh` | Lê o SQLite e **gera** `add_escaping_ips.sh` |
| `add_escaping_ips.sh` | Script gerado (criar sets + DROP) — rodar no Linux como root |
| `seu_banco.db` | SQLite com tabela `ip_info(ip, country_code, country_name, …)` |

## Bug corrigido

Na versão antiga:

```bash
echo "ipset create escaping_ips ..."      # só imprimia na tela
echo "iptables -I INPUT ... escaping_ips" # só imprimia na tela
# ... enquanto os `ipset add` iam para o arquivo
```

Na versão nova, o **cabeçalho** de `add_escaping_ips.sh` já contém:

1. `ipset create escaping_ips … -exist`
2. `iptables -I INPUT -m set --match-set escaping_ips src -j DROP` (só se ainda não existir)
3. Depois os `ipset add escaping_ips …`
4. Fase 2: países extras → ipset se `> 20` IPs, senão `iptables -s` individual

## Uso no VPS/Linux

```bash
# 1) Copie o gerador + o .db para o servidor
scp gerar-escaping-ips.sh seu_banco.db root@SEU_VPS:/root/ipblock/

# 2) Gere
cd /root/ipblock
chmod +x gerar-escaping-ips.sh
./gerar-escaping-ips.sh ./seu_banco.db

# 3) Revise!
less add_escaping_ips.sh

# 4) Aplique (mantenha outra sessão SSH aberta)
sudo ./add_escaping_ips.sh
```

## Variáveis

| Env / arg | Default | Significado |
|---|---|---|
| `$1` / `DB_FILE` | `seu_banco.db` | Caminho do SQLite |
| `OUT_SCRIPT` | `add_escaping_ips.sh` | Nome do script gerado |
| `MIN_OTHER` | `3` | Mínimo de IPs para considerar país “extra” |
| `IPSET_THRESHOLD` | `20` | Acima disso cria `xx_block`; senão regra `-s` |

## Segurança

- **BR** e **US** ficam de fora da fase 2 (não entram no bloqueio automático de “outros países”).
- Ainda assim: se o IP do seu notebook/VPS estiver classificado errado no banco, pode haver lockout.
- Prefira aplicar com console/VNC da Hostinger aberto.
