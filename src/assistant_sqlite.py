# assistant_sqlite.py
import os
from langchain.memory import ConversationBufferMemory
from langchain_community.chat_message_histories import SQLChatMessageHistory
from langchain.llms import OpenAI

DB_PATH = r"C:\Users\Jeanc\Mestre-do-PC-V10-clean\memory\historico.db"
SESSION_ID = "usuario-01"

chat_history = SQLChatMessageHistory(
    session_id=SESSION_ID,
    connection_string=f"sqlite:///{DB_PATH}"
)

memory = ConversationBufferMemory(
    chat_memory=chat_history,
    return_messages=True
)

llm = OpenAI(model="gpt-4o-mini", temperature=0.2)

def run_chat(user_input: str) -> str:
    # salva a mensagem do usuário
    chat_history.add_user_message(user_input)
    # converte o histórico em texto simples (LangChain já concatena)
    prompt_msgs = memory.load_memory_variables({})["history"]
    prompt_text = "\n".join(
        f"{msg.type.capitalize()}: {msg.content}" for msg in prompt_msgs
    ) + "\nAssistant:"
    # gera a resposta
    answer = llm(prompt_text)
    # persiste a resposta
    chat_history.add_ai_message(answer)
    return answer

if __name__ == "__main__":
    while True:
        txt = input("Você: ")
        if txt.lower() in {"sair", "exit", "quit"}:
            break
        print("Assistente:", run_chat(txt))
