# 🎤 Sugestão: Integração de Funções de Voz (TTS + STT) no Mestre do PC

> **Status:** Proposta — nada foi alterado no projeto.
> **Escopo:** Integrar TTS (texto para fala) e STT (fala para texto) no Mestre-do-PC-V10-clean.
> **Base:** Revisão do código-fonte + scripts de voz pt-BR analisados (`analise_audio`, `check_admin`, `instalar_tts_stt_ptbr`, `testar_tts_stt_ptbr`, `verificar_idioma`).

---

## 1. Revisão do projeto (estado atual)

### 1.1 Arquitetura principal

```
┌───────────────────────────┐        POST /run (whitelist)        ┌──────────────────────┐
│ v10/index.html            │ ──────────────────────────────────▶ │ v10/launcher.js      │
│ UI monolítica (dashboard, │ ◀────────────────────────────────── │  Node.js elevado     │
│  catálogo, chat IA)       │      /run-status (polling)          │  127.0.0.1:7777      │
└───────────────────────────┘                                      └─────────┬────────────┘
        │                                                                     │ PowerShell (admin)
        │  POST /ollama/chat (proxy streaming)                                ▼
        ▼                                                              ┌─────────────┐
┌───────────────────────────┐        MCP (stdio)                       │ Windows     │
│ mcp-server/index.js       │ ◀────────────────────────────────────── │  + Ollama   │
│  (tools MCP: perguntar_ia,│   usado por clientes externos            │  11434      │
│   transcrever_audio, ...) │                                          └─────────────┘
└───────────────────────────┘
```

### 1.2 O que já existe relacionado a voz

| Componente | Onde | Estado |
|---|---|---|
| **STT Whisper** (`transcrever_audio`) | `mcp-server/audio-transcriber.js` + tool no `mcp-server/index.js:1405,1865` | ✅ Implementado, **porém só via MCP** — não aparece na UI |
| **Gravação de áudio** (`recordAudio`, ffmpeg/fallback PS) | `mcp-server/audio-transcriber.js` | ✅ Implementado (requer ffmpeg p/ qualidade) |
| **Campo `voice` nos perfis** (`autoRead`, `lang: pt-BR`) | `v10/chat-agent/profiles/agent-profiles.json` | ✅ Scaffold criado, **sem consumidor** |
| **Botões de voz no mockup** (Web Speech API) | `sugestoes/chat-ia-redesign/mockup.html` + `README.md` | 📋 Proposta de design, **não implementada** |
| **TTS (falar texto)** | — | ❌ **Não existe em nenhuma camada** |
| **Voz nativa do Windows (System.Speech / pt-BR)** | Scripts avulsos (`instalar_tts_stt_ptbr`, `testar_tts_stt_ptbr`, etc.) | 📄 Apenas scripts independentes, fora do projeto |

### 1.3 Lacunas identificadas na revisão

1. **A ferramenta `transcrever_audio` existe só no MCP** — o app web (a interface real do usuário) não tem botão de microfone nem transcrição.
2. **Não há TTS em nenhuma camada** — o Mestre IA responde apenas por texto.
3. **O launcher não tem endpoints de voz** — a UI não tem como chamar fala nativa do Windows (TTS offline garantido).
4. **O campo `voice` dos perfis do agente está órfão** — foi planejado (`agent-profiles.json`) mas nenhum código o consome.
5. **`sugestoes/chat-ia-redesign` já propõe botões de voz** — é a base visual ideal, mas a proposta não cobre backend (nativo Windows) nem o fluxo de **comando por voz → whitelist**.
6. **Sem verificação de idioma/vozes** — não há diagnóstico de "pt-BR instalado, voz X disponível" dentro do app (os scripts avulsos fazem isso, mas não são parte do projeto).

---

## 2. Onde integrar (pontos de maior valor)

### 2.1 ⭐ Chat Mestre IA — `v10/index.html` (modal `#iaOverlay`, ~linhas 905–968 e JS ~1572–2900)

É o local de **maior impacto**: o chat é o ponto onde o usuário conversa com o assistente.

| Recurso proposto | Descrição |
|---|---|
| 🎙️ **Microfone no input** (`#iaInput`) | Botão de mic ao lado do campo: grava e transcreve (STT) preenchendo o campo de mensagem. Ex.: "abra o terminal" vira texto no input. |
| 🔊 **Botão "falar" por mensagem** | Ícone de alto-falante em cada bolha de resposta da IA → TTS lê o texto daquela resposta. |
| ⚙️ **Toggle "Ler automaticamente"** | Lê a resposta da IA em voz alta ao chegar. Deve respeitar o campo `voice.autoRead` dos perfis (`agent-profiles.json`). |
| 🎯 **Comando por voz** | Após STT, o texto entra no pipeline existente `classifyCommand` → `askCommandConfirmation` (comandos destrutivos pedem confirmação) — reaproveitando a segurança atual, sem comando livre. |
| 🌐 **Seletor de voz/idioma** | Lista vozes disponíveis (Windows + Web Speech) e permite escolher; padrão `pt-BR`. |

**Por quê aqui:** o fluxo já existe (`sendIA()`, `iaInput`, `addIAMessage`); o STT/TTS entram como pré/pós-processamento sem reescrever o chat. É também o lugar que o redesign `chat-ia-redesign` já mapeou.

### 2.2 ⭐ MCP Server — novos tools complementares

| Tool proposta | Função | Espelha |
|---|---|---|
| `falar_texto` (TTS) | Recebe texto e fala usando voz nativa do Windows (System.Speech) — permite o Mestre IA **falar** respostas e notificações | ✅ Completa o par com `transcrever_audio` (STT) |
| `transcrever_audio` (já existe) | STT Whisper — **manter** e documentar melhor (UI não sabe que existe) | — |
| `listar_vozes` (diagnóstico) | Lista vozes TTS instaladas, idiomas do sistema, mic disponível — espelha os scripts `verificar_idioma`/`analise_audio` | — |

**Verificação:** qualquer agente MCP (Claude Desktop, etc.) passa a **ouvir e falar**, não só transcrever.

### 2.3 🟠 Launcher — 2 endpoints novos (base para TTS nativo offline)

| Endpoint | Método | Ação |
|---|---|---|
| `POST /voice/tts` | JSON `{text, voice?}` | Fala o texto com `System.Speech` (voz pt-BR instalada) — **offline, sem navegador** |
| `POST /voice/stt` | JSON `{duracao_segundos}` | Grava do mic e transcreve reutilizando `audio-transcriber.js` (Whisper) — permite **push-to-talk** sem depender de permissão de microfone do navegador |

**Por que via launcher e não só Web Speech API:**

| Critério | Web Speech API (navegador) | Launcher + System.Speech/Whisper |
|---|---|---|
| Dependência | Nenhuma (Chrome/Edge) | ffmpeg (melhor qualidade) + Ollama p/ STT |
| TTS offline garantido | Não (depende de voz do SO) | ✅ Sim (vozes instaladas) |
| STT offline | Não (online MS pode rejeitar pt-BR) | ✅ Sim (Whisper local) |
| Permissão de mic | Sim, navegador | Sim, Windows (uma vez) |
| Controle de voz do SO | Não | ✅ Sim (`SelectVoice`, `Rate`, `Volume`) |

**Recomendação:** usar as duas: **Web Speech API como camada leve** na UI (sem novo endpoint) e **endpoints no launcher** como camada robusta/offline. A UI decide conforme disponibilidade.

### 2.4 🟠 Painel de Output e Notificações

- **Leitura de resultados:** após `executeCmd`/`runQueue` terminar, TTS anuncia: *"Comando concluído com sucesso"* ou *"Falha na execução"* (somente se o toggle de voz estiver ativo e o comando for de longa duração).
- **Toast de voz:** eventos importantes (`showToast`) com flag para anunciar.

### 2.5 🟡 Boas-vindas / acessibilidade

- Falar a saudação inicial do chat quando o app abre (`Olá! Sou o Mestre do PC...`) — 1 linha de código no `openAI()`.
- Modo **acessibilidade** (para usuários com deficiência visual): ler em voz alta cards do catálogo ao navegar, comandos sugeridos pela IA, e outputs.
- **Atalhos globais de voz:** "Ei Mestre" (palavra de ativação) — futuro; requer STT contínuo (consumo alto) — deixar como fase posterior.

### 2.6 🟡 Catálogo de comandos (CATS)

- **Áudio descrição:** tooltip de voz ao passar o mouse sobre cards de comando (acessibilidade).
- **Trigger por voz:** "execute limpeza de disco" → casa com título do comando do catálogo (fuzzy match) → confirmação → `executeCmd`. Cuidado: exigir confirmação para `destructive:true`.

---

## 3. Pré-requisitos (aproveitam os scripts analisados)

| Pré-requisito | Script base (pasta de estudo) | Como entra no projeto |
|---|---|---|
| Capacidades pt-BR + voz TTS do Windows | `instalar_tts_stt_ptbr - Copia.ps1` | Copiar/adaptar para `scripts/instalar-tts-stt-ptbr.ps1` e invocar pelo launcher via `/run` (whitelist) ou durante `install.ps1` |
| Diagnóstico de áudio/idioma | `analise_audio`, `verificar_idioma`, `check_admin` | Tool MCP `listar_estado_voz` / endpoint `/voice/status` |
| Teste de TTS/STT | `testar_tts_stt_ptbr` | Botão "Testar voz" nas Configurações |

> ⚠️ Os scripts exigem **Administrador** e `#Requires -RunAsAdministrator`. No fluxo do launcher, operações do tipo capability só devem rodar com elevação detectada (`isElevated` já calculado no boot do launcher — `v10/launcher.js:32`).

---

## 4. Integração em fases (sem quebrar o que existe)

### Fase 1 — Web Speech API (0 dependência, 100% client-side)
- [ ] Botão 🎤 no `#iaInput` (STT `webkitSpeechRecognition`, `lang: pt-BR`).
- [ ] Botão 🔊 por mensagem + toggle "Ler automaticamente" (`speechSynthesis`, voz pt-BR).
- [ ] Consumir `voice` dos perfis (`agent-profiles.json`) para default de leitura.
- **Arquivos:** só `v10/index.html`.

### Fase 2 — TTS nativo via launcher (offline garantido)
- [ ] Endpoint `POST /voice/tts` no `launcher.js` usando `System.Speech`.
- [ ] A UI cai para o endpoint quando `speechSynthesis` não tem voz pt-BR.
- **Arquivos:** `v10/launcher.js`, `v10/index.html`.

### Fase 3 — STT robusta (Whisper) na UI
- [ ] Endpoint `POST /voice/stt` no `launcher.js` reutilizando `mcp-server/audio-transcriber.js`.
- [ ] Botão "Push-to-talk" no chat que grava → transcreve → preenche o `#iaInput`.
- [ ] Expor o `transcrever_audio` existente no painel de ferramentas da UI.
- **Arquivos:** `v10/launcher.js`, `v10/index.html`.

### Fase 4 — Comandos por voz + acessibilidade
- [ ] Fluxo: STT → `classifyCommand` → confirmação (destrutivos) → `executeCmd`.
- [ ] Leitura de outputs/toasts (toggle).
- [ ] Instalar vozes pt-BR via `scripts/instalar-tts-stt-ptbr.ps1` (adaptado) se `verificar_idioma` apontar falta.

### Fase 5 — MCP (agentes falando)
- [ ] Tool `falar_texto` (TTS) + `listar_vozez` no `mcp-server/index.js`.

---

## 5. Riscos e cuidados

| Risco | Mitigação |
|---|---|
| **STT online do navegador rejeita pt-BR** (limit. conhecida da Microsoft) | Fallback para Whisper local (Fase 3) — a UI deve detectar `onerror` e avisar com dica de voz offline |
| **Vozes pt-BR ausentes no Windows** | Diagnóstico prévio (Fase 4 + scripts `verificar_idioma`) e orientação de instalação |
| **Comandos falados executados sem querer** | Sempre reutilizar `classifyCommand`/`askCommandConfirmation`; nunca executar direto por voz |
| **Gravação falha sem ffmpeg** | Fallback PowerShell já existente; avisar "qualidade reduzida" (padrão do `audio-transcriber.js`) |
| **SpeechSynthesis voz de baixa qualidade** | Oferecer vozes Windows (mais naturais) via Fase 2 |
| **Overhead de permissão de mic** | Explicar no 1º uso; guardar permissão (como `localStorage` padrão `mestre_v10_*`) |
| **Monólito `index.html` crescer** | Seguir o roteiro de extração de `v10/chat-agent/` (JS/CSS do chat para `chat.js`/`chat.css`) quando a fase for autorizada |

---

## 6. Referências no código (mapa de toques)

| Símbolo | Local | Relação |
|---|---|---|
| `transcrever_audio` | `mcp-server/index.js:1405,1865` | STT existente |
| `recordAudio` / `transcribeAudio` | `mcp-server/audio-transcriber.js` | Base para Fase 3 |
| `#iaInput` / `sendIA()` | `v10/index.html:965,~2529` | Ponto de entrada/saída do chat |
| `addIAMessage` / `renderIAContent` | `v10/index.html:~2529+` | Renderização de mensagens (anexar botões 🔊) |
| `classifyCommand` / `askCommandConfirmation` | `v10/index.html:~2594+` | Pipeline de segurança (voz → comando) |
| `voice` (autoRead/lang) | `v10/chat-agent/profiles/agent-profiles.json` | Perfil de voz sem consumidor |
| `isElevated` | `v10/launcher.js:~36` | Gate para endpoints que exigem admin (TTS nativo não precisa, capability install sim) |
| Botões de voz do redesign | `sugestoes/chat-ia-redesign/mockup.html` | Mockup já contém 🎤/🔊 — reaproveitar visual |
| Scripts de voz pt-BR | (pasta de estudo `C:/temp/arquivos...`) | Pré-requisitos de SO (Fase 4) |

---

## 7. Resumo executivo

1. **Já existe STT** (Whisper/MCP) e **já existe design** (chat-ia-redesign), mas **nada está conectado** à UI real.
2. **TTS não existe em nenhuma camada** — é o maior ganho imediato (2 botões + 1 toggle no chat, sem dependência nova).
3. Os **scripts de voz pt-BR** analisados devem virar parte do setup/diagnóstico do projeto (não ficar avulsos).
4. Rota recomendada: **Web Speech API primeiro** (rápido, sem dependência), **endpoints nativos depois** (robustez/offline), **comandos por voz por último** (com a pipeline de segurança já existente).
5. Nenhum arquivo de produção foi alterado — este documento é apenas sugestão.

*Documento criado para estudo/integração — Mestre do PC V10-clean.*
