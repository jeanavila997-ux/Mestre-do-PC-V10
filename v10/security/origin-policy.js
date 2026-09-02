export function isLoopbackOrigin(origin) {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost');
  } catch {
    return false;
  }
}

export function isAllowedWebOrigin(origin, baseUrl) {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const base = new URL(baseUrl);
    return parsed.protocol === base.protocol
      && parsed.hostname === base.hostname
      && parsed.port === base.port;
  } catch {
    return false;
  }
}

export function isNppOrigin(origin) {
  // PythonScript/WinInet pode enviar origin vazio ou 127.0.0.1 com porta dinâmica.
  return !origin || isLoopbackOrigin(origin);
}
