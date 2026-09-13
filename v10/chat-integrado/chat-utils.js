function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function filterSkills(skills, query, limit = 8) {
  const normalizedQuery = normalize(query).trim();
  const list = Array.isArray(skills) ? skills : [];
  return list
    .filter((skill) => {
      if (!normalizedQuery) return true;
      return [skill.id, skill.title, skill.category, ...(skill.tags || [])]
        .some((value) => normalize(value).includes(normalizedQuery));
    })
    .slice(0, limit);
}

export function applySkillShortcut(text, skills) {
  const value = String(text || "");
  const match = value.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
  if (!match) return { matched: false, text: value };

  const shortcut = normalize(match[1]);
  const skill = (Array.isArray(skills) ? skills : []).find((item) => normalize(item.id) === shortcut);
  if (!skill) return { matched: false, text: value };

  const body = String(skill.body || skill.description || "").trim();
  const request = (match[2] || "").trim();
  const parts = [`Use a skill \"${skill.title || skill.id}\" como contexto de trabalho.`, body];
  if (request) parts.push(`Pedido do usuário: ${request}`);

  return { matched: true, skill, text: parts.filter(Boolean).join("\n\n") };
}

export function buildAttachmentContext(prompt, attachments) {
  const list = Array.isArray(attachments) ? attachments : [];
  const textAttachments = list
    .filter((attachment) => attachment.kind === "text" && attachment.content)
    .map((attachment) => `[${attachment.name}]\n${attachment.content}`);
  const binaryAttachments = list
    .filter((attachment) => attachment.kind === "binary")
    .map((attachment) => `[${attachment.name}] arquivo binário (${attachment.mime || "tipo não informado"}); o conteúdo não foi extraído pelo navegador.`);
  const images = list
    .filter((attachment) => attachment.kind === "image" && attachment.base64)
    .map((attachment) => attachment.base64);
  const sections = [...textAttachments, ...binaryAttachments];

  return {
    text: sections.length
      ? `${prompt}\n\n--- Arquivos anexados ---\n${sections.join("\n\n")}`
      : prompt,
    images,
  };
}
