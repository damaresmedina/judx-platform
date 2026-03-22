/** Headers para aproximar requisições de um navegador (reduz bloqueios intermitentes no STJ). */
export const STJ_BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  Referer: "https://dadosabertos.web.stj.jus.br",
  Connection: "keep-alive",
};

/** Pausa entre downloads de arquivos (resources) para não sobrecarregar o servidor. */
export const STJ_INTER_RESOURCE_DELAY_MS = 2000;

const STJ_FETCH_MAX_ATTEMPTS = 3;
/** Base do backoff entre tentativas (exportado para retries alinhados ao `fetchStjWithRetries`). */
export const STJ_FETCH_RETRY_BASE_MS = 1000;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch com headers de browser; até 3 tentativas com backoff leve em erro de rede ou HTTP não-ok.
 */
export async function fetchStjWithRetries(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(STJ_BROWSER_HEADERS);
  if (init.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= STJ_FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { ...init, cache: "no-store", headers });
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
    if (attempt < STJ_FETCH_MAX_ATTEMPTS) {
      await sleep(STJ_FETCH_RETRY_BASE_MS * attempt);
    }
  }
  throw lastError ?? new Error(`Falha ao obter ${url}`);
}
