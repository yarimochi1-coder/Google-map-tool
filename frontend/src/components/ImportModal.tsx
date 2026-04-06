import { useState, useRef } from 'react';
import type { Property } from '../types';
import { parseKML, parseCSV, parseDailyStatsCSV, type DailyStat } from '../lib/importParser';
import { gasPost } from '../lib/gasClient';

interface ImportModalProps {
  onImport: (properties: Property[]) => void;
  onClose: () => void;
}

type Tab = 'pins' | 'stats';

export function ImportModal({ onImport, onClose }: ImportModalProps) {
  const [tab, setTab] = useState<Tab>('pins');
  const [parsed, setParsed] = useState<Property[]>([]);
  const [parsedStats, setParsedStats] = useState<DailyStat[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setParsed([]);
    setParsedStats([]);
    setFileName('');
    setError('');
    setImportResult('');
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError('');
    setImportResult('');

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        if (tab === 'pins') {
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
        } else {
          const stats = parseDailyStatsCSV(text);
          if (stats.length === 0) {
            setError('日次データが見つかりませんでした');
            return;
          }
          setParsedStats(stats);
        }
      } catch {
        setError('ファイルの解析に失敗しました');
      }
    };
    reader.readAsText(file);
  };

  const handleImportPins = () => {
    if (parsed.length === 0) return;
    onImport(parsed);
    onClose();
  };

  const handleImportStats = async () => {
    if (parsedStats.length === 0) return;
    setImporting(true);
    try {
      const res = await gasPost({ action: 'import_daily_stats', data: parsedStats });
      if (res.success) {
        setImportResult(`${parsedStats.length}件の日次データをインポートしました`);
        setParsedStats([]);
      } else {
        setError(res.error ?? 'インポートに失敗しました');
      }
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setImporting(false);
    }
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

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-3">
          <button
            onClick={() => { setTab('pins'); reset(); }}
            className={`flex-1 py-2 rounded-lg text-sm font-bold ${
              tab === 'pins' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
            }`}
          >
            ピン（KML/CSV）
          </button>
          <button
            onClick={() => { setTab('stats'); reset(); }}
            className={`flex-1 py-2 rounded-lg text-sm font-bold ${
              tab === 'stats' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
            }`}
          >
            過去の数値データ
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* File picker */}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept={tab === 'pins' ? '.kml,.csv' : '.csv'}
              onChange={handleFile}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 text-sm active:bg-gray-50"
            >
              {fileName || (tab === 'pins' ? 'KML / CSVファイルを選択' : '数値管理CSVを選択')}
            </button>
            {tab === 'stats' && (
              <p className="text-[10px] text-gray-400 mt-1">
                日付,訪問件数,接触件数,対面数,計測数,アポ数,成約 の形式のCSV
              </p>
            )}
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}
          {importResult && <p className="text-green-600 text-sm font-bold">{importResult}</p>}

          {/* Pins preview */}
          {tab === 'pins' && parsed.length > 0 && (
            <>
              <p className="text-sm text-gray-600">{parsed.length}件のピンが見つかりました</p>
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
              </div>
              <button
                onClick={handleImportPins}
                className="w-full py-4 bg-blue-500 text-white rounded-xl font-bold text-sm active:bg-blue-600"
              >
                {parsed.length}件をインポート
              </button>
            </>
          )}

          {/* Stats preview */}
          {tab === 'stats' && parsedStats.length > 0 && (
            <>
              <p className="text-sm text-gray-600">{parsedStats.length}日分のデータが見つかりました</p>
              <div className="max-h-48 overflow-y-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left">日付</th>
                      <th className="px-2 py-1 text-right">訪問</th>
                      <th className="px-2 py-1 text-right">接触</th>
                      <th className="px-2 py-1 text-right">対面</th>
                      <th className="px-2 py-1 text-right">アポ</th>
                      <th className="px-2 py-1 text-right">成約</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedStats.map((s, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1">{s.date}</td>
                        <td className="px-2 py-1 text-right">{s.visits}</td>
                        <td className="px-2 py-1 text-right">{s.contacts}</td>
                        <td className="px-2 py-1 text-right">{s.face_to_face}</td>
                        <td className="px-2 py-1 text-right">{s.appointments}</td>
                        <td className="px-2 py-1 text-right">{s.contracts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={handleImportStats}
                disabled={importing}
                className="w-full py-4 bg-green-500 text-white rounded-xl font-bold text-sm active:bg-green-600 disabled:opacity-50"
              >
                {importing ? 'インポート中...' : `${parsedStats.length}日分をインポート`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
