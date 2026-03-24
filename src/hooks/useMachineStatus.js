import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const VIEW_NAME = 'machine_status_display'
const STATUS_TABLE = 'machine_status'

export function useMachineStatus() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data: rows, error: e } = await supabase
      .from(VIEW_NAME)
      .select(
        'machine_id, factory, display_name, sort_order, run_state, jam_level, jam_level_next_week, jam_level_week_after, updated_at'
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
    async ({
      machine_id,
      jam_level,
      jam_level_next_week,
      jam_level_week_after,
    }) => {
      const payload = {
        machine_id,
        jam_level: jam_level ?? 0,
        jam_level_next_week: jam_level_next_week ?? 0,
        jam_level_week_after: jam_level_week_after ?? 0,
        updated_at: new Date().toISOString(),
      }
      const { error: e } = await supabase
        .from(STATUS_TABLE)
        .upsert(payload, { onConflict: 'machine_id' })
      if (e) throw e
      return true
    },
    []
  )

  useEffect(() => {
    queueMicrotask(() => {
      void fetchAll()
    })

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
