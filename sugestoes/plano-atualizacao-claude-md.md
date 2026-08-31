# Update CLAUDE.md with verified corrections and gaps

## Context

`/init` was invoked to generate/refresh CLAUDE.md. A CLAUDE.md already exists and is generally accurate and detailed. Rather than rewriting it, an Explore agent audited it against the actual repository state (README.md, `.github/copilot-instructions.md`, top-level directory listing, `v10/chat/`, `v10/rede-dashboard.js`, CI workflow, package.json scripts) to find concrete, verified discrepancies worth fixing. This plan applies only the confirmed gaps — no speculative additions.

## Verified findings to act on

1. **Dangling reference**: CLAUDE.md's Project list says `legado/: old versions; do not touch them to fix V10/V11 behavior.` — but `legado/` does not exist in this repo checkout (confirmed absent). This line should be removed.
2. **Undocumented top-level structure**: `docs/` (referenced only implicitly, never listed) holds real architecture/feature docs (`RAG.md`, `SISTEMA-MEMORIAS.md`, `REDE-DIAGNOSTICO.md`, `deployment.md`, etc.), and `SECURITY.md` exists at root. Also present but unmentioned: `AGENTS.md` and `QWEN.md`/`.qwen/` — parallel agent-instruction files for other tools (Codex/Qwen-style agents) that a future Claude instance should know exist so it doesn't contradict them.
3. **`v10/chat/` undersold**: description currently says "chat module (template, module, Ollama streaming integration)". Real contents include `chat-styles.css` (16KB, sibling to `chat-module.js`/`chat-template.html` already called out in the Conventions "keep aligned" note) and `Soul.md` (20KB persona/behavior spec) — both worth naming since they're substantive, easy-to-miss files future edits could silently desync.
4. **`scripts/` sibling**: `scripts/validate.mjs` is documented; `scripts/test_ollama.mjs` exists alongside it and isn't mentioned.
5. **Prerequisites** are documented in root `README.md` but absent from CLAUDE.md: Windows 10/11 64-bit, PowerShell 5.1+, Node.js 20+.

Not acting on: `.github/copilot-instructions.md` (parallel doc, out of scope to reconcile here), the `qwen2.5-coder:3b` vs `1.5b` model divergence in `rede-dashboard.js` (a code inconsistency, not a documentation gap — not CLAUDE.md's job to paper over), and `testsprite-*/`/`startup/`/`sugestoes/`/V11-summary docs (secondary, low-signal for a future coding agent).

## Changes to `CLAUDE.md`

- **Project section**: remove the `legado/` bullet; add a short bullet for `docs/` (brief note: architecture/feature docs — RAG, memory system, network diagnostics, deployment) and a one-line mention that `SECURITY.md`, `AGENTS.md`, and `QWEN.md` exist at the root as related/parallel instruction docs.
- **Development commands**: add `node scripts\test_ollama.mjs` next to the existing `scripts\validate.mjs` entries, with a one-line description (Ollama connectivity/model smoke check).
- **Conventions or Project section**: extend the existing `v10/chat/` description to include `chat-styles.css` and `Soul.md`, and extend the existing "keep `chat-module.js` and `chat-template.html` aligned" convention note to also cover `chat-styles.css`.
- **New short "Prerequisites" note** (near the top, before Development commands): Windows 10/11 64-bit, PowerShell 5.1+, Node.js 20+.

Keep edits surgical — this is an update to an existing file via targeted Edit calls, not a rewrite. Preserve the required CLAUDE.md header text and all existing accurate content.

## Verification

- Read the diff after editing to confirm no unrelated content was altered.
- Cross-check that `docs/`, `SECURITY.md`, `AGENTS.md`, `QWEN.md`, `scripts/test_ollama.mjs`, `v10/chat/chat-styles.css`, and `v10/chat/Soul.md` all still exist at the stated paths (quick Glob) before finalizing wording.