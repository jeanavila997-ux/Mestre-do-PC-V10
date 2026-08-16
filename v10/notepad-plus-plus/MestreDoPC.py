# Mestre do PC V10 - Integração Notepad++ via PythonScript
# Autor: Copilot / Mestre do PC
# Uso: copie este arquivo para a pasta de scripts do PythonScript
#       (Plugins > PythonScript > Scripts) ou use "Plugins > PythonScript > New Script".
# Depois configure o token em MESTRE_NPP_TOKEN (sistema ou nas primeiras linhas abaixo).

from __future__ import print_function
import urllib2
import json
import os

# ---------------------------------------------------------------------------
# CONFIGURAÇÃO DO USUÁRIO
# ---------------------------------------------------------------------------
# Formas de definir o token (em ordem de prioridade):
# 1. Variável de ambiente MESTRE_NPP_TOKEN
# 2. Edite a linha abaixo (não recomendado para compartilhar o script):
HARDCODED_TOKEN = os.environ.get("MESTRE_NPP_TOKEN", "")

LAUNCHER_URL = os.environ.get("MESTRE_BASE_URL", "http://127.0.0.1:7777")
if LAUNCHER_URL.endswith("/"):
    LAUNCHER_URL = LAUNCHER_URL[:-1]

MAX_SELECTION_CHARS = 8000

# ---------------------------------------------------------------------------
# FUNÇÕES AUXILIARES
# ---------------------------------------------------------------------------
def _get_token():
    token = HARDCODED_TOKEN
    if not token:
        token = os.environ.get("MESTRE_NPP_TOKEN", "")
    return token

def _get_selected_text():
    text = editor.getSelText()
    if not text:
        # Nada selecionado: usa o documento inteiro, truncado.
        full = editor.getText()
        if len(full) > MAX_SELECTION_CHARS:
            text = full[:MAX_SELECTION_CHARS] + "\n\n[...truncado...]"
        else:
            text = full
    return text.decode("utf-8") if isinstance(text, str) else text

def _call_npp(action, payload):
    token = _get_token()
    if not token:
        notepad.messageBox(
            "Token nao configurado.\n\nDefina a variavel de ambiente MESTRE_NPP_TOKEN "
            "ou edite a constante HARDCODED_TOKEN no script.",
            "Mestre do PC - Erro",
            0
        )
        return None

    url = LAUNCHER_URL + "/npp"
    data = json.dumps({"action": action, "payload": payload}).encode("utf-8")
    req = urllib2.Request(url, data=data, headers={
        "Content-Type": "application/json",
        "X-Mestre-Client": "notepad-plus-plus",
        "X-Mestre-Npp-Token": token,
    })

    try:
        response = urllib2.urlopen(req, timeout=90)
        raw = response.read().decode("utf-8")
        result = json.loads(raw)
        if not result.get("success"):
            raise Exception(result.get("error", "Erro desconhecido no launcher"))
        return result.get("output", "")
    except urllib2.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            err = json.loads(body).get("error", str(e))
        except:
            err = body or str(e)
        raise Exception("HTTP " + str(e.code) + ": " + err)
    except Exception as e:
        raise Exception("Falha ao chamar Mestre do PC: " + str(e))

def _insert_result(title, content):
    notepad.new()
    editor.appendText(("# " + title + "\n\n").encode("utf-8"))
    editor.appendText(content.encode("utf-8"))
    editor.appendText("\n".encode("utf-8"))

def _ask_question(default_text=""):
    # PythonScript nao tem input nativo elegante; usamos um dialogo simples.
    # Retorna None se o usuario cancelar.
    from ctypes import windll
    user32 = windll.user32
    # Cria uma janela de input usando Prompt do Npp via notepad.prompt nao existe,
    # entao usamos um messageBox com instrucoes e lemos da area de transferencia.
    # Solucao simples: usa um InputBox do VBScript via WScript.Shell
    try:
        import win32com.client
        shell = win32com.client.Dispatch("WScript.Shell")
        return shell.Popup(default_text, 0, "Pergunta para a IA", 1) == 1
    except:
        return notepad.prompt("Pergunta:", "Mestre do PC - Pergunta para a IA", default_text)

# ---------------------------------------------------------------------------
# ACOES DISPONIVEIS
# ---------------------------------------------------------------------------
def mestre_explicar():
    text = _get_selected_text()
    if not text.strip():
        notepad.messageBox("Selecione um texto/codigo primeiro.", "Mestre do PC")
        return
    try:
        result = _call_npp("explain_code", {"text": text, "language": notepad.getCurrentLangAsString()})
        _insert_result("Explicacao do Mestre do PC", result)
    except Exception as e:
        notepad.messageBox(str(e), "Mestre do PC - Erro", 0)

def mestre_perguntar():
    text = _get_selected_text()
    if not text.strip():
        notepad.messageBox("Selecione um texto/codigo primeiro.", "Mestre do PC")
        return
    question = notepad.prompt("Pergunta:", "Mestre do PC - Pergunta para a IA", "O que isso faz?")
    if not question:
        return
    try:
        result = _call_npp("ask_ai", {"text": text, "question": question})
        _insert_result("Resposta do Mestre do PC", result)
    except Exception as e:
        notepad.messageBox(str(e), "Mestre do PC - Erro", 0)

def mestre_sugerir_comando():
    text = _get_selected_text()
    if not text.strip():
        notepad.messageBox("Selecione a descricao do problema primeiro.", "Mestre do PC")
        return
    try:
        result = _call_npp("suggest_cmd", {"text": text})
        _insert_result("Comando sugerido pelo Mestre do PC", result)
    except Exception as e:
        notepad.messageBox(str(e), "Mestre do PC - Erro", 0)

def mestre_diagnostico_rapido():
    try:
        result = _call_npp("quick_diag", {})
        _insert_result("Diagnostico rapido do Mestre do PC", result)
    except Exception as e:
        notepad.messageBox(str(e), "Mestre do PC - Erro", 0)

def mestre_buscar_web():
    text = _get_selected_text()
    query = notepad.prompt("Buscar na web:", "Mestre do PC - Busca", text.split("\n")[0][:80] if text else "")
    if not query:
        return
    try:
        result = _call_npp("search_web", {"query": query, "max_results": 5})
        _insert_result("Resultados da web - Mestre do PC", result)
    except Exception as e:
        notepad.messageBox(str(e), "Mestre do PC - Erro", 0)

# ---------------------------------------------------------------------------
# MENU PRINCIPAL
# ---------------------------------------------------------------------------
def mestre_menu():
    opcoes = [
        "1 - Explicar codigo/texto selecionado",
        "2 - Perguntar a IA sobre o selecionado",
        "3 - Sugerir comando do Mestre do PC",
        "4 - Diagnostico rapido do PC",
        "5 - Buscar na web pelo texto selecionado",
    ]
    msg = "Escolha uma acao:\n\n" + "\n".join(opcoes)
    escolha = notepad.prompt(msg, "Mestre do PC", "1")
    if not escolha:
        return
    try:
        n = int(escolha.strip())
    except:
        return
    if n == 1:
        mestre_explicar()
    elif n == 2:
        mestre_perguntar()
    elif n == 3:
        mestre_sugerir_comando()
    elif n == 4:
        mestre_diagnostico_rapido()
    elif n == 5:
        mestre_buscar_web()

# Registra funcoes no escopo global para permitir atalhos via Macro/Run.
globals()["mestre_menu"] = mestre_menu
globals()["mestre_explicar"] = mestre_explicar
globals()["mestre_perguntar"] = mestre_perguntar
globals()["mestre_sugerir_comando"] = mestre_sugerir_comando
globals()["mestre_diagnostico_rapido"] = mestre_diagnostico_rapido
globals()["mestre_buscar_web"] = mestre_buscar_web

# Atalho sugerido: Plugins > PythonScript > Configuration, associe uma funcao a um atalho.
# Exemplo: associe "mestre_menu" a Ctrl+Shift+M.
