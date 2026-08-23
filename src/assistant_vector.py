# assistant_vector.py
import os
from langchain.memory import VectorStoreRetrieverMemory
from langchain_community.vectorstores import Chroma
from langchain.embeddings import SentenceTransformerEmbeddings
from langchain.llms import OpenAI
from langchain_community.chat_message_histories import SQLiteChatMessageHistory

DB_PATH = r"C:\Users\Jeanc\Mestre-do-PC-V10-clean\memory\historico.db"
SESSION_ID = "usuario-01"

# histórico textual persistido
chat_history = SQLiteChatMessageHistory(
    session_id=SESSION_ID,
    connection_string=f"sqlite:///{DB_PATH}"
)

# vetor store (Chroma + embeddings) – persistido em disco
embedder = SentenceTransformerEmbeddings(model_name="all-MiniLM-L6-v2")
vector_store = Chroma(
    collection_name="memoria_chat",
    embedding_function=embedder,
    persist_directory=r"C:\Users\Jeanc\Mestre-do-PC-V10-clean\memory\embeddings"
)

memory = VectorStoreRetrieverMemory(
    vectorstore=vector_store,
    k=4,                 # número de mensagens relevantes a recuperar
    search_type="mmr"   # diversifica resultados (relevância + diversidade)
)

llm = OpenAI(model="gpt-4o-mini")

def run_chat(user_input: str) -> str:
    chat_history.add_user_message(user_input)
    # Recupera as k mensagens mais semânticas
    relevant = memory.load_memory_variables({})["history"]
    prompt = "\n".join(
        f"{msg.role.capitalize()}: {msg.content}" for msg in relevant
    ) + f"\nUser: {user_input}\nAssistant:"
    answer = llm(prompt)
    chat_history.add_ai_message(answer)
    return answer

if __name__ == "__main__":
    while True:
        txt = input("Você: ")
        if txt.lower() in {"sair", "exit", "quit"}:
            break
        print("Assistente:", run_chat(txt))
