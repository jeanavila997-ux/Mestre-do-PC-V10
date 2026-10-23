// Divide texto em chunks com sobreposição, para indexação no RAG.
//
// Estratégia: respeita parágrafos e, dentro deles, linhas; se um bloco ainda
// passar do limite, corta no limite. A sobreposição preserva contexto entre
// chunks vizinhos (importante para logs e código).

/**
 * @param {string} text
 * @param {{maxChars?: number, overlap?: number}} [options]
 * @returns {string[]}
 */
export function chunkText(text, options = {}) {
  const maxChars = Math.max(100, options.maxChars ?? 900);
  const overlap = Math.max(0, Math.min(options.overlap ?? 150, Math.floor(maxChars / 2)));

  const normalized = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .trim();
  if (!normalized) return [];

  // Quebra em blocos por parágrafo; parágrafos gigantes são subdivididos.
  const paragraphs = normalized.split(/\n{2,}/);
  const pieces = [];
  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;
    if (trimmed.length <= maxChars) {
      pieces.push(trimmed);
      continue;
    }
    // Subdivide por linha para não cortar no meio de uma linha de código.
    let buffer = "";
    for (const line of trimmed.split("\n")) {
      if (line.length > maxChars) {
        if (buffer) { pieces.push(buffer); buffer = ""; }
        for (let i = 0; i < line.length; i += maxChars) {
          pieces.push(line.slice(i, i + maxChars));
        }
        continue;
      }
      if (buffer.length + line.length + 1 > maxChars) {
        if (buffer) pieces.push(buffer);
        buffer = line;
      } else {
        buffer = buffer ? `${buffer}\n${line}` : line;
      }
    }
    if (buffer) pieces.push(buffer);
  }

  // Agrupa peças pequenas até o limite, com sobreposição vinda do chunk anterior.
  const chunks = [];
  let current = "";
  for (const piece of pieces) {
    if (!current) {
      current = piece;
      continue;
    }
    if (current.length + piece.length + 2 <= maxChars) {
      current = `${current}\n\n${piece}`;
      continue;
    }
    chunks.push(current);
    const tail = overlap > 0 ? current.slice(-overlap) : "";
    current = tail ? `${tail}\n${piece}` : piece;
  }
  if (current) chunks.push(current);

  // Remove duplicatas exatas preservando a ordem.
  return [...new Set(chunks.map((c) => c.trim()).filter(Boolean))];
}
