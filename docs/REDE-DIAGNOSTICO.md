# Diagnóstico de Rede Wi-Fi - Mestre do PC V10

## Visão Geral

Módulo de diagnóstico de rede integrado ao **Mestre do PC V10**, baseado no conceito do **Casa5G Dashboard**. Fornece monitoramento em tempo real da conexão Wi-Fi com indicadores visuais e análise por IA (Ollama).

---

## Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `v10/rede-dashboard.js` | Módulo JavaScript do dashboard de rede |
| `v10/index.html` | Atualizado para carregar o módulo |
| `v10/allowed-operations.json` | Operações de rede adicionadas |

---

## Funcionalidades

### 🎯 Monitoramento Automático

- **Intervalo**: 10 segundos entre medições
- **Destinos testados**: 1.1.1.1, 8.8.8.8, 9.9.9.9 (alternados)
- **DNS testado**: microsoft.com, google.com, cloudflare.com (alternados)
- **Histórico**: Até 50 registros visíveis (10 na tabela)

### 📊 Indicadores Visuais

| Indicador | Descrição | Estados |
|-----------|-----------|---------|
| **Wi-Fi** | Status da conexão | CONECTADO / OFFLINE |
| **Sinal** | Intensidade do Wi-Fi | 0-100% |
| **Roteador** | Latência até gateway | ms (verde/amarelo) |
| **Internet** | Latência externa | ms (verde/amarelo) |
| **DNS** | Resolução de nomes | OK / FALHA |
| **HTTPS** | Conexão segura (443) | OK / FALHA |

### 🔍 Informações Detalhadas

- SSID da rede
- Endereço IPv4
- Gateway padrão
- Servidores DNS configurados
- Canal Wi-Fi utilizado

### 📈 Classificação de Saúde

| Status | Cor | Condições |
|--------|-----|-----------|
| **SAUDÁVEL** | 🟢 Verde | Tudo funcionando |
| **ATENÇÃO** | 🟡 Amarelo | Latência alta ou perda moderada |
| **CRÍTICO** | 🔴 Vermelho | Sem gateway ou perda total |

### 💻 Terminal de Comandos

Comandos defensivos disponíveis no terminal:

| Comando | Função |
|---------|--------|
| `ativar` | Iniciar monitoramento automático |
| `desativar` | Parar monitoramento |
| `testar` | Executar teste imediato |
| `status` | Mostrar último diagnóstico |
| `wifi` | Detalhes da conexão |
| `ipconfig` | Configuração de IP |
| `gateway` | Testar roteador |
| `limpar` | Limpar terminal |

### 🤖 Análise com Ollama

Envia o diagnóstico para o Ollama local (`localhost:11434`) e exibe uma explicação em português sobre o estado da rede e possíveis soluções.

**Modelo padrão**: `qwen2.5-coder:3b`

---

## Operações de Rede Adicionadas

As seguintes operações foram adicionadas ao `allowed-operations.json`:

### Categoria: Rede

| ID | Título |
|----|--------|
| `rede_info_wifi_completo` | Wi-Fi Info Completo |
| `rede_testar_gateway` | Testar Gateway |
| `rede_testar_internet_multiplos` | Testar Internet (Múltiplos) |
| `rede_testar_dns_google_cloudflare` | Testar DNS |
| `rede_testar_https443` | Testar HTTPS (443) |
| `rede_wifi_redes_proximas` | Redes Wi-Fi Próximas |
| `rede_ipconfig_all` | IPConfig Completo |
| `rede_flush_renew_ip` | Flush DNS + Renovar IP |
| `rede_arp_cache` | Ver Cache ARP |
| `rede_portas_locais` | Portas em Escuta |
| `rede_portas_estabelecidas` | Conexões Estabelecidas |
| `rede_rotas_tabela` | Tabela de Rotas |
| `rede_wifi_sinal_bars` | Força do Sinal (Barras) |
| `rede_ping_trace_route` | Trace Route |
| `rede_speedtest_mini` | Speed Test Mini |

### Categoria: Ollama

| ID | Título |
|----|--------|
| `rede_testar_ollama` | Testar Ollama |

---

## Como Usar

### Dashboard de Rede

1. Abra o **Mestre do PC V10** no navegador
2. O painel de Diagnóstico de Rede aparece automaticamente
3. Clique em **▶ ATIVAR** para iniciar o monitoramento
4. Acompanhe os indicadores em tempo real
5. Clique em **🔮 ANALISAR** para obter explicação da IA

### Operações Rápidas

1. Use a **busca** para encontrar operações de rede
2. Ou navegue até a categoria **Rede**
3. Clique na operação desejada

---

## Estrutura do Código

```
rede-dashboard.js
├── RedeDashboard.init()           # Inicialização
├── RedeDashboard.criarPainelRede() # Criar DOM
├── RedeDashboard.ativar()         # Iniciar monitoramento
├── RedeDashboard.desativar()      # Parar monitoramento
├── RedeDashboard.executarCiclo()  # Executar diagnóstico
├── RedeDashboard.obterInfoBasica()# Info Wi-Fi
├── RedeDashboard.testarConectividade() # Testes
├── RedeDashboard.classificarSaude() # Classificar
├── RedeDashboard.adicionarHistorico() # Salvar histórico
├── RedeDashboard.analisarComIA()  # Análise Ollama
└── RedeDashboard.executarComando() # Terminal
```

---

## Integração com Launcher

O módulo se comunica com o `MestreDoPC-Launcher.ps1` via API:

```javascript
fetch('http://127.0.0.1:7777/api/executar', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ command: '...' })
})
```

---

## Limitações

- Não modifica configurações de rede
- Não desconecta dispositivos
- Não requer privilégios administrativos
- Requer Ollama rodando em `localhost:11434` para análise IA

---

## Screenshots

O painel inclui:
- Header com controles (ATIVAR/PARAR/TESTAR)
- Grid de indicadores visuais
- Detalhes da conexão
- Badge de saúde colorido
- Tabela de histórico
- Terminal integrado
- Área de análise com IA

---

**Última atualização**: 2025
