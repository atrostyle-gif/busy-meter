import { useCallback, useEffect, useMemo, useState } from "react";
import { onValue, ref, update } from "firebase/database";
import { db } from "../firebase";

export default function AdminPage({ user, isAdmin, onLogin, onLogout }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isAdmin) {
      setRequests([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const reqRef = ref(db, "edit_requests");
    const unsubscribe = onValue(
      reqRef,
      (snapshot) => {
        const raw = snapshot.val() || {};
        const rows = Object.entries(raw).map(([uid, item]) => ({
          uid,
          email: item?.email ?? "",
          displayName: item?.displayName ?? "",
          status: item?.status ?? "",
          requested_at: item?.requested_at ?? "",
        }));
        setRequests(rows);
        setLoading(false);
      },
      (e) => {
        setError(e?.message ?? "申請一覧の取得に失敗しました");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isAdmin]);

  const sortedRequests = useMemo(() => {
    return [...requests].sort((a, b) => {
      const ap = a.status === "pending" ? 0 : 1;
      const bp = b.status === "pending" ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return String(b.requested_at).localeCompare(String(a.requested_at));
    });
  }, [requests]);

  const handleApprove = useCallback(async (item) => {
    setBusyUid(item.uid);
    setError(null);
    try {
      const now = Date.now();
      const updates = {
        [`approved_editors/${item.uid}/approved`]: true,
        [`approved_editors/${item.uid}/email`]: item.email ?? "",
        [`approved_editors/${item.uid}/approved_at`]: now,
        [`edit_requests/${item.uid}/status`]: "approved",
        [`edit_requests/${item.uid}/reviewed_at`]: now,
      };
      await update(ref(db), updates);
    } catch (e) {
      console.error("[admin-approve-error]", e);
      setError(e?.message ?? "承認に失敗しました");
    } finally {
      setBusyUid(null);
    }
  }, []);

  const handleDeny = useCallback(async (item) => {
    setBusyUid(item.uid);
    setError(null);
    try {
      const now = Date.now();
      const updates = {
        [`edit_requests/${item.uid}/status`]: "rejected",
        [`edit_requests/${item.uid}/reviewed_at`]: now,
      };
      await update(ref(db), updates);
    } catch (e) {
      console.error("[admin-deny-error]", e);
      setError(e?.message ?? "却下に失敗しました");
    } finally {
      setBusyUid(null);
    }
  }, []);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "1rem" }}>
      <header style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.2rem" }}>承認管理</h1>
        <a href="/">メーターへ戻る</a>
      </header>

      {!user && (
        <div>
          <p>ログインしてください</p>
          <button type="button" onClick={onLogin}>Googleログイン</button>
        </div>
      )}

      {user && !isAdmin && (
        <div>
          <p>権限がありません</p>
          <p style={{ opacity: 0.8, fontSize: "0.9rem" }}>{user.email}</p>
          <button type="button" onClick={onLogout}>ログアウト</button>
        </div>
      )}

      {user && isAdmin && (
        <div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
            <strong>{user.email}</strong>
            <span style={{ fontSize: "0.85rem", opacity: 0.8 }}>(管理者)</span>
            <button type="button" onClick={onLogout}>ログアウト</button>
          </div>

          {error && <p style={{ color: "#b00020" }}>{error}</p>}
          {loading && <p>申請一覧を読み込み中...</p>}

          {!loading && (
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {sortedRequests.length === 0 && <p>申請はありません。</p>}
              {sortedRequests.map((item) => {
                const muted = item.status !== "pending";
                return (
                  <div
                    key={item.uid}
                    style={{
                      border: "1px solid #ccc",
                      borderRadius: 8,
                      padding: "0.75rem",
                      opacity: muted ? 0.65 : 1,
                    }}
                  >
                    <div style={{ fontSize: "0.9rem", marginBottom: "0.35rem" }}>
                      <div>uid: {item.uid}</div>
                      <div>email: {item.email || "-"}</div>
                      <div>displayName: {item.displayName || "-"}</div>
                      <div>status: {item.status || "-"}</div>
                      <div>requested_at: {item.requested_at || "-"}</div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        type="button"
                        disabled={busyUid === item.uid}
                        onClick={() => handleApprove(item)}
                      >
                        承認
                      </button>
                      <button
                        type="button"
                        disabled={busyUid === item.uid}
                        onClick={() => handleDeny(item)}
                      >
                        却下
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
