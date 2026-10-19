import { useState, type ReactNode } from 'react';
import { getPasscode, setPasscode, wasPasscodeRejected } from '../lib/passcode';

export function PasscodeGate({ children }: { children: ReactNode }) {
  const [code, setCode] = useState(getPasscode());
  const [input, setInput] = useState('');
  const [rejected] = useState(wasPasscodeRejected);

  if (code) return <>{children}</>;

  const submit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setPasscode(trimmed);
    setCode(trimmed);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <h2 className="text-lg font-bold text-gray-800 mb-2">合言葉を入力</h2>
        <p className="text-sm text-gray-500 mb-4">
          管理者から共有された合言葉を入力してください。この端末では次回から入力不要です。
        </p>
        {rejected && (
          <p className="text-sm text-red-600 mb-4">
            合言葉が違うか、変更されました。もう一度入力してください。
          </p>
        )}
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          autoComplete="current-password"
          className="w-full border rounded-lg px-4 py-3 text-base mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400"
          autoFocus
        />
        <button
          onClick={submit}
          disabled={!input.trim()}
          className="w-full py-3 rounded-lg font-bold text-white bg-blue-500 disabled:bg-gray-300 transition-colors"
        >
          開始する
        </button>
      </div>
    </div>
  );
}
