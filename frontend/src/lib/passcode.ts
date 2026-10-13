// GAS への合言葉。ビルドにもリポジトリにも含めず、各端末で一度だけ入力してもらう
const STORAGE_KEY = 'paint-map-passcode';

export function getPasscode(): string {
  return localStorage.getItem(STORAGE_KEY) ?? '';
}

export function setPasscode(code: string): void {
  localStorage.setItem(STORAGE_KEY, code);
}

// GAS に拒否されたら合言葉を消して入力画面に戻す（合言葉の変更後も同じ流れで再入力になる）
export function resetPasscode(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}
