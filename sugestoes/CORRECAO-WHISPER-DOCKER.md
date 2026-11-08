# 🚫 Correção: `dimavz/whisper-tiny` é modelo do Ollama, NÃO imagem Docker

> **Status:** Esclarecimento registrado — nada foi alterado no projeto.
> **Motivo:** Um assistente de IA externo orientou usar `docker pull dimavz/whisper-tiny:latest` e afirmou que "Docker é obrigatório". Isso é **incorreto** para o Mestre do PC.

---

## ❌ O que o aviso errado dizia

> "Esse nome parece referir-se a uma imagem Docker do Whisper... Docker é obrigatório. Se você não tem, instale o Docker Desktop."

## ✅ O que é verdade no projeto

`dimavz/whisper-tiny` é um **modelo da biblioteca do Ollama** (repositório `ollama.com/library/dimavz/whisper-tiny`), instalado e executado pelo **Ollama local** — não pelo Docker.

### Prova verificada no sistema (data da revisão)

| Verificação | Resultado |
|---|---|
| Ollama rodando em `http://127.0.0.1:11434` | ✅ Ativo |
| Modelo `dimavz/whisper-tiny:latest` instalado | ✅ `ollama list` confirma |
| Docker instalado na máquina | ❌ Não instalado |
| Transcrição funcionando sem Docker | ✅ Documentado como OK |

Se fosse imagem Docker, seria impossível o modelo existir no Ollama local com Docker ausente.

### Evidência no código

`mcp-server/audio-transcriber.js` chama a **API HTTP do Ollama**:

```javascript
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const WHISPER_MODEL = "dimavz/whisper-tiny";      // modelo Ollama
...
await fetch(`${OLLAMA_URL}/api/generate`, { ... })  // endpoint do Ollama
```

### Evidência na documentação do projeto

- `mcp-server/WHISPER-README.md` → `ollama pull dimavz/whisper-tiny`
- `mcp-server/RESUMO-INTEGRACAO-WHISPER.md` → "Modelo: `dimavz/whisper-tiny` | Tamanho: 44 MB | Local: Ollama local"
- `docs/transcricao-audio-whisper.md` → mesmo procedimento

---

## ✅ Uso correto (como o projeto já usa)

```powershell
# 1. Modelo já instalado no Ollama
ollama list                       # → dimavz/whisper-tiny:latest

# 2. Transcrever via MCP (sem Docker!)
cd mcp-server
node test-audio-transcription.js
```

Requisitos reais:

| Dependência | Obrigatória? | Observação |
|---|---|---|
| Ollama | ✅ Sim | Já instalado e rodando |
| ffmpeg | ⚠️ Opcional | Melhora qualidade da gravação; fallback PowerShell existe |
| Docker | ❌ **Não** | Não é usado em nenhuma camada |

---

## 💡 Quando o Aviso do outro assistente faria sentido

Somente se alguém estivesse usando uma **imagem Docker separada** do Whisper (ex.: `docker run ... whisper` para testes isolados). Não é o caso deste projeto, que usa o **Ollama** como runtime de modelos.

---

## ✅ Conclusão

- **Siga a documentação do projeto**, não a orientação genérica recebida.
- Se um assistente externo sugerir `docker pull` para `dimavz/whisper-tiny`, **corrija** apontando para este documento.
- O fluxo correto: Ollama → `ollama pull dimavz/whisper-tiny` → MCP `transcrever_audio` → Whisper transcreve localmente.

*Documento de esclarecimento técnico — Mestre do PC V10-clean.*
