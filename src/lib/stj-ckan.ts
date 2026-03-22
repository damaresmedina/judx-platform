import { STJ_BROWSER_HEADERS, sleep, STJ_FETCH_RETRY_BASE_MS } from "@/src/lib/stj-fetch";

const CKAN_BASE = "https://dadosabertos.web.stj.jus.br/api/3/action";

const PACKAGE_SHOW_MAX_ATTEMPTS = 3;

export type CkanResource = {
  name?: string | null;
  format?: string | null;
  mimetype?: string | null;
  created?: string | null;
  url?: string | null;
};

type CkanPackageShowResult = {
  success: boolean;
  result?: { resources?: CkanResource[] };
};

/**
 * Lista resources do dataset. Usa cache de dados do Next (revalidate) para não baixar
 * o JSON gigante do `package_show` em toda requisição de sync (ex.: um offset por invocação no Vercel).
 */
export async function fetchPackageShow(datasetId: string): Promise<CkanResource[]> {
  const u = new URL(`${CKAN_BASE}/package_show`);
  u.searchParams.set("id", datasetId);
  const headers = new Headers(STJ_BROWSER_HEADERS);
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= PACKAGE_SHOW_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(u.toString(), {
        headers,
        next: { revalidate: 6 * 60 * 60, tags: [`ckan-package:${datasetId}`] },
      });
      if (!res.ok) {
        lastError = new Error(`CKAN package_show failed for ${datasetId}: ${res.status}`);
      } else {
        const body = (await res.json()) as CkanPackageShowResult;
        if (!body.success || !body.result?.resources) {
          lastError = new Error(`CKAN package_show invalid response for ${datasetId}`);
        } else {
          return body.result.resources;
        }
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
    if (attempt < PACKAGE_SHOW_MAX_ATTEMPTS) {
      await sleep(STJ_FETCH_RETRY_BASE_MS * attempt);
    }
  }
  throw lastError ?? new Error(`CKAN package_show failed for ${datasetId}`);
}
