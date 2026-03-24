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

-- 2. 状態: 1機械=1行（今週・来週・再来週の稼働%を保持）
CREATE TABLE IF NOT EXISTS public.machine_status (
  machine_id TEXT PRIMARY KEY,
  run_state TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (run_state IN ('RUN', 'STOP', 'SETUP', 'UNKNOWN')),
  jam_level INT NOT NULL DEFAULT 0 CHECK (jam_level >= 0 AND jam_level <= 100),
  jam_level_next_week INT NOT NULL DEFAULT 0 CHECK (jam_level_next_week >= 0 AND jam_level_next_week <= 100),
  jam_level_week_after INT NOT NULL DEFAULT 0 CHECK (jam_level_week_after >= 0 AND jam_level_week_after <= 100),
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

-- 4. 表示用ビュー（今週=jam_level, 来週=jam_level_next_week, 再来週=jam_level_week_after）
CREATE OR REPLACE VIEW public.machine_status_display AS
SELECT
  m.id AS machine_id,
  m.factory,
  m.display_name,
  m.sort_order,
  COALESCE(s.run_state, 'UNKNOWN') AS run_state,
  COALESCE(s.jam_level, 0) AS jam_level,
  COALESCE(s.jam_level_next_week, 0) AS jam_level_next_week,
  COALESCE(s.jam_level_week_after, 0) AS jam_level_week_after,
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

-- ========== 既存DB用: 今週・来週・再来週カラム追加（初回のみ実行） ==========
ALTER TABLE public.machine_status ADD COLUMN IF NOT EXISTS jam_level_next_week INT NOT NULL DEFAULT 0;
ALTER TABLE public.machine_status ADD COLUMN IF NOT EXISTS jam_level_week_after INT NOT NULL DEFAULT 0;
ALTER TABLE public.machine_status ADD CONSTRAINT machine_status_jam_next_week_range CHECK (jam_level_next_week >= 0 AND jam_level_next_week <= 100);
ALTER TABLE public.machine_status ADD CONSTRAINT machine_status_jam_week_after_range CHECK (jam_level_week_after >= 0 AND jam_level_week_after <= 100);
-- 上記でエラーになる場合は、既に制約があるかカラムが存在します。ビューだけ更新してください:
-- CREATE OR REPLACE VIEW public.machine_status_display AS ... (4. と同じ内容)
