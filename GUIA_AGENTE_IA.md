# 🤖 Guia do Agente de IA - Mestre do PC V10

Este guia ensina como configurar e utilizar o Agente de IA baseado em LangChain e Ollama para orquestrar as manutenções do seu computador.

## 🌟 O que é este Agente?
Diferente de um chat comum, este agente possui **Capacidades Operacionais** e **Memória Semântica**:
1. **Ações Reais**: Ele pode executar qualquer comando listado no `allowed-operations.json` através da API do Mestre do PC.
2. **Memória (RAG)**: Ele consulta o histórico de memórias do sistema para entender problemas recorrentes antes de agir.
3. **Segurança**: Ele não executa código arbitrário; ele apenas solicita a execução de ferramentas pré-aprovadas na whitelist.

---

## 🛠️ Pré-requisitos

### 1. Ollama (Modelos Necessários)
Você precisa ter o Ollama instalado e os seguintes modelos baixados:
```bash
# Modelo de Chat (Inteligência e Tomada de Decisão)
ollama pull llama3.1

# Modelo de Embeddings (Busca de Memórias)
ollama pull nomic-embed-text
```

### 2. Backend Mestre do PC
O agente se comunica com o launcher Node.js. Certifique-se de que ele está rodando:
```powershell
cd v10
npm start
```

### 3. Dependências Python
Instale as bibliotecas necessárias:
```bash
pip install -qU langchain-ollama requests numpy
```

---

## 🚀 Como Iniciar

Para ligar o agente, execute o script na raiz do projeto:
```bash
python langchain_mestre_agent.py
```

---

## 📖 Exemplos de Uso

| O que você diz | O que o Agente faz |
| :--- | :--- |
| *"Meu PC está lento, pode limpar?"* | Busca memórias de limpeza $\rightarrow$ Chama `limpeza_profunda_tudo` |
| *"Como estava a minha internet ontem?"* | Consulta `chat-memories.json` $\rightarrow$ Relata a latência salva nas memórias |
| *"Verifica se há atualizações"* | Chama `listar_atualizacoes_winget` e analisa o resultado |
| *"O que você fez na última sessão?"* | Recupera a memória mais recente e resume as alterações |

---

## ⚙️ Arquitetura Técnica (Fluxo de Trabalho)

1. **Entrada**: Usuário digita uma pergunta.
2. **Recuperação (RAG)**: O agente transforma a pergunta em um vetor e busca no `chat-memories.json` os trechos mais similares.
3. **Raciocínio**: O LLM recebe: `[Memórias Relevantes] + [Lista de Ferramentas] + [Pergunta]`.
4. **Ação**: Se necessário, o LLM emite uma chamada de ferramenta (Tool Call).
5. **Execução**: O script envia um `POST` para `http://127.0.0.1:7777/run`.
6. **Resposta**: O resultado do PowerShell é retornado ao LLM, que traduz para uma linguagem natural para o usuário.

---

## ⚠️ Notas de Segurança
- **Whitelist**: O agente nunca poderá executar um comando que não esteja no `allowed-operations.json`.
- **Privilégios**: A execução depende das permissões do processo que iniciou o `launcher.js`.
