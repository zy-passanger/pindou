/** 把 Base URL 和固定端点拼起来；允许用户直接填完整端点。 */
export function joinApiUrl(baseUrl: string, path: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (base.endsWith(path)) return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function joinGeminiUrl(baseUrl: string, model: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  const encoded = encodeURIComponent(model);
  if (base.includes(':generateContent')) return base;
  if (/\/models$/.test(base)) return `${base}/${encoded}:generateContent`;
  return `${base}/models/${encoded}:generateContent`;
}

export function readApiError(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const error = obj.error;
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  if (typeof obj.message === 'string' && obj.message.trim()) return obj.message.trim();
  return null;
}

export function redactSecrets(text: string, secret?: string): string {
  let result = text;
  if (secret && secret.length >= 6) {
    result = result.split(secret).join('[已隐藏]');
  }
  return result
    .replace(/sk-[A-Za-z0-9_-]{6,}/g, '[已隐藏]')
    .replace(/AIza[0-9A-Za-z_-]{8,}/g, '[已隐藏]')
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [已隐藏]')
    .replace(/(\bkey=)[^&\s"']+/gi, '$1[已隐藏]');
}

export function truncateSafe(text: string, max = 300): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}
