/**
 * Serialização canônica: a mesma entrada sempre gera a mesma string.
 * Necessário para (a) ligar a aprovação humana aos argumentos exatos e
 * (b) não perder a entrada de auditoria quando o argumento é circular.
 */

export function stableStringify(value) {
  const seen = new WeakSet();

  const walk = (node) => {
    if (node === null || typeof node !== 'object') {
      if (typeof node === 'bigint') return `"${node.toString()}n"`;
      if (typeof node === 'undefined') return 'null';
      if (typeof node === 'function') return '"[Function]"';
      return JSON.stringify(node);
    }
    if (seen.has(node)) return '"[Circular]"';
    seen.add(node);

    if (Array.isArray(node)) {
      return `[${node.map(walk).join(',')}]`;
    }
    if (node instanceof Date) return JSON.stringify(node.toISOString());
    if (Buffer.isBuffer(node)) return JSON.stringify(`<Buffer ${node.length}b>`);

    const keys = Object.keys(node).sort();
    const body = keys.map((k) => `${JSON.stringify(k)}:${walk(node[k])}`).join(',');
    return `{${body}}`;
  };

  try {
    return walk(value);
  } catch {
    return '"[NaoSerializavel]"';
  }
}
