import { useCallback, useEffect, useMemo, useState } from "react";
import { get, ref, onValue, set, update } from "firebase/database";
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
const STATUS = {
  GUEST: "guest",
  REQUESTABLE: "requestable",
  PENDING: "pending",
  DENIED: "denied",
  APPROVED: "approved",
};

export default function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeFactory, setActiveFactory] = useState("osaka");
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState(STATUS.GUEST);
  const [approvalLoading, setApprovalLoading] = useState(false);
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

  const loadApprovalStatus = useCallback(async (targetUser) => {
    if (!targetUser?.uid) {
      setApprovalStatus(STATUS.GUEST);
      return;
    }

    setApprovalLoading(true);
    try {
      const [approvedSnap, reqSnap] = await Promise.all([
        get(ref(db, `approved_editors/${targetUser.uid}`)),
        get(ref(db, `edit_requests/${targetUser.uid}`)),
      ]);
      const approved = approvedSnap.val();
      const req = reqSnap.val();

      // 優先順位:
      // 1) approved_editors/{uid}.approved === true
      // 2) それ以外のみ edit_requests を判定
      if (approved?.approved === true) {
        setApprovalStatus(STATUS.APPROVED);
      } else if (req?.status === "pending") {
        setApprovalStatus(STATUS.PENDING);
      } else if (req?.status === "denied") {
        setApprovalStatus(STATUS.DENIED);
      } else {
        setApprovalStatus(STATUS.REQUESTABLE);
      }
    } catch (e) {
      setApprovalStatus(STATUS.GUEST);
      showToast(false, e?.message ?? "承認状態の確認に失敗しました");
    } finally {
      setApprovalLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!authReady) return;
    void loadApprovalStatus(user);
  }, [authReady, loadApprovalStatus, user]);

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

  const canEdit = approvalStatus === STATUS.APPROVED;

  const handleEditorLogin = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      showToast(false, err?.message ?? "ログインに失敗しました");
    }
  }, [showToast]);

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
      setApprovalStatus(STATUS.GUEST);
      showToast(true, "ログアウトしました");
    } catch (err) {
      showToast(false, err?.message ?? "ログアウトに失敗しました");
    }
  }, [showToast]);

  const handleRequestApproval = useCallback(async () => {
    if (!user?.uid) {
      showToast(false, "申請にはログインが必要です");
      return;
    }
    if (approvalStatus === STATUS.PENDING) {
      showToast(false, "すでに承認待ちです");
      return;
    }
    if (approvalStatus === STATUS.APPROVED) {
      showToast(true, "すでに編集可能です");
      return;
    }
    try {
      await set(ref(db, `edit_requests/${user.uid}`), {
        email: user.email ?? "",
        displayName: user.displayName ?? "",
        status: "pending",
        requested_at: new Date().toISOString(),
      });
      setApprovalStatus(STATUS.PENDING);
      showToast(true, "承認申請を送りました");
    } catch (err) {
      showToast(false, err?.message ?? "承認申請に失敗しました");
    }
  }, [approvalStatus, showToast, user]);

  const handleSave = useCallback(
    async (payload) => {
      setSaving(true);
      try {
        if (!authReady) {
          showToast(false, "認証状態を確認中です");
          return false;
        }
        if (!user) {
          showToast(false, "編集するにはログインしてください");
          return false;
        }
        if (approvalStatus === STATUS.PENDING) {
          showToast(false, "承認待ちです");
          return false;
        }
        if (approvalStatus === STATUS.DENIED) {
          showToast(false, "編集権限がありません");
          return false;
        }
        if (approvalStatus !== STATUS.APPROVED) {
          showToast(false, "編集権限を申請してください");
          return false;
        }

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
    [approvalStatus, authReady, showToast, user]
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
            {!approvalLoading && canEdit && <span> (編集可)</span>}
            {!approvalLoading && approvalStatus === STATUS.PENDING && <span> (承認待ち)</span>}
            {!approvalLoading && approvalStatus === STATUS.DENIED && <span> (権限なし)</span>}
            {!approvalLoading && approvalStatus === STATUS.REQUESTABLE && <span> (未承認)</span>}
            {approvalLoading && <span> (権限確認中)</span>}
            {approvalStatus === STATUS.REQUESTABLE && !approvalLoading && (
              <button type="button" onClick={handleRequestApproval}>
                編集権限を申請
              </button>
            )}
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
