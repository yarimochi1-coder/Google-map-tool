import { useState } from 'react';

interface NameInputModalProps {
  onSubmit: (name: string) => void;
}

export function NameInputModal({ onSubmit }: NameInputModalProps) {
  const [name, setName] = useState('');

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <h2 className="text-lg font-bold text-gray-800 mb-2">担当者名を入力</h2>
        <p className="text-sm text-gray-500 mb-4">
          あなたの名前を入力してください。訪問記録に紐づけられます。
        </p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 山田"
          className="w-full border rounded-lg px-4 py-3 text-base mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400"
          autoFocus
        />
        <button
          onClick={() => {
            const trimmed = name.trim();
            if (trimmed) onSubmit(trimmed);
          }}
          disabled={!name.trim()}
          className="w-full py-3 rounded-lg font-bold text-white bg-blue-500 disabled:bg-gray-300 transition-colors"
        >
          開始する
        </button>
      </div>
    </div>
  );
}
