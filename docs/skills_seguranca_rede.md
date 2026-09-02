# 🔒 Skills de Segurança de Rede - Guia Completo

## 📋 Índice Geral
- **Repositório 1:** claude-pentest-skills (15 skills PTES + especializadas)
- **Repositório 2:** Claude-Code-CyberSecurity-Skill (15 skills de cibersegurança)

---

## 🛡️ REPOSITÓRIO 1: claude-pentest-skills
*Metodologia PTES + Skills Especializadas*

### **CICLO DE LIFE PTES (Penetration Testing Execution Standard)**

#### 1. **pentest-pre-engagement**
- **O que faz:** Define escopo, regras de engajamento, requisitos legais
- **Uso prático:** Preparação inicial de testes, credenciais, autorização
- **Output:** Documentação de escopo e termo de confidencialidade
- **Quando usar:** Antes de qualquer teste de penetração

#### 2. **pentest-intelligence-gathering**
- **O que faz:** OSINT (Open Source Intelligence) e footprinting
- **Ferramentas:** Shodan, Censys, Certificate Transparency
- **Uso prático:** Descobrir informações públicas sobre alvo
- **Output:** Relatório de inteligência, subdomínios, tecnologias em uso
- **Quando usar:** Primeira fase de reconhecimento

#### 3. **pentest-threat-modeling**
- **O que faz:** Modelagem de ameaças e identificação de vetores de ataque
- **Método:** Priorização por CVSS (severity scoring)
- **Uso prático:** Entender possíveis caminhos de ataque
- **Output:** Matriz de risco e roadmap de exploração
- **Quando usar:** Após inteligência, antes de scanning

#### 4. **pentest-network-scanning**
- **O que faz:** Reconhecimento ativo de rede
- **Ferramentas:** Naabu, OWASP Nettacker, protocolos de rede
- **Uso prático:** Encontrar portas abertas, serviços rodando
- **Output:** Mapa de rede, inventário de serviços
- **Quando usar:** Descoberta de ativos

#### 5. **pentest-vulnerability-analysis**
- **O que faz:** Análise de vulnerabilidades com scoring multicritério
- **Métricas:** CVSS, EPSS (Exploit Prediction Scoring System), KEV (Known Exploited Vulnerabilities)
- **Uso prático:** Priorizar vulnerabilidades por severidade e exploitabilidade
- **Output:** Relatório de vulnerabilidades ranqueadas
- **Quando usar:** Após scanning, antes de exploração

#### 6. **pentest-exploitation**
- **O que faz:** Exploração de vulnerabilidades identificadas
- **Uso prático:** Executar cadeias de ataque, ganhar acesso
- **Output:** Provas de compromisso (PoC), acesso ao sistema
- **Quando usar:** Após validar vulnerabilidades

#### 7. **pentest-post-exploitation**
- **O que faz:** Atividades após comprometimento inicial
- **Técnicas:** Persistência, movimentação lateral, exfiltração de dados
- **Uso prático:** Simular atividades de atacante real
- **Output:** Relatório de impacto potencial
- **Quando usar:** Após ganhar acesso inicial

#### 8. **pentest-reporting**
- **O que faz:** Documentação de todos os findings
- **Formatos:** Executivo (C-level) e Técnico (equipe de TI)
- **Uso prático:** Comunicar riscos e recomendações
- **Output:** Relatório profissional com remediação
- **Quando usar:** Ao final do teste

---

### **SKILLS ESPECIALIZADAS POR TECNOLOGIA**

#### 9. **pentest-web-attacks**
- **O que faz:** Testes de segurança web avançados
- **Vulnerabilidades:** SQLi, XSS, LFI, SSRF, XXE, SSTI, upload malicioso
- **Uso prático:** Testar aplicações web modernas
- **Output:** Payloads de teste, evidência de vulnerabilidades
- **Quando usar:** Em aplicações web

#### 10. **pentest-active-directory**
- **O que faz:** Exploração de infraestrutura Active Directory
- **Ataques:** Kerberoasting, AS-REP Roasting, DCSync, ADCS, exploração de ACLs
- **Uso prático:** Simular comprometimento de ambiente corporativo
- **Output:** Caminhos de privilégio, movimentação lateral
- **Quando usar:** Em ambientes Windows corporativos

#### 11. **pentest-pfsense**
- **O que faz:** Teste de firewall pfSense
- **Cobertura:** 40+ CVEs em pfSense CE/Plus
- **Uso prático:** Validar segurança de firewalls
- **Output:** Vulnerabilidades específicas do pfSense
- **Quando usar:** Testando infraestrutura de rede com pfSense

#### 12. **pentest-paloalto**
- **O que faz:** Teste de firewalls Palo Alto Networks
- **Vulnerabilidades:** Exploração incluindo CVEs recentes
- **Uso prático:** Validar configuração de Palo Alto
- **Output:** Falhas de configuração e exploits
- **Quando usar:** Em ambientes Palo Alto

---

### **SKILLS DE SEGURANÇA DE IA**

#### 13. **ai-agent-audit**
- **O que faz:** Auditoria de segurança de IA
- **Escopo:** Claude Desktop/Code, servidores MCP
- **Uso prático:** Validar configurações seguras de AI agents
- **Output:** Relatório de conformidade e recomendações
- **Quando usar:** Implementando agents de IA na organização

#### 14. **llm-security-testing**
- **O que faz:** Avaliação de segurança de Large Language Models
- **Testes:** Vieses, injeção de prompt, vazamento de dados, robustez
- **Uso prático:** Garantir segurança de implementações LLM
- **Output:** Relatório de vulnerabilidades do modelo
- **Quando usar:** Usando LLMs em produção

#### 15. **security-commands**
- **O que faz:** Slash commands para testes rápidos
- **Uso prático:** Executar verificações sem ativar skills completas
- **Output:** Resultados rápidos de segurança
- **Quando usar:** Validações pontuais e rápidas

---

## 🚀 REPOSITÓRIO 2: Claude-Code-CyberSecurity-Skill
*15 Skills de Cibersegurança Estruturadas*

### **RECONHECIMENTO & INTELIGÊNCIA**

#### 1. **Recon & OSINT**
- **O que faz:** Coleta de informações de fontes abertas
- **Técnicas:** Subdomain enumeration, DNS analysis, fingerprinting, Google dorking, WHOIS
- **Uso prático:** Mapear superfície de ataque externa
- **Output:** Lista de subdomínios, IPs, tecnologias identificadas
- **Ferramentas:** FFUF, amass, Shodan, hunter.io
- **Quando usar:** Início de qualquer teste

---

### **AVALIAÇÃO & ANÁLISE**

#### 2. **Vulnerability Scanner**
- **O que faz:** Escaneamento automatizado de vulnerabilidades
- **Funcionalidades:** Auditoria de dependências, análise de config, scoring CVSS, relatórios estruturados
- **Uso prático:** Identificar vulnerabilidades conhecidas
- **Output:** Relatório com severidade e recomendações
- **Ferramentas:** Trivy, Snyk, Semgrep
- **Quando usar:** Contínuamente em pipeline CI/CD

#### 3. **Vulnerability Hunter** (relacionado)
- **O que faz:** Busca de vulnerabilidades específicas
- **Uso prático:** Encontrar CVEs relevantes ao ambiente
- **Output:** Listagem de CVEs exploráveis
- **Quando usar:** Antes de testes de exploração

---

### **DESENVOLVIMENTO DE EXPLOITS**

#### 4. **Exploit Development**
- **O que faz:** Criação de exploits customizados
- **Técnicas:** Templates de PoC, payload generation, buffer overflow, web exploits
- **Uso prático:** Desenvolver provas de conceito
- **Output:** Código funcional de exploit
- **Quando usar:** Após validar vulnerabilidade específica

---

### **ANÁLISE E ENGENHARIA REVERSA**

#### 5. **Reverse Engineering**
- **O que faz:** Análise de código compilado
- **Escopo:** Binary triage, assembly, firmware, protocolos, CTF
- **Uso prático:** Entender funcionamento de malware/software fechado
- **Output:** Análise de comportamento, documentação de funcionamento
- **Ferramentas:** IDA Pro, Ghidra, Radare2
- **Quando usar:** Análise de código malicioso ou proprietário

#### 6. **Malware Analysis**
- **O que faz:** Análise completa de malware
- **Abordagens:** Estática, YARA rules, sandbox, análise comportamental, IOC extraction
- **Uso prático:** Investigar amostras suspeitas
- **Output:** Relatório de funcionalidades, IOCs, assinatura YARA
- **Ferramentas:** Any.run, Wireshark, Yara
- **Quando usar:** Incidente de segurança com malware

---

### **BUSCA DE AMEAÇAS & DETECÇÃO**

#### 7. **Threat Hunting**
- **O que faz:** Busca proativa por comprometimentos
- **Técnicas:** IOC extraction, ATT&CK mapping, hunt hypotheses, Sigma + SIEM queries
- **Uso prático:** Procurar by padrões de ataque conhecidos
- **Output:** Hipóteses de ameaça, detecções, relatórios
- **Quando usar:** Operação contínua de segurança

#### 8. **Log Analysis & SIEM**
- **O que faz:** Análise centralizada de logs
- **Ferramentas:** Splunk, KQL (Azure), EQL (Elastic), Sigma rules
- **Uso prático:** Detectar atividades suspeitas em tempo real
- **Output:** Queries otimizadas, dashboards, alertas
- **Quando usar:** Operação 24/7 SOC

---

### **RESPOSTA A INCIDENTES & FORENSE**

#### 9. **Incident Response**
- **O que faz:** Resposta estruturada a incidentes
- **Metodologia:** PICERL (Prepare, Identify, Contain, Eradicate, Recover, Lessons Learned)
- **Técnicas:** Coleta de evidência, análise de timeline, memory forensics
- **Uso prático:** Gerenciar incidente de segurança
- **Output:** Relatório forense, plano de recuperação
- **Quando usar:** Durante incidente de segurança

---

### **SEGURANÇA DE REDE**

#### 10. **Network Security**
- **O que faz:** Análise e hardening de rede
- **Técnicas:** PCAP analysis, Suricata/Snort rules, firewall auditing, beaconing detection
- **Uso prático:** Validar perimeter seguro, detectar tráfego malicioso
- **Output:** Regras de firewall, configurações, alertas
- **Ferramentas:** Wireshark, Zeek, Suricata
- **Quando usar:** Segurança perimetral contínua

---

### **SEGURANÇA WEB**

#### 11. **Web Security**
- **O que faz:** Teste de segurança de aplicações web
- **Escopo:** OWASP Top 10, injection testing, API security, JWT, security headers
- **Uso prático:** Validar aplicações web modernas
- **Output:** Vulnerabilidades, payloads, recomendações
- **Ferramentas:** Burp Suite, OWASP ZAP
- **Quando usar:** Aplicações web em produção

---

### **SEGURANÇA EM NUVEM**

#### 12. **Cloud Security**
- **O que faz:** Auditoria de infraestrutura em nuvem
- **Plataformas:** AWS, Azure, GCP
- **Técnicas:** Dockerfile review, Kubernetes hardening, IaC scanning
- **Uso prático:** Validar segurança cloud-native
- **Output:** Misconfigurations, recomendações
- **Ferramentas:** Prowler, ScoutSuite, Checkov
- **Quando usar:** Ambiente cloud híbrido/multi-cloud

---

### **CRIPTOGRAFIA**

#### 13. **Cryptographic Analysis**
- **O que faz:** Análise de criptografia
- **Técnicas:** TLS auditing, cipher analysis, hash identification, code review, PQC guidance
- **Uso prático:** Validar implementação de criptografia
- **Output:** Recomendações de cipher, vulnerabilidades TLS
- **Ferramentas:** testssl.sh, hashcat
- **Quando usar:** Comunicações sensíveis

---

### **OPERAÇÕES SOC & BLUE TEAM**

#### 14. **CSOC Automation**
- **O que faz:** Automação de operações SOC
- **Escopo:** Alert triage, playbook YAML, escalation workflows, shift reports, KPI tracking
- **Uso prático:** Otimizar resposta a alertas
- **Output:** Playbooks automáticos, reports
- **Ferramentas:** SOAR, Shuffle, n8n
- **Quando usar:** Operação SOC escalável

#### 15. **Blue Team Defense**
- **O que faz:** Estratégia de defesa corporativa
- **Escopo:** Linux/Windows hardening, detection engineering, baselines, patch management
- **Uso prático:** Implementar defesa em profundidade
- **Output:** Políticas, baselines, playbooks
- **Quando usar:** Estratégia defensiva geral

---

### **RED TEAM & OPERAÇÕES AVANÇADAS**

#### 16. **Red Team Operations**
- **O que faz:** Operações avançadas de ataque simulado
- **Escopo:** Engagement planning, C2 design, AD attacks, OPSEC, social engineering, reporting
- **Uso prático:** Simular ataques realistas de APT
- **Output:** Cadeia de ataque, relatório executivo
- **Quando usar:** Exercício de segurança aprofundado

---

## 📊 MATRIZ DE DECISÃO RÁPIDA

| **Situação** | **Skills Recomendadas** | **Prioridade** |
|---|---|---|
| Teste de Penetração Completo | PTES 1-8 + Web/AD | ⭐⭐⭐ |
| Avaliação Rápida | Recon + Vulnerability Scanner | ⭐⭐ |
| Incidente de Segurança | Incident Response + Malware Analysis | ⭐⭐⭐ |
| Operação SOC 24/7 | SIEM + Threat Hunting + CSOC Automation | ⭐⭐⭐ |
| Segurança Cloud | Cloud Security + IaC Scanning | ⭐⭐ |
| Malware Suspeito | Malware Analysis + Reverse Engineering | ⭐⭐⭐ |
| Hardening Corporativo | Blue Team Defense + Network Security | ⭐⭐ |
| Validação Contínua | Vulnerability Scanner + Threat Hunting | ⭐⭐ |

---

## 🔧 COMO USAR COM CLAUDE CODE

```bash
# Instalar skills no seu workspace Claude Code
skill install claude-pentest-skills
skill install claude-code-cybersecurity-skill

# Usar em prompts
/pentest-intelligence-gathering "target.com"
/pentest-web-attacks "https://app.example.com"
/cloud-security "audit AWS account"
/threat-hunting "suspicious login patterns"
```

---

## 📚 Próximos Passos

1. **Clone os repositórios:**
   ```bash
   git clone https://github.com/bob-reis/claude-pentest-skills
   git clone https://github.com/Masriyan/Claude-Code-CyberSecurity-Skill
   ```

2. **Integre com seu Obsidian** para referência rápida

3. **Crie automações** com slash commands para seu workflow

4. **Combine skills** conforme sua estratégia de segurança

---

## 🎯 Resumo por Nível

- **Iniciante:** Recon, Vulnerability Scanner, Basic Network Security
- **Intermediário:** Web Security, Cloud Security, Incident Response
- **Avançado:** Red Team Operations, Exploit Development, Reverse Engineering
- **Especialista:** LLM Security Testing, AI Agent Audit, Advanced Threat Hunting
