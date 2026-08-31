import json
import requests
import numpy as np
from typing import List, Dict, Any
from langchain_ollama import ChatOllama, OllamaEmbeddings
from langchain.tools import tool
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import SystemMessage, HumanMessage

# Configurações do Mestre do PC
MESTRE_API_URL = "http://127.0.0.1:7777"
OPERATIONS_FILE = "v10/allowed-operations.json"
MEMORIES_FILE = "v10/data/memories/chat-memories.json"
OLLAMA_MODEL = "llama3.1" 
EMBEDDING_MODEL = "nomic-embed-text" # Modelo recomendado para embeddings no Ollama

def load_operations() -> List[Dict[str, Any]]:
    """Carrega as operações permitidas do arquivo JSON."""
    with open(OPERATIONS_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
        return data.get("operations", [])

def load_memories() -> List[Dict[str, Any]]:
    """Carrega as memórias do chat."""
    try:
        with open(MEMORIES_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data.get("memories", [])
    except FileNotFoundError:
        return []

def get_relevant_memories(query: str, memories: List[Dict[str, Any]], embeddings: OllamaEmbeddings, top_k=2):
    """
    Busca semântica simples para recuperar memórias relevantes.
    """
    if not memories:
        return ""

    # Gerar embedding da query
    query_vec = embeddings.embed_query(query)
    
    relevant_texts = []
    
    for mem in memories:
        # Usamos título + conteúdo para a busca
        text_to_embed = f"{mem.get('title', '')}: {mem.get('content', '')}"
        mem_vec = embeddings.embed_query(text_to_embed)
        
        # Similaridade de Cosseno simplificada (produto escalar para vetores normalizados)
        score = np.dot(query_vec, mem_vec)
        # Guardamos o texto e o score
        relevant_texts.append((score, text_to_embed))
    
    # Ordena por score descendente e pega os top_k
    relevant_texts.sort(key=lambda x: x[0], reverse=True)
    top_memories = [text for score, text in relevant_texts[:top_k]]
    
    return "\n\n".join(top_memories)

def create_mestre_tools(operations: List[Dict[str, Any]]):
    """Cria dinamicamente ferramentas do LangChain baseadas no catálogo."""
    tools = []
    for op in operations:
        def make_tool_func(op_id=op['id'], op_title=op['title']):
            @tool
            def execute_op(query: str = ""):
                """Executa a operação: {op_title}"""
                print(f"🚀 [Agente] Executando: {op_title}...")
                try:
                    response = requests.post(f"{MESTRE_API_URL}/run", json={"id": op_id})
                    return f"✅ {op_title} finalizado. Resposta: {response.text}" if response.status_code == 200 else f"❌ Erro: {response.text}"
                except Exception as e:
                    return f"❌ Falha na conexão: {str(e)}"
            execute_op.name = f"mestre_{op_id}"
            return execute_op
        tools.append(make_tool_func())
    return tools

def main():
    print("🤖 Inicializando Agente Mestre do PC com RAG (Memória)...")
    
    # 1. Inicializar componentes de IA
    llm = ChatOllama(model=OLLAMA_MODEL, temperature=0)
    embeddings = OllamaEmbeddings(model=EMBEDDING_MODEL)
    
    # 2. Carregar dados
    ops = load_operations()
    memories = load_memories()
    mestre_tools = create_mestre_tools(ops)
    
    # 3. Prompt do Agente
    prompt = ChatPromptTemplate.from_messages([
        ("system", "Você é o assistente do Mestre do PC. Você tem acesso a ferramentas de manutenção do Windows. "
                   "Sempre verifique o contexto de memórias fornecido para saber o que já foi feito ou problemas recorrentes. "
                   "Se não encontrar algo nas memórias, use as ferramentas. Responda em Português do Brasil."),
        ("placeholder", "{chat_history}"),
        ("human", "{input}"),
        ("placeholder", "{agent_scratchpad}"),
    ])
    
    agent = create_tool_calling_agent(llm, mestre_tools, prompt)
    agent_executor = AgentExecutor(agent=agent, tools=mestre_tools, verbose=True)
    
    print("\n--- Agente com Memória Pronto! (Digite 'sair' para encerrar) ---")
    while True:
        user_input = input("\n👤 Você: ")
        if user_input.lower() in ['sair', 'exit', 'quit']:
            break
        
        # --- Lógica de RAG ---
        print("🔍 Consultando memórias...")
        context = get_relevant_memories(user_input, memories, embeddings)
        
        if context:
            print(f"💡 Contexto encontrado: {context[:100]}...")
            # Injetamos a memória no input para que o agente a veja
            enriched_input = f"Contexto de memórias relevantes:\n{context}\n\nPergunta do usuário: {user_input}"
        else:
            enriched_input = user_input
            
        try:
            response = agent_executor.invoke({"input": enriched_input})
            print(f"\n🤖 Agente: {response['output']}")
        except Exception as e:
            print(f"\n❌ Erro: {str(e)}")

if __name__ == "__main__":
    main()
