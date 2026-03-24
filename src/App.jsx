import { useCallback, useMemo, useState } from "react";
import FactorySection from "./components/FactorySection";
import { useMachineStatus } from "./hooks/useMachineStatus";
import "./App.css";

const FACTORIES = ["osaka", "oita", "kochi"];
const FACTORY_LABELS = { osaka: "大阪工場", oita: "大分工場", kochi: "高知工場" };

export default function App() {
  const { data, loading, error, refetch, saveStatus } = useMachineStatus();
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeFactory, setActiveFactory] = useState("osaka");

  const showToast = useCallback((success, message) => {
    setToast({ success, message });
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, []);

  const handleSave = useCallback(
    async (payload) => {
      setSaving(true);
      try {
        const machineId = payload.machine_id;
        if (!machineId) throw new Error("machine_id がありません");

        await saveStatus({
          machine_id: machineId,
          jam_level: payload.jam_level,
          jam_level_next_week: payload.jam_level_next_week,
          jam_level_week_after: payload.jam_level_week_after,
        });

        showToast(true, "保存しました");
        return true;
      } catch (err) {
        showToast(false, err?.message ?? "保存に失敗しました");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [showToast, saveStatus]
  );

  const byFactory = useMemo(() => {
    const map = { osaka: [], oita: [], kochi: [] };
    for (const row of data) {
      if (map[row.factory]) map[row.factory].push(row);
    }
    return map;
  }, [data]);

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title no-translate" translate="no">
          TETSUYA BUSY METER
        </h1>
        {saving && <span className="app__saving">Saving...</span>}
      </header>

      <main className="app__main">
        {loading && <p className="app__loading">読み込み中です...</p>}

        {error && (
          <div className="app__error">
            <p>{error}</p>
            <button type="button" onClick={() => refetch()}>
              再取得
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="factory-tabs" role="tablist" translate="no">
              {FACTORIES.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`factory-tab ${activeFactory === f ? "active" : ""}`}
                  role="tab"
                  aria-selected={activeFactory === f}
                  aria-controls={`factory-section-${f}`}
                  id={`factory-tab-${f}`}
                  data-factory={f}
                  onClick={() => setActiveFactory(f)}
                >
                  {FACTORY_LABELS[f] ?? f}
                </button>
              ))}
            </div>

            <div className="app__sections">
              {FACTORIES.map((f) => (
                <FactorySection
                  key={f}
                  factory={f}
                  machines={byFactory[f]}
                  onSave={handleSave}
                  isActive={activeFactory === f}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {toast && (
        <div
          className={`app__toast app__toast--${toast.success ? "ok" : "ng"}`}
          role="status"
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
