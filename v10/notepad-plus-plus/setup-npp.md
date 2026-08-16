# Guia de integração: Mestre do PC + Notepad++

## O que é
Esta integração permite que o Notepad++ envie texto/código selecionado para o Mestre do PC V10 e receba respostas da IA local (Ollama) ou comandos do sistema diretamente no editor.

## Requisitos
1. **Mestre do PC V10 rodando** (`http://127.0.0.1:7777`).
2. **Ollama rodando** com um modelo compatível (ex: `qwen2.5-coder:3b-instruct`).
3. **Notepad++** instalado.
4. Plugin **PythonScript** instalado no Notepad++.
   - Plugins > Plugins Admin > procure **PythonScript** > Install.
   - Reinicie o Notepad++.

## Configuração

### 1. Gerar/ definir o token de segurança
A integração só funciona se o launcher conhecer um token compartilhado.

**Opção A - variável de ambiente do sistema (recomendada):**
```powershell
[Environment]::SetEnvironmentVariable("MESTRE_NPP_TOKEN", "sua-chave-secreta-aqui", "User")
```
Reinicie o Notepad++ e o Mestre do PC para aplicar.

**Opção B - via `MestreDoPC-Launcher.ps1`:**
Edite o atalho/batch de inicialização e adicione:
```powershell
$env:MESTRE_NPP_TOKEN = "sua-chave-secreta-aqui"
```

### 2. Copiar o script PythonScript
1. No Notepad++: Plugins > PythonScript > Scripts > New Script.
2. Nomeie como `MestreDoPC.py`.
3. Cole o conteúdo do arquivo `v10/notepad-plus-plus/MestreDoPC.py`.
4. Salve.

### 3. Criar atalhos (opcional, mas recomendado)
1. Plugins > PythonScript > Configuration.
2. Em **User scripts**, selecione `MestreDoPC.py`.
3. Clique em **Add** para associar a função `mestre_menu` a um atalho de teclado (ex: `Ctrl+Shift+M`).
4. Alternativamente, use o menu Executar (Run) com o comando:
   ```
   pythonscript -f mestre_menu
   ```

## Ações disponíveis
Ao pressionar o atalho, um menu aparece com as opções:

| # | Ação | Descrição |
|---|------|-----------|
| 1 | Explicar código/texto | Envia o trecho selecionado para a IA e insere a explicação em um novo documento. |
| 2 | Perguntar à IA | Pergunta algo sobre o texto selecionado. |
| 3 | Sugerir comando | Pede à IA um comando do Mestre do PC para resolver o problema descrito. |
| 4 | Diagnóstico rápido | Gera relatório rápido do PC e cola no editor. |
| 5 | Buscar na web | Busca o texto selecionado na web (DuckDuckGo). |

## Segurança
- O endpoint `/npp` só aceita ações **somente-leitura** ou de **IA**.
- Nenhuma operação destrutiva (`encerrar_processo`, `desativar_servico`, `limpar_*`) é permitida via Notepad++.
- O token (`MESTRE_NPP_TOKEN`) é obrigatório. Sem ele, o endpoint retorna `501`.
- Não compartilhe seu token nem o deixe em repositórios públicos.

## Solução de problemas
- **"Integração Notepad++ não configurada"**: defina `MESTRE_NPP_TOKEN` e reinicie o launcher.
- **"Cliente não autorizado"**: verifique se o token no script coincide com o do launcher.
- **"Ollama offline"**: confirme que o Ollama está rodando em `http://127.0.0.1:11434`.
- **Erro de encoding**: certifique-se de que o script foi salvo como UTF-8.
