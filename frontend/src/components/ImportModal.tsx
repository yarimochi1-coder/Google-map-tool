import { useState, useRef } from 'react';
import type { Property } from '../types';
import { parseKML, parseCSV } from '../lib/importParser';

interface ImportModalProps {
  onImport: (properties: Property[]) => void;
  onClose: () => void;
}

export function ImportModal({ onImport, onClose }: ImportModalProps) {
  const [parsed, setParsed] = useState<Property[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError('');

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        let result: Property[];
        if (file.name.endsWith('.kml')) {
          result = parseKML(text);
        } else if (file.name.endsWith('.csv')) {
          result = parseCSV(text);
        } else {
          setError('KMLまたはCSVファイルを選択してください');
          return;
        }
        if (result.length === 0) {
          setError('データが見つかりませんでした');
          return;
        }
        setParsed(result);
      } catch {
        setError('ファイルの解析に失敗しました');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (parsed.length === 0) return;
    onImport(parsed);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
      <div className="bg-white rounded-t-2xl w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-lg font-bold">データインポート</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 text-xl"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* File picker */}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".kml,.csv"
              onChange={handleFile}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 text-sm active:bg-gray-50"
            >
              {fileName || 'KML / CSVファイルを選択'}
            </button>
          </div>

          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          {/* Preview */}
          {parsed.length > 0 && (
            <>
              <p className="text-sm text-gray-600">
                {parsed.length}件のデータが見つかりました
              </p>
              <div className="max-h-48 overflow-y-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left">名前</th>
                      <th className="px-2 py-1 text-left">緯度</th>
                      <th className="px-2 py-1 text-left">経度</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 50).map((p, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1 truncate max-w-[120px]">{p.name || '—'}</td>
                        <td className="px-2 py-1">{p.lat.toFixed(4)}</td>
                        <td className="px-2 py-1">{p.lng.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.length > 50 && (
                  <p className="text-xs text-gray-400 text-center py-1">
                    他{parsed.length - 50}件...
                  </p>
                )}
              </div>

              <button
                onClick={handleImport}
                className="w-full py-4 bg-blue-500 text-white rounded-xl font-bold text-sm active:bg-blue-600"
              >
                {parsed.length}件をインポート
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
