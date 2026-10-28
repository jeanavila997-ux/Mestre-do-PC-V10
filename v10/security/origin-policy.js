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

function ipv4Octets(hostname) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  if (octets.some((n) => n > 255)) return null;
  return octets;
}

export function isPrivateLanHost(hostname) {
  const octets = ipv4Octets(hostname);
  if (!octets) return false;
  const [a, b] = octets;
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

export function parseExtraOrigins(raw = "") {
  return String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hostMatchesSuffix(hostname, entry) {
  if (!entry.startsWith("*.")) return false;
  const suffix = entry.slice(1);
  return hostname.endsWith(suffix) && hostname.length > suffix.length;
}

/**
 * Origens de browser autorizadas a falar com o launcher além da própria BASE_URL.
 * Cobre o app mobile servido no próprio launcher, na LAN, em túnel Cloudflare,
 * na VPS e nas páginas estáticas conhecidas do projeto.
 */
export function isTrustedClientOrigin(origin, extraList = []) {
  if (!origin) return true;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (isPrivateLanHost(host)) return true;
  if (host === "72.62.11.116") return true;
  if (host.endsWith(".trycloudflare.com") && host !== ".trycloudflare.com") return true;
  if (host.endsWith(".72-62-11-116.sslip.io")) return true;
  if (host === "jeanavila997-ux.github.io") return true;
  if (host === "mestre-do-pc-mobile.pages.dev") return true;
  for (const entry of extraList) {
    if (entry === origin || entry === parsed.origin) return true;
    if (hostMatchesSuffix(host, entry)) return true;
    try {
      if (new URL(entry).origin === parsed.origin) return true;
    } catch {
      /* entrada livre, já comparada acima */
    }
  }
  return false;
}
