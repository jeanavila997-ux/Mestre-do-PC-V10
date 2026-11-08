# Transcrição de Áudio com Whisper no Mestre do PC

## Visão Geral

O Mestre do PC V11 agora suporta transcrição de áudio local usando o modelo **Whisper** via Ollama. Esta funcionalidade permite:

- 🎤 Gravar áudio do microfone
- 📝 Transcrever fala para texto em português ou outros idiomas
- 🔒 Processamento 100% local e privado
- ⚡ Sem limites de uso ou custos de API

## Requisitos

### 1. Modelo Whisper no Ollama

O modelo `dimavz/whisper-tiny` deve estar instalado:

```powershell
ollama pull dimavz/whisper-tiny
```

Verificar instalação:

```powershell
ollama list | Select-String whisper
```

### 2. ffmpeg (Opcional, mas recomendado)

Para gravação de áudio de alta qualidade, instale o ffmpeg:

1. Baixe de: https://ffmpeg.org/download.html
2. Extraia para `C:\ffmpeg`
3. Adicione ao PATH:
   ```powershell
   [Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\ffmpeg\bin", "User")
   ```

**Sem ffmpeg:** O sistema usa um fallback com PowerShell, mas com funcionalidade limitada.

### 3. Microfone

- Microfone conectado e funcionando
- Permissões de áudio concedidas ao terminal/MCP server

## Uso via MCP Server

### Ferramenta `transcrever_audio`

**Parâmetros:**

| Nome | Tipo | Padrão | Descrição |
|------|------|--------|-----------|
| `duracao_segundos` | number | 30 | Duração da gravação (5-120s) |
| `idioma` | string | "pt" | Código do idioma (pt, en, es, fr, etc) |
| `limpar_arquivo` | boolean | true | Remove áudio após transcrever |

**Exemplo de uso:**

```javascript
// Via cliente MCP
const result = await mcp.callTool("transcrever_audio", {
  duracao_segundos: 60,
  idioma: "pt-BR",
  limpar_arquivo: true,
});
```

**Resposta:**

```
🎤 **Transcrição de Áudio**

⏱️ Duração gravada: 60s
🌐 Idioma: pt-BR
⏱️ Tempo de transcrição: 1247ms

---

Olá, este é um teste de transcrição de áudio usando o Whisper no Mestre do PC.
A precisão é impressionante para um modelo tão pequeno!

---

✅ Arquivo de áudio removido após transcrição.
```

## Uso Programático

### Módulo `audio-transcriber.js`

```javascript
import * as audioTranscriber from "./audio-transcriber.js";

// Gravar e transcrever em um passo
const result = await audioTranscriber.recordAndTranscribe(
  30,  // segundos
  "pt", // idioma
  true  // limpar arquivo
);

console.log(result.text);

// Ou usar funções separadas:
const { audioPath } = await audioTranscriber.recordAudio(30);
const transcription = await audioTranscriber.transcribeAudio(audioPath, "pt");
await audioTranscriber.cleanupTempAudio(1); // limpa arquivos > 1 hora
```

### Funções Disponíveis

| Função | Descrição |
|--------|-----------|
| `recordAudio(durationSeconds)` | Grava áudio do microfone |
| `transcribeAudio(audioPath, language)` | Transcreve arquivo de áudio |
| `recordAndTranscribe(duration, language, cleanup)` | Grava e transcreve em um passo |
| `cleanupTempAudio(olderThanHours)` | Limpa arquivos temporários |

## Casos de Uso

### 1. Ditado de Texto

```javascript
// Ditado de 2 minutos
const texto = await audioTranscriber.recordAndTranscribe(120, "pt");
// Use o texto em um documento, email, etc.
```

### 2. Notas de Voz

```javascript
// Gravar nota rápida de 30s
const nota = await audioTranscriber.recordAndTranscribe(30, "pt");
// Salvar em arquivo de notas
```

### 3. Comandos por Voz

```javascript
// Transcrever comando de voz
const comando = await audioTranscriber.recordAndTranscribe(10, "pt");
// Processar comando (ex: "abra o windows terminal")
```

### 4. Transcrição de Reuniões

```javascript
// Gravar trechos de reunião (respeitando limites de 2min)
const trecho1 = await audioTranscriber.recordAndTranscribe(120, "pt");
const trecho2 = await audioTranscriber.recordAndTranscribe(120, "pt");
// Juntar transcrições
```

## Idiomas Suportados

O Whisper suporta 100+ idiomas. Códigos comuns:

| Código | Idioma |
|--------|--------|
| `pt` | Português |
| `en` | Inglês |
| `es` | Espanhol |
| `fr` | Francês |
| `de` | Alemão |
| `it` | Italiano |
| `ja` | Japonês |
| `zh` | Chinês |

## Estrutura de Arquivos

```
Mestre-do-PC-V10-clean/
├── mcp-server/
│   ├── index.js                 # Handler da ferramenta transcrever_audio
│   ├── audio-transcriber.js     # Módulo de gravação e transcrição
│   └── logs/
│       └── audio-temp/          # Arquivos temporários de áudio
└── docs/
    └── transcricao-audio-whisper.md  # Esta documentação
```

## Segurança e Privacidade

- ✅ **100% local**: Áudio nunca sai do seu PC
- ✅ **Sem nuvem**: Processamento feito pelo Ollama local
- ✅ **Limpeza automática**: Arquivos temporários removidos após uso
- ✅ **Auditoria**: Operações registradas em `logs/audit/`

## Solução de Problemas

### Erro: "ffmpeg não encontrado"

**Solução:** Instale o ffmpeg ou use gravação manual via PowerShell.

### Erro: "Whisper falhou: HTTP 404"

**Solução:** O modelo Whisper não está instalado:
```powershell
ollama pull dimavz/whisper-tiny
```

### Erro: "Não foi possível acessar o microfone"

**Solução:**
1. Verifique se o microfone está conectado
2. Permissões do Windows: Configurações → Privacidade → Microfone
3. Teste o microfone em outro aplicativo

### Transcrição de Baixa Qualidade

**Melhorias:**
- Use um microfone de melhor qualidade
- Fale claramente e próximo ao microfone
- Evite ruído ambiente
- Aumente a duração da gravação se necessário

### Timeout na Transcrição

O timeout padrão é 120 segundos. Se ocorrer timeout:

1. Verifique se o Ollama está rodando
2. Tente com áudios mais curtos (30s)
3. Reinicie o servidor Ollama

## Performance

| Duração do Áudio | Tempo de Transcrição (CPU) | Tempo de Transcrição (GPU) |
|------------------|---------------------------|---------------------------|
| 30 segundos | ~5-10s | ~1-3s |
| 1 minuto | ~10-20s | ~3-5s |
| 2 minutos | ~20-40s | ~5-10s |

*Tempos aproximados usando Whisper Tiny*

## Limitações

1. **Duração máxima:** 120 segundos por gravação
2. **Modelo Tiny:** Precisão boa, mas não perfeita (trade-off por tamanho)
3. **Ruído:** Ambiente ruidoso afeta a precisão
4. **Sotaques fortes:** Podem reduzir a precisão

## Modelos Whisper Alternativos

Se precisar de mais precisão, procure outros modelos Whisper no Ollama:

```powershell
# Buscar modelos Whisper disponíveis
ollama search whisper

# Instalar modelo alternativo (se disponível)
ollama pull whisper-base  # Exemplo hipotético
```

## Integração com Outras Ferramentas

### Com `perguntar_ia`

```javascript
// 1. Transcrever áudio
const transcricao = await audioTranscriber.recordAndTranscribe(60, "pt");

// 2. Enviar para IA analisar
const analise = await mcp.callTool("perguntar_ia", {
  pergunta: `Analise esta transcrição: ${transcricao.text}`
});
```

### Com `analisar_logs_sistema`

```javascript
// Transcrever nota de voz sobre problema
const problema = await audioTranscriber.recordAndTranscribe(30, "pt");

// Analisar logs do sistema
const logs = await mcp.callTool("analisar_logs_sistema");

// Combinar informações
const solucao = await mcp.callTool("perguntar_ia_com_contexto", {
  pergunta: "Como resolver este problema?",
  contexto: `${problema.text}\n\n${logs.content}`
});
```

## Futuro

Melhorias planejadas:

- [ ] Suporte a streaming de áudio em tempo real
- [ ] Detecção automática de idioma
- [ ] Modelos Whisper maiores (base, small, medium, large)
- [ ] Pontuação e formatação automática
- [ ] Identificação de falantes (diarization)
- [ ] Comandos por voz pré-definidos

## Referências

- [Ollama Whisper (dimavz/whisper-tiny)](https://ollama.com/dimavz/whisper-tiny)
- [OpenAI Whisper](https://github.com/openai/whisper)
- [ffmpeg Documentation](https://ffmpeg.org/documentation.html)
- [Mestre do PC V10/V11](../README.md)
