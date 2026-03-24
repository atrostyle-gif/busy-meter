import { useCallback, useEffect, useMemo, useState } from "react";
import { ref, onValue, update } from "firebase/database";
import {
  auth,
  db,
  googleProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "./firebase";
import FactorySection from "./components/FactorySection";
import "./App.css";

const FACTORIES = ["osaka", "oita", "kochi"];
const FACTORY_LABELS = { osaka: "大阪工場", oita: "大分工場", kochi: "高知工場" };
const ALLOWED_EDITOR_EMAILS = [
  "aaa@company.com",
  "bbb@company.com",
  "ccc@gmail.com",
];

export default function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeFactory, setActiveFactory] = useState("osaka");
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  /** 再取得時に購読を張り直すためのキー */
  const [refreshKey, setRefreshKey] = useState(0);

  const showToast = useCallback((success, message) => {
    setToast({ success, message });
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const statusRef = ref(db, "machine_status");

    const unsubscribe = onValue(
      statusRef,
      (snapshot) => {
        const v = snapshot.val() || {};

        const rows = Object.entries(v).map(([machine_id, item]) => ({
          machine_id,
          ...item,
        }));

        // factory 昇順、sort_order 昇順
        rows.sort((a, b) => {
          const fa = a.factory ?? "";
          const fb = b.factory ?? "";
          if (fa !== fb) return fa.localeCompare(fb);
          return (a.sort_order ?? 0) - (b.sort_order ?? 0);
        });

        setData(rows);
        setLoading(false);
      },
      (err) => {
        setError(err?.message ?? "読み込みに失敗しました");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [refreshKey]);

  const refetch = useCallback(() => {
    setError(null);
    setRefreshKey((k) => k + 1);
  }, []);

  const canEdit = useMemo(() => {
    const email = (user?.email ?? "").toLowerCase();
    return Boolean(email) && ALLOWED_EDITOR_EMAILS.includes(email);
  }, [user]);

  const handleEditorLogin = useCallback(async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = (result.user?.email ?? "").toLowerCase();
      if (!ALLOWED_EDITOR_EMAILS.includes(email)) {
        showToast(false, "編集権限がありません");
      }
    } catch (err) {
      showToast(false, err?.message ?? "ログインに失敗しました");
    }
  }, [showToast]);

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
      showToast(true, "ログアウトしました");
    } catch (err) {
      showToast(false, err?.message ?? "ログアウトに失敗しました");
    }
  }, [showToast]);

  const ensureEditor = useCallback(async () => {
    if (!authReady) {
      showToast(false, "認証状態を確認中です");
      return null;
    }

    if (user) {
      const email = (user.email ?? "").toLowerCase();
      if (!ALLOWED_EDITOR_EMAILS.includes(email)) {
        showToast(false, "編集権限がありません");
        return null;
      }
      return user;
    }

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const nextUser = result.user ?? null;
      const email = (nextUser?.email ?? "").toLowerCase();
      if (!ALLOWED_EDITOR_EMAILS.includes(email)) {
        showToast(false, "編集権限がありません");
        return null;
      }
      return nextUser;
    } catch (err) {
      showToast(false, err?.message ?? "ログインに失敗しました");
      return null;
    }
  }, [authReady, showToast, user]);

  const handleSave = useCallback(
    async (payload) => {
      setSaving(true);
      try {
        const editor = await ensureEditor();
        if (!editor) return false;

        const machineId = payload.machine_id;
        if (!machineId) throw new Error("machine_id がありません");

        await update(ref(db, `machine_status/${machineId}`), {
          jam_level: payload.jam_level,
          jam_level_next_week: payload.jam_level_next_week,
          jam_level_week_after: payload.jam_level_week_after,
          updated_at: new Date().toISOString(),
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
    [ensureEditor, showToast]
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
        {authReady && !user && (
          <button type="button" onClick={handleEditorLogin}>
            編集者ログイン
          </button>
        )}
        {authReady && user && (
          <div>
            <span>{user.email}</span>
            <span>{canEdit ? " (編集可)" : " (閲覧のみ)"}</span>
            <button type="button" onClick={handleLogout}>
              ログアウト
            </button>
          </div>
        )}
      </header>

      <main className="app__main">
        {loading && <p className="app__loading">読み込み中です...</p>}

        {error && (
          <div className="app__error">
            <p>{error}</p>
            <button type="button" onClick={refetch}>
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
