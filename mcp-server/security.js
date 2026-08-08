const SAFE_TOOL_ARGUMENT = /^[a-zA-Z0-9_. -]+$/;

export function sanitizeToolArgument(value) {
  const raw = String(value);
  if (raw.length === 0 || raw.length > 128) return null;
  if (raw.trim().length === 0) return null;
  if (!SAFE_TOOL_ARGUMENT.test(raw)) return null;
  return raw;
}

/**
 * Analisa um prompt em busca de tentativas de prompt injection, jailbreak
 * ou conteúdo malicioso. Retorna um objeto com classificação, score e detalhes.
 */
export function checkPromptInjection(text) {
  if (!text || typeof text !== "string") {
    return { classification: "invalid", score: 1.0, details: ["Entrada vazia ou invalida."] };
  }
  const patterns = [
    { regex: /ignore\s+(all\s+)?previous\s+(instructions?|commands?|prompts?)/gi, weight: 0.9, label: "Injecao: ignore previous instructions" },
    { regex: /forget\s+(everything|all\s+previous|your\s+instructions)/gi, weight: 0.85, label: "Injecao: forget instructions" },
    { regex: /(you\s+are\s+now|from\s+now\s+on\s+you\s+are)/gi, weight: 0.8, label: "Injecao: persona override" },
    { regex: /(disregard|override|bypass|circumvent)\s+(rules?|restrictions?|safety|security)/gi, weight: 0.85, label: "Injecao: bypass rules" },
    { regex: /system\s*[:\-]?\s*prompt|developer\s*mode|admin\s*mode|DAN\s*mode/gi, weight: 0.75, label: "Injecao: system prompt leak / mode switch" },
    { regex: /<<<\s*sys\s*>>>|<<<\s*system\s*>>>|\[\s*system\s*\]|\[\s*inst\s*\]|<<<\s*instruction\s*>>>/gi, weight: 0.7, label: "Injecao: delimitadores de sistema" },
    { regex: /new\s+instructions?[:\-]/gi, weight: 0.6, label: "Injecao: new instructions" },
    { regex: /(jailbreak|prompt\s*injection|roleplay\s*as)/gi, weight: 0.65, label: "Injecao: termos diretos" },
    { regex: /(sudo|admin|root)\s+access/gi, weight: 0.5, label: "Injecao: privilege escalation" },
    { regex: /(?:\n|\r){3,}.{0,30}(?:ignore|forget|disregard|override)/gi, weight: 0.55, label: "Injecao: quebra de linha suspeita + instrucao" },
    { regex: /[`\x00-\x08\x0b\x0c\x0e-\x1f]{4,}/g, weight: 0.4, label: "Injecao: caracteres de controle suspeitos" },
  ];

  let totalScore = 0;
  const details = [];
  const matchedPatterns = new Set();

  for (const p of patterns) {
    const matches = text.match(p.regex);
    if (matches && matches.length > 0) {
      totalScore += p.weight * Math.min(matches.length, 3);
      matchedPatterns.add(p.label);
    }
  }

  const score = Math.min(totalScore, 1.0);

  let classification = "benigno";
  if (score >= 0.7) classification = "malicioso";
  else if (score >= 0.35) classification = "suspeito";

  if (matchedPatterns.size > 0) {
    details.push(`Padroes detectados: ${[...matchedPatterns].join("; ")}`);
  }
  details.push(`Score heuristico: ${(score * 100).toFixed(1)}%`);

  return { classification, score, details };
}
