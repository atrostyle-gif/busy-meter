# 工場ビジーメーター 完全提出物（完成コード全文・省略禁止）

## 適用するための最短3ステップ（1行も考えなくてよい）

1. **Supabase SQL Editor に貼る**  
   Supabase Dashboard を開く → SQL Editor → 下記「sql/schema.sql 全文」をコピーして貼り付け → Run を実行する。  
   「already in publication」など Realtime のエラーが出たら、Database > Replication で `public.machine_status` を手動で追加する。

2. **.env を作成する**  
   プロジェクト直下（`busy-meter` の直下）に `.env` を作成し、次の2行を入れる（値は Supabase の Project Settings > API から取得）。  
   `VITE_SUPABASE_URL=https://xxxx.supabase.co`  
   `VITE_SUPABASE_ANON_KEY=eyJhbGciOi...`

3. **npm run dev で起動する**  
   ターミナルで `cd busy-meter` → `npm install`（未実行なら）→ `npm run dev` を実行し、ブラウザで `http://localhost:5173/` を開く。

---

## 変更・新規作成した全ファイル一覧

| ファイル | 目的（1行） |
|----------|----------------|
| sql/schema.sql | テーブル・ビュー・RLS・Realtime を一括で用意するため Supabase SQL Editor に貼って実行する |
| src/lib/supabaseClient.js | Supabase クライアントを環境変数で1箇所だけ初期化し、アプリ全体で共有する |
| src/hooks/useMachineStatus.js | ビュー取得・Realtime 購読・60秒フォールバック・保存処理をまとめ、購読状態を console.info で出す |
| src/components/FactorySection.jsx | 工場名（大阪/大分/高知）とその下の機械カード一覧を表示する |
| src/components/MachineCard.jsx | 1台分の表示（実行状態・ジャムレベル・青→黄→赤バー・スライダー・変更を保存ボタン） |
| src/App.jsx | 見出し・エラー・トースト・3工場セクションを組み合わせ、保存後に refetch して表示を更新する |
| src/App.css | アプリ・工場セクション・機械カード・トーストのレイアウトと見た目を定義する |

---

## 各ファイルの完成コード全文（Prettier 相当で整形）

### sql/schema.sql  
目的: テーブル・ビュー・RLS・Realtime を一括で用意するため Supabase SQL Editor に貼って実行する。

```sql
-- =============================================================================
-- 工場ビジーメーター用 Supabase スキーマ
-- これをそのまま Supabase SQL Editor に貼り付けて実行してください。
-- =============================================================================

-- 1. マスタ: 機械一覧
CREATE TABLE IF NOT EXISTS public.machines (
  id TEXT PRIMARY KEY,
  factory TEXT NOT NULL CHECK (factory IN ('osaka', 'oita', 'kochi')),
  display_name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

-- 2. 状態: 1機械=1行（既存テーブルがある場合はスキップ）
CREATE TABLE IF NOT EXISTS public.machine_status (
  machine_id TEXT PRIMARY KEY,
  run_state TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (run_state IN ('RUN', 'STOP', 'SETUP', 'UNKNOWN')),
  jam_level INT NOT NULL DEFAULT 0 CHECK (jam_level >= 0 AND jam_level <= 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at 自動更新
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS machine_status_updated_at ON public.machine_status;
CREATE TRIGGER machine_status_updated_at
  BEFORE UPDATE ON public.machine_status
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. マスタ投入
INSERT INTO public.machines (id, factory, display_name, sort_order) VALUES
  ('osaka_ct20', 'osaka', 'CT20以下', 1),
  ('osaka_ct32', 'osaka', 'CT32', 2),
  ('osaka_nc', 'osaka', 'NC', 3),
  ('osaka_mini', 'osaka', 'MINI', 4),
  ('osaka_mc', 'osaka', 'MC', 5),
  ('oita_nc', 'oita', 'NC', 1),
  ('oita_nc_bar', 'oita', 'NC_Bar', 2),
  ('kochi_ct20', 'kochi', 'CT20', 1)
ON CONFLICT (id) DO UPDATE SET
  factory = EXCLUDED.factory,
  display_name = EXCLUDED.display_name,
  sort_order = EXCLUDED.sort_order;

INSERT INTO public.machine_status (machine_id, run_state, jam_level, updated_at)
SELECT id, 'UNKNOWN', 0, now() FROM public.machines
ON CONFLICT (machine_id) DO NOTHING;

-- 4. 表示用ビュー（updated_at が NULL になり得るため COALESCE で返す）
CREATE OR REPLACE VIEW public.machine_status_display AS
SELECT
  m.id AS machine_id,
  m.factory,
  m.display_name,
  m.sort_order,
  COALESCE(s.run_state, 'UNKNOWN') AS run_state,
  COALESCE(s.jam_level, 0) AS jam_level,
  COALESCE(s.updated_at, now()) AS updated_at
FROM public.machines m
LEFT JOIN public.machine_status s ON s.machine_id = m.id;

-- 5. RLS（誰でも SELECT / UPDATE 可能）
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "machines_select_all" ON public.machines;
CREATE POLICY "machines_select_all" ON public.machines FOR SELECT USING (true);

DROP POLICY IF EXISTS "machine_status_select_all" ON public.machine_status;
CREATE POLICY "machine_status_select_all" ON public.machine_status FOR SELECT USING (true);

DROP POLICY IF EXISTS "machine_status_update_all" ON public.machine_status;
CREATE POLICY "machine_status_update_all" ON public.machine_status FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "machine_status_insert_all" ON public.machine_status;
CREATE POLICY "machine_status_insert_all" ON public.machine_status FOR INSERT WITH CHECK (true);

-- 6. Realtime（postgres_changes）有効化
-- 既に追加済みの場合はエラーになることがあります。その場合は Dashboard > Database > Replication で public.machine_status を手動追加してください。
ALTER PUBLICATION supabase_realtime ADD TABLE public.machine_status;
```

---

### src/lib/supabaseClient.js  
目的: Supabase クライアントを環境変数で1箇所だけ初期化し、アプリ全体で共有する。

```javascript
// Supabase クライアントの初期化（Realtime / upsert もここから利用）
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'VITE_SUPABASE_URL または VITE_SUPABASE_ANON_KEY が設定されていません。'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

---

### src/hooks/useMachineStatus.js  
目的: ビュー取得・Realtime 購読・60秒フォールバック・保存処理をまとめ、購読状態を console.info で出す。

```javascript
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const VIEW_NAME = 'machine_status_display'
const STATUS_TABLE = 'machine_status'

export function useMachineStatus() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    setError(null)
    const { data: rows, error: e } = await supabase
      .from(VIEW_NAME)
      .select(
        'machine_id, factory, display_name, sort_order, run_state, jam_level, updated_at'
      )
      .order('factory', { ascending: true })
      .order('sort_order', { ascending: true })

    if (e) {
      setError(e.message)
      setData([])
      setLoading(false)
      return
    }
    setData(rows ?? [])
    setLoading(false)
  }, [])

  const saveStatus = useCallback(
    async ({ machine_id, run_state, jam_level }) => {
      const { error: e } = await supabase
        .from(STATUS_TABLE)
        .upsert(
          { machine_id, run_state, jam_level },
          { onConflict: 'machine_id' }
        )
      if (e) throw e
      return true
    },
    []
  )

  useEffect(() => {
    fetchAll()

    const ch = supabase
      .channel('machine_status_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: STATUS_TABLE },
        () => fetchAll()
      )
      .subscribe((status) => {
        console.info('[Realtime] machine_status subscribe status:', status)
      })

    const interval = setInterval(fetchAll, 60000)

    return () => {
      supabase.removeChannel(ch)
      clearInterval(interval)
    }
  }, [fetchAll])

  return { data, loading, error, refetch: fetchAll, saveStatus }
}
```

---

### src/components/FactorySection.jsx  
目的: 工場名（大阪/大分/高知）とその下の機械カード一覧を表示する。

```javascript
import MachineCard from './MachineCard'

const FACTORY_LABELS = {
  osaka: '大阪工場',
  oita: '大分工場',
  kochi: '高知工場',
}

export default function FactorySection({ factory, machines, onSave }) {
  const title = FACTORY_LABELS[factory] ?? factory

  return (
    <section className="factory-section">
      <h2 className="factory-section__title">{title}</h2>
      <div className="factory-section__cards">
        {!machines || machines.length === 0 ? (
          <p className="factory-section__empty">該当機械はありません。</p>
        ) : (
          machines.map((row) => (
            <MachineCard key={row.machine_id} row={row} onSave={onSave} />
          ))
        )}
      </div>
    </section>
  )
}
```

---

### src/components/MachineCard.jsx  
目的: 1台分の表示（実行状態・ジャムレベル・青→黄→赤バー・スライダー・変更を保存ボタン）。

```javascript
import { useEffect, useMemo, useState } from 'react'

const RUN_STATES = [
  { value: 'RUN', label: 'RUN' },
  { value: 'STOP', label: 'STOP' },
  { value: 'SETUP', label: 'SETUP' },
  { value: 'UNKNOWN', label: 'UNKNOWN' },
]

function formatJst(ts) {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('ja-JP')
}

export default function MachineCard({ row, onSave }) {
  const [jam, setJam] = useState(row.jam_level ?? 0)
  const [state, setState] = useState(row.run_state ?? 'UNKNOWN')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setJam(row.jam_level ?? 0)
    setState(row.run_state ?? 'UNKNOWN')
  }, [row.jam_level, row.run_state])

  const isWarn = (jam ?? 0) >= 70
  const pct = Math.max(0, Math.min(100, Number(jam) || 0))

  const barStyle = useMemo(
    () => ({
      width: `${pct}%`,
      background: `linear-gradient(90deg, #1e88e5 0%, #f9a825 50%, #d32f2f 100%)`,
    }),
    [pct]
  )

  const handleSave = async () => {
    setSaving(true)
    try {
      const ok = await onSave({
        machine_id: row.machine_id,
        run_state: state,
        jam_level: Number(jam),
      })
      if (!ok) throw new Error('保存に失敗しました')
    } catch (_err) {
      // 親でトースト表示済み
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`machineCard ${isWarn ? 'machineCard--warn' : ''}`}>
      <div className="machineCard__head">
        <span className="machineCard__title">{row.display_name}</span>
      </div>

      <div className="machineCard__row">
        <label className="machineCard__label">実行状態</label>
        <select
          className="machineCard__select"
          value={state}
          onChange={(e) => setState(e.target.value)}
          disabled={saving}
        >
          {RUN_STATES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="machineCard__row">
        <label className="machineCard__label">ジャムレベル</label>
        <div className="machineCard__jamWrap">
          <div className="machineCard__jamBar">
            <div className="machineCard__jamFill" style={barStyle} />
          </div>
          <span className="machineCard__jamValue">{jam}</span>
        </div>
      </div>

      <input
        className="machineCard__slider"
        type="range"
        min="0"
        max="100"
        value={jam}
        onChange={(e) => setJam(Number(e.target.value))}
        disabled={saving}
      />

      <div className="machineCard__foot">
        <span className="machineCard__updated">
          更新: {formatJst(row.updated_at)}
        </span>
        <button
          type="button"
          className="machineCard__saveBtn"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : '変更を保存'}
        </button>
      </div>
    </div>
  )
}
```

---

### src/App.jsx  
目的: 見出し・エラー・トースト・3工場セクションを組み合わせ、保存後に refetch して表示を更新する。

```javascript
import { useState, useCallback, useMemo } from 'react'
import { useMachineStatus } from './hooks/useMachineStatus'
import FactorySection from './components/FactorySection'
import './App.css'

const FACTORIES = ['osaka', 'oita', 'kochi']

export default function App() {
  const { data, loading, error, refetch, saveStatus } = useMachineStatus()
  const [toast, setToast] = useState(null)
  const [saving, setSaving] = useState(false)

  const showToast = useCallback((success, message) => {
    setToast({ success, message })
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [])

  const handleSave = useCallback(
    async (payload) => {
      setSaving(true)
      try {
        await saveStatus(payload)
        refetch()
        showToast(true, '保存しました')
        return true
      } catch (err) {
        showToast(false, err?.message ?? '保存に失敗しました')
        return false
      } finally {
        setSaving(false)
      }
    },
    [saveStatus, refetch, showToast]
  )

  const byFactory = useMemo(() => {
    const map = { osaka: [], oita: [], kochi: [] }
    for (const row of data) {
      if (map[row.factory]) map[row.factory].push(row)
    }
    return map
  }, [data])

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">工場ビジーメーター</h1>
        {saving && <span className="app__saving">Saving...</span>}
      </header>

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
        <div className="app__sections">
          {FACTORIES.map((f) => (
            <FactorySection
              key={f}
              factory={f}
              machines={byFactory[f]}
              onSave={handleSave}
            />
          ))}
        </div>
      )}

      {toast && (
        <div
          className={`app__toast app__toast--${toast.success ? 'ok' : 'ng'}`}
          role="status"
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
```

---

### src/App.css  
目的: アプリ・工場セクション・機械カード・トーストのレイアウトと見た目を定義する。

```css
/* ========== アプリ全体 ========== */
.app {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem;
  min-height: 100vh;
}

.app__header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.app__title {
  margin: 0;
  font-size: 1.75rem;
}

.app__saving {
  color: var(--color-muted, #888);
  font-size: 0.9rem;
}

.app__loading {
  color: var(--color-muted, #888);
}

.app__error {
  padding: 1rem;
  background: rgba(200, 80, 80, 0.15);
  border: 1px solid #c44;
  border-radius: 8px;
  margin-bottom: 1rem;
}

.app__error button {
  margin-top: 0.5rem;
}

.app__sections {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.app__toast {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.75rem 1.25rem;
  border-radius: 8px;
  font-size: 0.95rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  z-index: 1000;
  animation: toast-in 0.2s ease-out;
}

.app__toast--ok {
  background: #2a7a2a;
  color: #fff;
}

.app__toast--ng {
  background: #a22;
  color: #fff;
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* ========== 工場セクション ========== */
.factory-section {
  border: 1px solid var(--border-color, #444);
  border-radius: 12px;
  padding: 1rem;
  background: var(--section-bg, rgba(255, 255, 255, 0.03));
}

.factory-section__title {
  margin: 0 0 1rem;
  font-size: 1.25rem;
  font-weight: 600;
}

.factory-section__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.factory-section__empty {
  color: var(--color-muted, #888);
  margin: 0;
}

/* ========== 機械カード（青→黄→赤バー・変更を保存） ========== */
.machineCard {
  border: 1px solid var(--border-color, #444);
  border-radius: 10px;
  padding: 1rem;
  background: var(--card-bg, #1a1a1a);
  transition: background 0.2s, border-color 0.2s;
}

.machineCard--warn {
  background: rgba(200, 60, 60, 0.12);
  border-color: rgba(200, 60, 60, 0.5);
}

.machineCard__head {
  margin-bottom: 0.75rem;
}

.machineCard__title {
  font-weight: 600;
  font-size: 1.05rem;
}

.machineCard__row {
  margin-bottom: 0.5rem;
}

.machineCard__label {
  display: block;
  font-size: 0.85rem;
  color: var(--color-muted, #888);
  margin-bottom: 0.25rem;
}

.machineCard__select {
  width: 100%;
  max-width: 140px;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--border-color, #444);
  background: var(--input-bg, #222);
  color: inherit;
  font-size: 0.95rem;
}

.machineCard__jamWrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.5rem 0;
}

.machineCard__jamBar {
  flex: 1;
  height: 12px;
  background: var(--bar-bg, #333);
  border-radius: 6px;
  overflow: hidden;
}

.machineCard__jamFill {
  height: 100%;
  border-radius: 6px;
  transition: width 0.15s ease-out;
}

.machineCard__jamValue {
  font-weight: 600;
  font-size: 1.1rem;
  min-width: 2.5rem;
}

.machineCard__slider {
  width: 100%;
  margin: 0.5rem 0;
  accent-color: #f9a825;
}

.machineCard__foot {
  margin-top: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border-color, #333);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.machineCard__updated {
  font-size: 0.8rem;
  color: var(--color-muted, #888);
}

.machineCard__saveBtn {
  width: 100%;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  border: 1px solid var(--border-color, #444);
  background: var(--btn-bg, #2a2a2a);
  color: inherit;
  font-size: 0.95rem;
  cursor: pointer;
}

.machineCard__saveBtn:hover:not(:disabled) {
  border-color: #646cff;
}

.machineCard__saveBtn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (prefers-color-scheme: light) {
  .machineCard {
    --card-bg: #f5f5f5;
    --border-color: #ccc;
    --input-bg: #fff;
    --bar-bg: #e0e0e0;
    --btn-bg: #e8e8e8;
  }

  .factory-section {
    --section-bg: rgba(0, 0, 0, 0.03);
    --border-color: #ccc;
  }

  .machineCard--warn {
    background: rgba(200, 60, 60, 0.08);
    border-color: rgba(200, 60, 60, 0.4);
  }
}
```

---

以上が、変更・新規作成した全ファイルの完成コード全文です。
