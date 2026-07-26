const SAFE_TOOL_ARGUMENT = /^[a-zA-Z0-9_. -]+$/;

export function sanitizeToolArgument(value) {
  const raw = String(value);
  if (raw.length === 0 || raw.length > 128) return null;
  if (raw.trim().length === 0) return null;
  if (!SAFE_TOOL_ARGUMENT.test(raw)) return null;
  return raw;
}
