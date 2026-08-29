# 🎤 Guia Rápido - Transcrição de Áudio no Mestre do PC

## ✅ Setup Concluído!

O modelo **Whisper Tiny** foi instalado com sucesso no Ollama.

## 🚀 Uso Imediato

### Via MCP Server (Recomendado)

```javascript
// Em qualquer cliente MCP conectado
const resultado = await mcp.callTool("transcrever_audio", {
  duracao_segundos: 30,  // 5-120 segundos
  idioma: "pt",          // pt, en, es, fr, etc.
  limpar_arquivo: true   // Remove áudio após uso
});

console.log(resultado.content[0].text);
```

### Via Script de Teste

```bash
cd Mestre-do-PC-V10-clean\mcp-server
node test-audio-transcription.js
```

## 📋 Exemplo de Saída

```
🎤 **Transcrição de Áudio**

⏱️ Duração gravada: 30s
🌐 Idioma: pt
⏱️ Tempo de transcrição: 1247ms

---

Olá, este é um teste de transcrição de áudio usando o Whisper no Mestre do PC.
A integração funcionou perfeitamente!

---

✅ Arquivo de áudio removido após transcrição.
```

## 🎯 Casos de Uso Práticos

### 1. Ditado de Email
```javascript
const email = await mcp.callTool("transcrever_audio", { duracao_segundos: 60 });
// Cole o texto no seu cliente de email
```

### 2. Notas de Reunião
```javascript
const nota1 = await mcp.callTool("transcrever_audio", { duracao_segundos: 120 });
const nota2 = await mcp.callTool("transcrever_audio", { duracao_segundos: 120 });
// Combine as transcrições
```

### 3. Comandos por Voz
```javascript
const comando = await mcp.callTool("transcrever_audio", { duracao_segundos: 10 });
// "Abra o Windows Terminal" → Execute o comando
```

### 4. Análise com IA
```javascript
// Transcrever
const transcricao = await mcp.callTool("transcrever_audio", { duracao_segundos: 60 });

// Analisar com IA
const analise = await mcp.callTool("perguntar_ia", {
  pergunta: `Resuma esta transcrição: ${transcricao.content[0].text}`
});
```

## ⚙️ Configuração Opcional: ffmpeg

Para melhor qualidade de gravação:

1. **Baixe:** https://ffmpeg.org/download.html
2. **Extraia:** `C:\ffmpeg`
3. **Adicione ao PATH:**
   ```powershell
   [Environment]::SetEnvironmentVariable(
     "Path",
     $env:Path + ";C:\ffmpeg\bin",
     "User"
   )
   ```

## 📊 Performance Esperada

| Duração | Tempo de Transcrição |
|---------|---------------------|
| 30s     | ~5-10 segundos      |
| 60s     | ~10-20 segundos     |
| 120s    | ~20-40 segundos     |

## 🛠️ Solução de Problemas

### "Ollama não está rodando"
```powershell
ollama serve
```

### "Modelo não encontrado"
```powershell
ollama pull dimavz/whisper-tiny
```

### "Microfone não detectado"
1. Verifique conexões do microfone
2. Configurações → Privacidade → Microfone
3. Reinicie o terminal

### "ffmpeg não encontrado"
- O sistema usará fallback PowerShell (qualidade inferior)
- Ou instale ffmpeg (recomendado)

## 📚 Documentação Completa

- [Guia detalhado](docs/transcricao-audio-whisper.md)
- [Changelog](CHANGELOG-OLLAMA-WHISPER.md)

## 🎉 Pronto para Usar!

A transcrição de áudio está integrada ao Mestre do PC V11.
Use via MCP Server em seus clientes preferidos.

---

**Dica:** Combine com outras ferramentas MCP como `perguntar_ia`, `analisar_codigo_powershell`, ou `enviar_webhook_discord` para criar fluxos de trabalho poderosos!
