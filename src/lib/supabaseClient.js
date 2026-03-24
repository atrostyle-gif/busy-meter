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
