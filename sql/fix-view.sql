-- machine_status_display に 来週・再来週 を反映するための修正
-- Supabase SQL Editor に貼り付けて実行してください。
--
-- ※ machines の実際のカラム: id, factory_id, factory_name, machine_key, sort_order

-- 1. テーブルにカラムが無い場合は追加
ALTER TABLE public.machine_status ADD COLUMN IF NOT EXISTS jam_level_next_week INT NOT NULL DEFAULT 0;
ALTER TABLE public.machine_status ADD COLUMN IF NOT EXISTS jam_level_week_after INT NOT NULL DEFAULT 0;

-- 2. ビューを削除してから作り直す（列を追加する場合は REPLACE だとエラーになるため）
DROP VIEW IF EXISTS public.machine_status_display;

-- 3. ビューを新定義で作成（machine_key を表示名として使用）
CREATE VIEW public.machine_status_display AS
SELECT
  m.id AS machine_id,
  m.factory_id AS factory,
  m.factory_name,
  m.machine_key AS display_name,
  m.sort_order,
  COALESCE(s.run_state, 'UNKNOWN') AS run_state,
  COALESCE(s.jam_level, 0) AS jam_level,
  COALESCE(s.jam_level_next_week, 0) AS jam_level_next_week,
  COALESCE(s.jam_level_week_after, 0) AS jam_level_week_after,
  COALESCE(s.updated_at, now()) AS updated_at
FROM public.machines m
LEFT JOIN public.machine_status s ON s.machine_id = m.id;
