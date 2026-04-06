const GAS_URL = import.meta.env.VITE_GAS_URL as string;
const GAS_API_KEY = import.meta.env.VITE_GAS_API_KEY as string;

export interface GasResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function gasGet<T = unknown>(
  action: string,
  params: Record<string, string> = {}
): Promise<GasResponse<T>> {
  const url = new URL(GAS_URL);
  url.searchParams.set('action', action);
  url.searchParams.set('apiKey', GAS_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), { redirect: 'follow' });
  if (!res.ok) {
    return { success: false, error: `HTTP ${res.status}` };
  }
  return res.json();
}

export async function gasPost<T = unknown>(
  body: Record<string, unknown>
): Promise<GasResponse<T>> {
  const payload = { ...body, apiKey: GAS_API_KEY };

  const res = await fetch(GAS_URL, {
    method: 'POST',
    redirect: 'follow',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    return { success: false, error: `HTTP ${res.status}` };
  }
  return res.json();
}
