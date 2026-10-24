import { getPasscode, resetPasscode } from './passcode';
const GAS_URL = import.meta.env.VITE_GAS_URL as string;

export interface GasResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// GAS は正しい合言葉でもまれに Unauthorized を返す（同時に何本も呼ぶとスクリプトプロパティの読み出しが空になることがある）。
// 1回の拒否で合言葉を消すと何度も入力を求めることになるので、少し待って再試行し、全部拒否されたときだけ消す。
// 拒否されたリクエストは GAS 側で何も実行されていないので、POST を再送しても二重登録にはならない。
const AUTH_RETRY_DELAYS_MS = [1000, 3000];

export async function gasGet<T = unknown>(
  action: string,
  params: Record<string, string> = {}
): Promise<GasResponse<T>> {
  return withAuthRetry(async () => {
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
    return res.json();
  });
}

export async function gasPost<T = unknown>(
  body: Record<string, unknown>
): Promise<GasResponse<T>> {
  return withAuthRetry(async () => {
    const payload = { ...body, apiKey: getPasscode() };

    const res = await fetch(GAS_URL, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` };
    }
    return res.json();
  });
}

function isUnauthorized(json: GasResponse): boolean {
  return !json.success && json.error === 'Unauthorized';
}

async function withAuthRetry<T>(send: () => Promise<GasResponse<T>>): Promise<GasResponse<T>> {
  let json = await send();
  for (const delay of AUTH_RETRY_DELAYS_MS) {
    if (!isUnauthorized(json)) return json;
    await new Promise((resolve) => setTimeout(resolve, delay));
    json = await send();
  }
  if (isUnauthorized(json)) resetPasscode();
  return json;
}
