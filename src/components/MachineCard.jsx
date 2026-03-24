// 機械名（NC/MC/MINI/CT等）のブラウザ自動翻訳を防ぐため translate="no" と .no-translate を付与
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const SNAP_POINTS = [0, 25, 50, 75, 100]
const SNAP_THRESHOLD = 4
const SNAP_LOCK_MS = 110

/** 0–100 にクランプして整数に */
function clampRound(v) {
  return Math.max(0, Math.min(100, Math.round(Number(v) || 0)))
}

/**
 * soft snap（磁石みたいな吸着）: ±threshold 以内なら points のいずれかに吸着、それ以外はそのまま。
 * @param {number} value - 元値 (0–100)
 * @param {number[]} points - 吸着点
 * @param {number} threshold - 吸着幅（±）
 * @returns {number} 吸着時は points の値、そうでなければ value（クランプ済み）
 */
function softSnap(value, points, threshold) {
  const n = clampRound(value)
  let best = n
  let bestDist = Infinity
  for (const p of points) {
    const d = Math.abs(n - p)
    if (d < bestDist) {
      bestDist = d
      best = p
    }
  }
  return bestDist <= threshold ? best : n
}

const PERIODS = [
  { key: 'this_week', label: '今週', rowKey: 'jam_level' },
  { key: 'next_week', label: '来週', rowKey: 'jam_level_next_week' },
  { key: 'week_after', label: '再来週', rowKey: 'jam_level_week_after' },
]

// 稼働状況バー用：0%→青、50%→黄、100%→赤（値に応じた単一色で表示）
const BAR_COLOR_BLUE = '#1e88e5'
const BAR_COLOR_YELLOW = '#f9a825'
const BAR_COLOR_RED = '#d32f2f'

function hexToRgb(hex) {
  const bigint = parseInt(hex.slice(1), 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return [r, g, b]
}

function interpolateColor(color1, color2, factor) {
  const result = color1.slice()
  for (let i = 0; i < 3; i++) {
    result[i] = Math.round(result[i] + factor * (color2[i] - color1[i]))
  }
  return `rgb(${result.join(',')})`
}

function getGradientColor(value) {
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  const blueRgb = hexToRgb(BAR_COLOR_BLUE)
  const yellowRgb = hexToRgb(BAR_COLOR_YELLOW)
  const redRgb = hexToRgb(BAR_COLOR_RED)
  if (v <= 50) {
    const factor = v / 50
    return interpolateColor(blueRgb, yellowRgb, factor)
  }
  const factor = (v - 50) / 50
  return interpolateColor(yellowRgb, redRgb, factor)
}

/** rgb(r,g,b) を白で薄めた色を返す。ratio=0 でそのまま、1 で白 */
function lightenColor(rgbString, ratio) {
  const match = rgbString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (!match) return rgbString
  const r = Math.round(parseInt(match[1], 10) + (255 - parseInt(match[1], 10)) * ratio)
  const g = Math.round(parseInt(match[2], 10) + (255 - parseInt(match[2], 10)) * ratio)
  const b = Math.round(parseInt(match[3], 10) + (255 - parseInt(match[3], 10)) * ratio)
  return `rgb(${r},${g},${b})`
}

const JST_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function formatUpdatedAtJst(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  return JST_FORMATTER.format(d)
}

export default function MachineCard({ row, onSave }) {
  const [jamThisWeek, setJamThisWeek] = useState(clampRound(row.jam_level ?? 0))
  const [jamNextWeek, setJamNextWeek] = useState(clampRound(row.jam_level_next_week ?? 0))
  const [jamWeekAfter, setJamWeekAfter] = useState(clampRound(row.jam_level_week_after ?? 0))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [displayUpdatedAt, setDisplayUpdatedAt] = useState(row.updated_at ?? null)

  const lastSavedRef = useRef({
    jam_level: clampRound(row.jam_level ?? 0),
    jam_level_next_week: clampRound(row.jam_level_next_week ?? 0),
    jam_level_week_after: clampRound(row.jam_level_week_after ?? 0),
  })
  const pendingRef = useRef({
    jam_level: clampRound(row.jam_level ?? 0),
    jam_level_next_week: clampRound(row.jam_level_next_week ?? 0),
    jam_level_week_after: clampRound(row.jam_level_week_after ?? 0),
  })
  const userEditingRef = useRef(false)
  const [dragKey, setDragKey] = useState(null)
  const [dragValue, setDragValue] = useState(0)
  const dragValueRef = useRef(0)
  const lastSnapPointRef = useRef(null)
  const lockTimeoutRef = useRef(null)
  const [lockKey, setLockKey] = useState(null)
  const [lockValue, setLockValue] = useState(0)
  const [lockActive, setLockActive] = useState(false)

  useEffect(() => {
    if (userEditingRef.current) return
    const v0 = clampRound(row.jam_level ?? 0)
    const v1 = clampRound(row.jam_level_next_week ?? 0)
    const v2 = clampRound(row.jam_level_week_after ?? 0)
    queueMicrotask(() => {
      setJamThisWeek(v0)
      setJamNextWeek(v1)
      setJamWeekAfter(v2)
    })
    lastSavedRef.current = { jam_level: v0, jam_level_next_week: v1, jam_level_week_after: v2 }
    pendingRef.current = { jam_level: v0, jam_level_next_week: v1, jam_level_week_after: v2 }
  }, [row.jam_level, row.jam_level_next_week, row.jam_level_week_after])

  useEffect(() => {
    const nextUpdated = row.updated_at ?? null
    queueMicrotask(() => {
      setDisplayUpdatedAt(nextUpdated)
    })
  }, [row.updated_at])

  useEffect(() => {
    return () => {
      if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current)
    }
  }, [])

  /* 内部の元値 raw: ドラッグ中は dragValue、否则 jam。グラデーション等は raw を使う */
  const rawValues = useMemo(() => ({
    this_week: dragKey === 'this_week' ? dragValue : jamThisWeek,
    next_week: dragKey === 'next_week' ? dragValue : jamNextWeek,
    week_after: dragKey === 'week_after' ? dragValue : jamWeekAfter,
  }), [dragKey, dragValue, jamThisWeek, jamNextWeek, jamWeekAfter])

  /* UI表示用: ロック中は lockValue、否则 raw。非ドラッグ時は jam */
  const displayValues = useMemo(() => {
    const inLock = (k) => lockKey === k && lockActive
    const disp = (k, raw) => {
      if (dragKey !== k) return raw
      if (inLock(k)) return lockValue
      return raw
    }
    return {
      this_week: disp('this_week', rawValues.this_week),
      next_week: disp('next_week', rawValues.next_week),
      week_after: disp('week_after', rawValues.week_after),
    }
  }, [dragKey, lockActive, lockKey, lockValue, rawValues.this_week, rawValues.next_week, rawValues.week_after])

  const runSave = useCallback(() => {
    const p = pendingRef.current
    setSaving(true)
    setSaveError(false)
    onSave({
      machine_id: row.machine_id,
      jam_level: p.jam_level,
      jam_level_next_week: p.jam_level_next_week,
      jam_level_week_after: p.jam_level_week_after,
    })
      .then((ok) => {
        if (ok) {
          lastSavedRef.current = { ...p }
          setDisplayUpdatedAt(new Date().toISOString())
        } else {
          setSaveError(true)
        }
      })
      .finally(() => {
        setSaving(false)
        userEditingRef.current = false
      })
  }, [onSave, row.machine_id])

  const clearSnapLock = useCallback(() => {
    if (lockTimeoutRef.current) {
      clearTimeout(lockTimeoutRef.current)
      lockTimeoutRef.current = null
    }
    setLockKey(null)
    setLockActive(false)
    lastSnapPointRef.current = null
  }, [])

  const handleSliderInput = (key, raw) => {
    const v = clampRound(raw)
    if (!dragKey) userEditingRef.current = true
    setDragKey(key)
    setDragValue(v)
    dragValueRef.current = v

    const snapped = softSnap(v, SNAP_POINTS, SNAP_THRESHOLD)
    const inZone = SNAP_POINTS.includes(snapped)
    const entered = inZone && lastSnapPointRef.current !== snapped

    if (!inZone) {
      lastSnapPointRef.current = null
      return
    }
    if (entered) {
      lastSnapPointRef.current = snapped
      if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current)
      setLockKey(key)
      setLockValue(snapped)
      setLockActive(true)
      lockTimeoutRef.current = setTimeout(() => {
        lockTimeoutRef.current = null
        setLockKey(null)
        setLockActive(false)
        lastSnapPointRef.current = null
      }, SNAP_LOCK_MS)
    }
  }

  const handleSliderRelease = useCallback((key) => {
    if (dragKey !== key) return
    const raw = dragValueRef.current
    const rowKey = PERIODS.find((p) => p.key === key).rowKey
    if (key === 'this_week') setJamThisWeek(raw)
    else if (key === 'next_week') setJamNextWeek(raw)
    else setJamWeekAfter(raw)
    pendingRef.current = { ...pendingRef.current, [rowKey]: raw }
    setDragKey(null)
    clearSnapLock()
    runSave()
  }, [clearSnapLock, dragKey, runSave])

  useEffect(() => {
    if (!dragKey) return
    const onUp = () => handleSliderRelease(dragKey)
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [dragKey, handleSliderRelease])

  const cardStyle = useMemo(() => {
    const v = rawValues.this_week
    const color = getGradientColor(v)
    return {
      ['--card-tint']: lightenColor(color, 0.88),
      ['--card-tint-border']: lightenColor(color, 0.55),
    }
  }, [rawValues.this_week])

  const barStyles = useMemo(() => {
    const r = rawValues
    const d = displayValues
    return {
      this_week: {
        width: `${Math.max(0, Math.min(100, Number(d.this_week) || 0))}%`,
        backgroundColor: getGradientColor(r.this_week),
        ['--jam-fill-color']: getGradientColor(r.this_week),
      },
      next_week: {
        width: `${Math.max(0, Math.min(100, Number(d.next_week) || 0))}%`,
        backgroundColor: getGradientColor(r.next_week),
        ['--jam-fill-color']: getGradientColor(r.next_week),
      },
      week_after: {
        width: `${Math.max(0, Math.min(100, Number(d.week_after) || 0))}%`,
        backgroundColor: getGradientColor(r.week_after),
        ['--jam-fill-color']: getGradientColor(r.week_after),
      },
    }
  }, [displayValues, rawValues])

  const updatedAtDisplay = displayUpdatedAt ?? row.updated_at ?? null

  return (
    <div className="machineCard" style={cardStyle}>
      <div className="machineCard__head">
        <span className="machineCard__title no-translate" translate="no">
          {row.display_name}
        </span>
      </div>

      <div className="machineCard__jamSection">
        {PERIODS.map(({ key, label }) => {
          const displayVal = displayValues[key]
          const rawVal = rawValues[key]
          return (
            <div key={key} className="machineCard__period">
              <div className="machineCard__jamRow">
                <label className="machineCard__jamLabel">{label}</label>
                <div className="machineCard__jamWrap">
                  <div className="machineCard__jamBar">
                    <div className="machineCard__jamFill" style={barStyles[key]} />
                  </div>
                  <span className="machineCard__jamValue">{Math.round(displayVal)}%</span>
                </div>
                <input
                  className="machineCard__slider"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={rawVal}
                  onInput={(e) => handleSliderInput(key, e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="machineCard__foot">
        <span className="machineCard__updated">
          更新: {formatUpdatedAtJst(updatedAtDisplay)}
        </span>
        {saving && (
          <span className="machineCard__status machineCard__status--saving">
            Saving...
          </span>
        )}
        {saveError && !saving && (
          <span className="machineCard__status machineCard__status--error">
            保存失敗
          </span>
        )}
      </div>
    </div>
  )
}
