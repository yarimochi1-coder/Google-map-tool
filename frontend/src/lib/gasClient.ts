import { getPasscode, resetPasscode } from './passcode';
const GAS_URL = import.meta.env.VITE_GAS_URL as string;

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
  url.searchParams.set('apiKey', getPasscode());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), { redirect: 'follow' });
  if (!res.ok) {
    return { success: false, error: `HTTP ${res.status}` };
  }
  return checkAuth(await res.json());
}

export async function gasPost<T = unknown>(
  body: Record<string, unknown>
): Promise<GasResponse<T>> {
  const payload = { ...body, apiKey: getPasscode() };

  const res = await fetch(GAS_URL, {
    method: 'POST',
    redirect: 'follow',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    return { success: false, error: `HTTP ${res.status}` };
  }
  return checkAuth(await res.json());
}

function checkAuth<T>(json: GasResponse<T>): GasResponse<T> {
  if (!json.success && json.error === 'Unauthorized') resetPasscode();
  return json;
}
