// GAS への合言葉。ビルドにもリポジトリにも含めず、各端末で一度だけ入力してもらう
const STORAGE_KEY = 'paint-map-passcode';
const REJECTED_KEY = 'paint-map-passcode-rejected';

// localStorage が使えない端末（プライベートブラウズ等）でも、開いている間は動かすための退避先
let memoryCode = '';

export function getPasscode(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? memoryCode;
  } catch {
    return memoryCode;
  }
}

export function setPasscode(code: string): void {
  memoryCode = code;
  try {
    localStorage.setItem(STORAGE_KEY, code);
    sessionStorage.removeItem(REJECTED_KEY);
    // 端末の容量が逼迫したときにブラウザに保存を消されにくくする（非対応ブラウザでは何もしない）
    navigator.storage?.persist?.().catch(() => {});
  } catch {
    // 保存できない端末。memoryCode だけで動く
  }
}

// GAS に拒否されたら合言葉を消して入力画面に戻す（合言葉の変更後も同じ流れで再入力になる）
export function resetPasscode(): void {
  memoryCode = '';
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.setItem(REJECTED_KEY, '1');
  } catch {
    // 何もしない
  }
  window.location.reload();
}

// 直前に GAS から拒否されて入力画面に戻ってきたか
export function wasPasscodeRejected(): boolean {
  try {
    return sessionStorage.getItem(REJECTED_KEY) === '1';
  } catch {
    return false;
  }
}
