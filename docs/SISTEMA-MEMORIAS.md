# 🧠 Sistema de Gestão de Memórias - Mestre do PC V10/V11

> **Data:** 17 de Agosto de 2026  
> **Versão:** 1.0.0  
> **Status:** ✅ Implementado e Funcional

---

## 📋 Visão Geral

O **Sistema de Gestão de Memórias** permite armazenar, organizar, exportar e importar conversas, comandos, contextos e notas importantes do chat do Mestre do PC. As memórias são salvas em formato estruturado e podem ser exportadas para **Excel (XLSX)**, **CSV** ou **JSON**.

---

## 🎯 Funcionalidades Principais

### 1. **Armazenamento de Memórias**
- ✅ Conversas com IA
- ✅ Comandos executados
- ✅ Contextos importantes
- ✅ Notas do usuário
- ✅ Diagnósticos de sistema
- ✅ Configurações salvas

### 2. **Organização**
- 📝 **6 Tipos de memória** categorizados
- 🏷️ **Sistema de tags** para classificação
- ⭐ **Níveis de importância** (1-5 estrelas)
- 📅 **Metadados automáticos** (data, fonte, contexto)

### 3. **Exportação**
- 📊 **CSV** - Compatível com Excel, Google Sheets, LibreOffice
- 📈 **Excel XML (XLSX)** - Formato nativo do Excel com formatação
- 📄 **JSON** - Formato estruturado para backup e integração

### 4. **Importação**
- 📥 Importa de CSV, Excel ou JSON
- 🔄 Validação automática de dados
- ⚠️ Tratamento de erros e duplicatas

### 5. **Busca e Filtros**
- 🔍 Busca full-text em título e conteúdo
- 🎯 Filtro por tipo de memória
- 🏷️ Filtro por tags
- 📅 Filtro por data

---

## 📁 Estrutura de Arquivos

```
Mestre-do-PC-V10-clean/
├── v10/
│   ├── memory-manager.js       # Módulo principal de gestão
│   ├── memory-routes.js        # Rotas da API
│   ├── memories.html           # Interface web de gestão
│   └── data/
│       └── memories/
│           └── chat-memories.json  # Arquivo de memórias
└── docs/
    └── SISTEMA-MEMORIAS.md     # Esta documentação
```

---

## 🔌 API REST - Endpoints

### **Base URL:** `http://127.0.0.1:7777`

### 1. **Criar Memória**
```http
POST /memories/create
Content-Type: application/json

{
  "type": "conversation",
  "title": "Configuração de Rede",
  "content": "Comando para resetar adaptador de rede...",
  "metadata": {
    "tags": ["rede", "config", "importante"],
    "importance": 4,
    "source": "chat"
  }
}
```

**Resposta:**
```json
{
  "success": true,
  "memory": {
    "id": "mem_1723912345678_abc123",
    "type": "conversation",
    "title": "Configuração de Rede",
    "content": "Comando para resetar adaptador de rede...",
    "metadata": {
      "createdAt": "2026-08-17T15:30:00.000Z",
      "updatedAt": "2026-08-17T15:30:00.000Z",
      "source": "chat",
      "tags": ["rede", "config", "importante"],
      "importance": 4
    }
  }
}
```

### 2. **Listar Memórias**
```http
GET /memories/list?type=conversation&tags=rede,config&search=comando&limit=50
```

**Parâmetros de Query:**
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `type` | string | Filtrar por tipo (conversation, command, context, note, diagnostic, config) |
| `tags` | string | Filtrar por tags (separadas por vírgula) |
| `search` | string | Busca full-text em título e conteúdo |
| `limit` | number | Limite de resultados (padrão: 100) |

### 3. **Obter Memória por ID**
```http
GET /memories/get/:id
```

### 4. **Atualizar Memória**
```http
PUT /memories/update/:id
Content-Type: application/json

{
  "title": "Novo Título",
  "content": "Novo Conteúdo",
  "metadata": {
    "tags": ["nova", "tag"],
    "importance": 5
  }
}
```

### 5. **Excluir Memória**
```http
DELETE /memories/delete/:id
```

### 6. **Buscar Memórias Relevantes**
```http
GET /memories/search?q=comando+rede&limit=5
```

**Algoritmo de Relevância:**
- Match no título: +10 pontos
- Match no conteúdo: +2 pontos por ocorrência
- Match nas tags: +5 pontos
- Importância (1-5): +1 a +5 pontos
- Recência (< 7 dias): +3 pontos
- Recência (< 30 dias): +2 pontos
- Recência (< 90 dias): +1 ponto

### 7. **Exportar Memórias**
```http
GET /memories/export?format=csv&type=conversation
```

**Formatos Suportados:**
- `csv` - CSV UTF-8 com escape de caracteres especiais
- `xlsx` ou `xml` - Excel XML com formatação
- `json` - JSON estruturado

**Cabeçalhos da Resposta:**
```
Content-Type: text/csv;charset=utf-8
Content-Disposition: attachment; filename="mestre-memories-2026-08-17T15-30-00.csv"
```

### 8. **Importar Memórias**
```http
POST /memories/import
Content-Type: application/json

{
  "format": "csv",
  "content": "ID,Tipo,Título,Conteúdo,..."
}
```

**Resposta:**
```json
{
  "success": true,
  "count": 15,
  "errors": []
}
```

### 9. **Estatísticas de Memórias**
```http
GET /memories/stats
```

**Resposta:**
```json
{
  "success": true,
  "stats": {
    "total": 150,
    "recentCount": 45,
    "byType": {
      "conversation": 60,
      "command": 40,
      "context": 20,
      "note": 15,
      "diagnostic": 10,
      "config": 5
    }
  }
}
```

---

## 📊 Formato de Exportação

### **CSV (Excel-Ready)**

**Cabeçalho:**
```csv
ID,Tipo,Título,Conteúdo,Data Criação,Data Atualização,Fonte,Tags,Importância,Contexto Adicional
```

**Exemplo:**
```csv
mem_1723912345678_abc123,conversation,"Configuração de Rede","Comando para resetar adaptador","17/08/2026 15:30:00","17/08/2026 15:30:00",chat,"rede; config; importante",4,"Contexto adicional"
```

**Características:**
- ✅ UTF-8 com BOM (compatível com Excel)
- ✅ Escape automático de vírgulas, aspas e quebras de linha
- ✅ Datas no formato brasileiro (dd/mm/yyyy hh:mm:ss)
- ✅ Tags separadas por ponto-e-vírgula
- ✅ Compatível com Excel, Google Sheets, LibreOffice Calc

### **Excel XML (XLSX)**

**Estrutura:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="header">
      <Font ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#4472C4" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Memórias do Chat">
    <Table>
      <!-- Colunas e Dados -->
    </Table>
  </Worksheet>
</Workbook>
```

**Características:**
- ✅ Abre nativamente no Excel como .xlsx
- ✅ Cabeçalho formatado (azul, negrito, branco)
- ✅ Colunas com largura otimizada
- ✅ Datas formatadas automaticamente
- ✅ Suporte a até 32.000 caracteres por célula

### **JSON**

**Estrutura:**
```json
{
  "memories": [
    {
      "id": "mem_1723912345678_abc123",
      "type": "conversation",
      "title": "Configuração de Rede",
      "content": "Comando para resetar adaptador...",
      "metadata": {
        "createdAt": "2026-08-17T15:30:00.000Z",
        "updatedAt": "2026-08-17T15:30:00.000Z",
        "source": "chat",
        "tags": ["rede", "config", "importante"],
        "importance": 4,
        "context": "Contexto adicional"
      }
    }
  ],
  "version": "1.0",
  "exportedAt": "2026-08-17T15:30:00.000Z"
}
```

---

## 🖥️ Interface Web

### **Acesso:**
```
http://127.0.0.1:7777/memories.html
```

### **Recursos da Interface:**

1. **Dashboard de Estatísticas**
   - Total de memórias
   - Memórias dos últimos 30 dias
   - Quantidade de tipos diferentes

2. **Barra de Ações**
   - Botão "+ Nova Memória"
   - Busca full-text
   - Filtro por tipo
   - Exportar (CSV, Excel, JSON)
   - Importar arquivo

3. **Grid de Memórias**
   - Cards responsivos
   - Tipo, título e conteúdo
   - Metadados (data, importância, fonte)
   - Tags visuais
   - Ações rápidas (editar, copiar, excluir)

4. **Modal de Criação/Edição**
   - Seleção de tipo
   - Título e conteúdo
   - Tags (separadas por vírgula)
   - Nível de importância (1-5)

5. **Notificações Toast**
   - Sucesso (verde)
   - Erro (vermelho)
   - Info (azul)

---

## 🔧 Como Usar

### **1. Criar Memória via API**

```javascript
// Exemplo em JavaScript
const response = await fetch('http://127.0.0.1:7777/memories/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'command',
    title: 'Limpeza de Disco',
    content: 'cleanmgr /sagerun:1',
    metadata: {
      tags: ['limpeza', 'disco', 'manutenção'],
      importance: 3,
      source: 'chat'
    }
  })
});

const data = await response.json();
console.log(data.memory);
```

### **2. Listar Memórias Filtradas**

```javascript
// Filtrar por tipo e buscar por texto
const response = await fetch(
  'http://127.0.0.1:7777/memories/list?type=command&search=limpeza&limit=20'
);

const data = await response.json();
console.log(data.memories);
```

### **3. Exportar para Excel**

```javascript
// Exporta todas as memórias de comando em formato Excel
const url = 'http://127.0.0.1:7777/memories/export?format=xlsx&type=command';
window.open(url, '_blank');
```

### **4. Importar de CSV**

```javascript
// Lê arquivo CSV e importa
const fileInput = document.getElementById('importFile');
const file = fileInput.files[0];

const reader = new FileReader();
reader.onload = async (e) => {
  const response = await fetch('http://127.0.0.1:7777/memories/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'csv',
      content: e.target.result
    })
  });
  
  const data = await response.json();
  console.log(`${data.count} memórias importadas!`);
};

reader.readAsText(file);
```

### **5. Buscar Memórias Relevantes**

```javascript
// Busca memórias relacionadas a "rede"
const response = await fetch(
  'http://127.0.0.1:7777/memories/search?q=configuração+rede&limit=5'
);

const data = await response.json();
console.log(data.memories);
```

---

## 📝 Tipos de Memória

| Tipo | Descrição | Exemplo de Uso |
|------|-----------|----------------|
| `conversation` | Conversas com IA | Respostas detalhadas da IA sobre troubleshooting |
| `command` | Comandos executados | Scripts PowerShell, comandos DISM, SFC |
| `context` | Contextos importantes | Informações de ambiente, configurações de rede |
| `note` | Notas do usuário | Anotações pessoais, lembretes |
| `diagnostic` | Diagnósticos de sistema | Resultados de testes, logs de erro |
| `config` | Configurações salvas | Configs de serviços, registry keys |

---

## 🏷️ Sistema de Tags

**Exemplos de Tags por Categoria:**

- **Rede:** `rede`, `tcpip`, `dns`, `dhcp`, `wifi`, `ethernet`
- **Sistema:** `windows`, `update`, `registro`, `servicos`, `drivers`
- **Segurança:** `defender`, `firewall`, `antivirus`, `permissões`
- **Limpeza:** `limpeza`, `disco`, `temp`, `cache`, `lixo`
- **Performance:** `ram`, `cpu`, `ssd`, `otimização`, `velocidade`
- **Backup:** `backup`, `restore`, `imagem`, `ponto-restauracao`

**Dicas:**
- Use tags curtas e descritivas
- Padronize tags similares (evite "rede" e "network")
- Use 3-5 tags por memória para melhor organização

---

## ⭐ Níveis de Importância

| Nível | Descrição | Uso Recomendado |
|-------|-----------|-----------------|
| ⭐ (1) | Baixa | Informações corriqueiras, comandos simples |
| ⭐⭐ (2) | Moderada | Comandos úteis, configurações menores |
| ⭐⭐⭐ (3) | Normal | Configurações padrão, procedimentos comuns |
| ⭐⭐⭐⭐ (4) | Alta | Configurações críticas, soluções de problemas complexos |
| ⭐⭐⭐⭐⭐ (5) | Crítica | Informações vitais, recovery, backup essencial |

---

## 🗄️ Armazenamento

**Local do Arquivo:**
```
C:\Users\Jeanc\Mestre-do-PC-V10-clean\v10\data\memories\chat-memories.json
```

**Estrutura do Arquivo:**
```json
{
  "memories": [
    {
      "id": "mem_1723912345678_abc123",
      "type": "conversation",
      "title": "Exemplo",
      "content": "Conteúdo da memória...",
      "metadata": {
        "createdAt": "2026-08-17T15:30:00.000Z",
        "updatedAt": "2026-08-17T15:30:00.000Z",
        "source": "chat",
        "tags": ["tag1", "tag2"],
        "importance": 3,
        "context": "Contexto adicional"
      }
    }
  ],
  "version": "1.0"
}
```

**Limite:**
- Máximo de **1000 memórias** armazenadas (rotação automática)
- Memórias mais antigas são removidas automaticamente

---

## 🧹 Limpeza Automática

**Função:** `cleanupOldMemories(days)`

Remove automaticamente memórias com mais de X dias.

**Uso via API:**
```javascript
// Remove memórias com mais de 90 dias
await fetch('http://127.0.0.1:7777/memories/cleanup?days=90', {
  method: 'POST'
});
```

**Recomendação:**
- Execute mensalmente com `days=90`
- Exporte backup antes da limpeza

---

## 🔐 Segurança

### **Autorização**
- Todas as rotas exigem autenticação via `X-Mestre-Client`
- Apenas clientes autorizados podem criar/editar/excluir
- Exportação e importação requerem permissão total

### **Validação**
- Conteúdo máximo: 32.000 caracteres
- Tags: máximo 10 por memória
- Título: máximo 200 caracteres
- Sanitização de inputs contra injection

### **Backup Recomendado**
```javascript
// Exporta backup completo semanalmente
const backup = await fetch('http://127.0.0.1:7777/memories/export?format=json');
// Salve em local seguro
```

---

## 📊 Casos de Uso

### **1. Backup de Configurações Importantes**
```javascript
await fetch('http://127.0.0.1:7777/memories/create', {
  method: 'POST',
  body: JSON.stringify({
    type: 'config',
    title: 'Configuração IP Estático',
    content: 'netsh interface ip set address "Ethernet" static 192.168.1.100 255.255.255.0 192.168.1.1',
    metadata: {
      tags: ['rede', 'ip', 'config'],
      importance: 5
    }
  })
});
```

### **2. Salvar Conversa com IA**
```javascript
// Após receber resposta importante da IA
await fetch('http://127.0.0.1:7777/memories/create', {
  method: 'POST',
  body: JSON.stringify({
    type: 'conversation',
    title: 'Solução Erro Windows Update 0x80070005',
    content: iaResponse,
    metadata: {
      tags: ['windows-update', 'erro', 'solução'],
      importance: 4,
      source: 'ollama-chat'
    }
  })
});
```

### **3. Exportar Relatório Mensal**
```javascript
// Exporta memórias do mês em Excel
const url = `http://127.0.0.1:7777/memories/export?format=xlsx&startDate=${startDate}&endDate=${endDate}`;
window.open(url);
```

### **4. Compartilhar Configurações com Equipe**
```javascript
// Exporta apenas configs
const url = 'http://127.0.0.1:7777/memories/export?format=json&type=config';
// Envia arquivo JSON para equipe
```

---

## 🛠️ Troubleshooting

### **Memórias não carregam**
- Verifique se o launcher está rodando
- Acesse `http://127.0.0.1:7777/ping` para testar conexão
- Verifique console do navegador por erros

### **Exportação falha**
- Verifique permissões de download do navegador
- Tente formato diferente (CSV ao invés de XLSX)
- Reduza filtros (muitas memórias podem causar timeout)

### **Importação falha**
- Verifique formato do arquivo (deve ser CSV, JSON ou XML válido)
- Valide estrutura do arquivo (colunas no CSV, schema no JSON)
- Verifique tamanho do arquivo (máximo 10MB)

### **Memórias duplicadas após importação**
- O sistema gera novos IDs para evitar conflitos
- Use busca para encontrar duplicatas antes de importar
- Considere excluir duplicatas manualmente

---

## 📈 Roadmap

- [ ] Criar MCP tools para gestão de memórias
- [ ] Integração automática: salvar conversas importantes
- [ ] Agendamento de backups automáticos
- [ ] Compartilhamento direto via link
- [ ] Versão de memórias (histórico de edições)
- [ ] Criptografia de memórias sensíveis
- [ ] Sync com nuvem (OneDrive, Google Drive)

---

## 📞 Suporte

- **Documentação:** `docs/SISTEMA-MEMORIAS.md`
- **Interface:** `http://127.0.0.1:7777/memories.html`
- **Arquivo de Dados:** `v10/data/memories/chat-memories.json`

---

**Mestre do PC V11** - Desenvolvido por JEAN  
*Versão: 11.3.0 (Sistema de Memórias)*
