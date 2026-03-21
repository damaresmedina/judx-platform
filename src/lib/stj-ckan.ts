import { fetchStjWithRetries } from "@/src/lib/stj-fetch";

const CKAN_BASE = "https://dadosabertos.web.stj.jus.br/api/3/action";

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

export async function fetchPackageShow(datasetId: string): Promise<CkanResource[]> {
  const u = new URL(`${CKAN_BASE}/package_show`);
  u.searchParams.set("id", datasetId);
  const res = await fetchStjWithRetries(u.toString());
  if (!res.ok) {
    throw new Error(`CKAN package_show failed for ${datasetId}: ${res.status}`);
  }
  const body = (await res.json()) as CkanPackageShowResult;
  if (!body.success || !body.result?.resources) {
    throw new Error(`CKAN package_show invalid response for ${datasetId}`);
  }
  return body.result.resources;
}
