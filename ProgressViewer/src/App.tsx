import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  Tooltip,
  Legend,
  Title
} from 'chart.js'
import type { Chart as ChartType } from 'chart.js'
import { Line } from 'react-chartjs-2'
import GitHubButton from 'react-github-btn'

ChartJS.register(LineElement, PointElement, LinearScale, Tooltip, Legend, Title)

type Reading = [number, number]
type ReadingsJson = {
  'anga205'?: Reading[]
  'munish42'?: Reading[]
  'shakirth-anisha'?: Reading[]
  'prayasha_nanda'?: Reading[]
  'sashshaikh12'?: Reading[]
  'siri_n_shetty'?: Reading[]
}

function useReadings() {
  const [data, setData] = useState<ReadingsJson>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/readings.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((j: ReadingsJson) => {
        if (!active) return
        setData(j)
        setLoading(false)
      })
      .catch(e => {
        if (!active) return
        setError(e.message)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return { data, loading, error }
}

function toXY(points: Reading[] | undefined) {
  if (!points) return []
  return points.map(([solved, ts]) => ({ x: ts, y: solved }))
}

function formatTs(ts: number) {
  try {
    return new Date(ts * 1000).toLocaleString()
  } catch {
    return String(ts)
  }
}

function formatDateOnly(ts: number) {
  try {
    return new Date(ts * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  } catch {
    return String(ts)
  }
}

export default function App() {
  const { data, loading, error } = useReadings()
  const [range, setRange] = useState<'7d' | '30d' | '90d' | '1y' | 'all' | 'custom'>('all')
  const [customSpan, setCustomSpan] = useState<string>('90d')
  const [customWindow, setCustomWindow] = useState<{ from: number; to: number } | null>(null)
  const chartRef = useRef<ChartType<'line'> | null>(null)
  const [drag, setDrag] = useState<null | { startX: number; currentX: number }>(null)
  // Delta line creator UI state
  const SERIES: { key: keyof ReadingsJson, label: string, color: string, bg: string }[] = [
    { key: 'anga205', label: 'Angad', color: 'rgb(59, 130, 246)', bg: 'rgba(59, 130, 246, 0.2)' },
    { key: 'munish42', label: 'Munis', color: 'rgb(16, 185, 129)', bg: 'rgba(16, 185, 129, 0.2)' },
    { key: 'shakirth-anisha', label: 'Anisha', color: 'rgb(236, 72, 153)', bg: 'rgba(236, 72, 153, 0.2)' },
    { key: 'prayasha_nanda', label: 'Prayasha', color: 'rgb(234, 179, 8)', bg: 'rgba(234, 179, 8, 0.2)' },
    { key: 'sashshaikh12', label: 'Hashir', color: 'rgb(33, 58, 212)', bg: 'rgba(33, 58, 212, 0.2)' },
    { key: 'siri_n_shetty', label: 'Siri N Shetty', color: 'rgb(219, 139, 119)', bg: 'rgba(219, 139, 119, 0.2)' }
  ]
  const [deltaA, setDeltaA] = useState<keyof ReadingsJson>('anga205')
  const [deltaB, setDeltaB] = useState<keyof ReadingsJson>('shakirth-anisha')
  const [deltaDefs, setDeltaDefs] = useState<Array<{ a: keyof ReadingsJson, b: keyof ReadingsJson, id: number }>>([])

  const nowSecs = Math.floor(Date.now() / 1000)
  const rangeToSeconds: Record<'7d' | '30d' | '90d' | '1y' | 'all', number | 'all'> = {
    '7d': 7 * 24 * 60 * 60,
    '30d': 30 * 24 * 60 * 60,
    '90d': 90 * 24 * 60 * 60,
    '1y': 365 * 24 * 60 * 60,
    'all': 'all'
  }

  function parseHumanDurationToSeconds(input: string): number | null {
    const s = input.trim().toLowerCase()
    if (!s) return null

    // Supports: 5y 2mo 7d 13h 53m 1s (order doesn't matter)
    // Approximations: 1y = 365d, 1mo = 30d
    const re = /(-?\d+(?:\.\d+)?)\s*(y|yr|yrs|year|years|mo|mon|month|months|w|wk|wks|week|weeks|d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)\b/g
    let total = 0
    let matched = false
    let m: RegExpExecArray | null
    while ((m = re.exec(s)) != null) {
      matched = true
      const n = Number(m[1])
      if (!Number.isFinite(n)) return null
      const unit = m[2]
      const secondsPerUnit =
        unit === 'y' || unit === 'yr' || unit === 'yrs' || unit === 'year' || unit === 'years' ? 365 * 24 * 60 * 60 :
        unit === 'mo' || unit === 'mon' || unit === 'month' || unit === 'months' ? 30 * 24 * 60 * 60 :
        unit === 'w' || unit === 'wk' || unit === 'wks' || unit === 'week' || unit === 'weeks' ? 7 * 24 * 60 * 60 :
        unit === 'd' || unit === 'day' || unit === 'days' ? 24 * 60 * 60 :
        unit === 'h' || unit === 'hr' || unit === 'hrs' || unit === 'hour' || unit === 'hours' ? 60 * 60 :
        unit === 'm' || unit === 'min' || unit === 'mins' || unit === 'minute' || unit === 'minutes' ? 60 :
        1
      total += n * secondsPerUnit
    }
    if (!matched) return null
    // Negative/zero durations don't make sense for "last X".
    if (!(total > 0)) return null
    return Math.floor(total)
  }

  function formatHumanDuration(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds))
    const parts: string[] = []
    let r = s
    const units: Array<[string, number]> = [
      ['y', 365 * 24 * 60 * 60],
      ['mo', 30 * 24 * 60 * 60],
      ['d', 24 * 60 * 60],
      ['h', 60 * 60],
      ['m', 60],
      ['s', 1]
    ]
    for (const [label, size] of units) {
      if (r >= size) {
        const q = Math.floor(r / size)
        r -= q * size
        parts.push(`${q}${label}`)
      }
    }
    return parts.length ? parts.join(' ') : '0s'
  }

  const customSpanSeconds = useMemo(() => parseHumanDurationToSeconds(customSpan), [customSpan])

  const [minTs, maxTs] = useMemo((): [number, number] => {
    if (range === 'custom') {
      if (customWindow) {
        const lo = Math.min(customWindow.from, customWindow.to)
        const hi = Math.max(customWindow.from, customWindow.to)
        return [lo, hi]
      }
      if (customSpanSeconds != null) {
        return [nowSecs - customSpanSeconds, nowSecs]
      }
      return [-Infinity, Infinity]
    }
    const span = rangeToSeconds[range as Exclude<typeof range, 'custom'>]
    if (span === 'all') return [-Infinity, Infinity]
    return [nowSecs - span, Infinity]
  }, [range, customWindow, customSpanSeconds, nowSecs])

  const chartData = useMemo(() => {
    const anga = toXY(data.anga205).filter(p => p.x >= minTs && p.x <= maxTs)
    const munis = toXY(data.munish42).filter(p => p.x >= minTs && p.x <= maxTs)
    const anisha = toXY(data['shakirth-anisha']).filter(p => p.x >= minTs && p.x <= maxTs)
    const prayasha = toXY(data['prayasha_nanda']).filter(p => p.x >= minTs && p.x <= maxTs)
    const hashir = toXY(data['sashshaikh12']).filter(p => p.x >= minTs && p.x <= maxTs)
    const siri_n_shetty = toXY(data['siri_n_shetty']).filter(p => p.x >= minTs && p.x <= maxTs)
    const datasets: any[] = [
      {
        label: 'Angad',
        data: anga,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        tension: 0.2,
        pointRadius: 2
      },
      {
        label: 'Munis',
        data: munis,
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        tension: 0.2,
        pointRadius: 2
      },
      {
        label: 'Anisha',
        data: anisha,
        borderColor: 'rgb(236, 72, 153)',
        backgroundColor: 'rgba(236, 72, 153, 0.2)',
        tension: 0.2,
        pointRadius: 2
      },
      {
        label: 'Prayasha',
        data: prayasha,
        borderColor: 'rgb(234, 179, 8)',
        backgroundColor: 'rgba(234, 179, 8, 0.2)',
        tension: 0.2,
        pointRadius: 2
      },
      {
        label: 'Hashir',
        data: hashir,
        borderColor: 'rgb(33, 58, 212)',
        backgroundColor: 'rgba(33, 58, 212, 0.2)',
        tension: 0.2,
        pointRadius: 2
      },
      {
        label: 'Siri N Shetty',
        data: siri_n_shetty,
        borderColor: 'rgb(219, 139, 119)',
        backgroundColor: 'rgba(219, 139, 119, 0.2)',
        tension: 0.2,
        pointRadius: 2
      }
    ]

    // Compute delta datasets
    function nearestYAt(dataPts: { x: number; y: number }[], xVal: number): number | null {
      if (!dataPts.length) return null
      let best = dataPts[0]
      let bestDist = Math.abs(best.x - xVal)
      for (let i = 1; i < dataPts.length; i++) {
        const d = dataPts[i]
        const dist = Math.abs(d.x - xVal)
        if (dist < bestDist) {
          best = d
          bestDist = dist
        }
      }
      return best.y
    }

    const labelByKey = (k: keyof ReadingsJson) => SERIES.find(s => s.key === k)?.label ?? String(k)
    const deltas = deltaDefs.map(def => {
      const aPts = toXY(data[def.a]).filter(p => p.x >= minTs && p.x <= maxTs)
      const bPts = toXY(data[def.b]).filter(p => p.x >= minTs && p.x <= maxTs)
      const out: { x: number; y: number }[] = []
      for (const p of aPts) {
        const yB = nearestYAt(bPts, p.x)
        if (yB != null) out.push({ x: p.x, y: p.y - yB })
      }
      return {
        label: `Δ (${labelByKey(def.a)} − ${labelByKey(def.b)})`,
        data: out,
        borderColor: 'rgba(255,255,255,0.9)',
        backgroundColor: 'rgba(255,255,255,0.15)',
        tension: 0.2,
        pointRadius: 1,
        borderDash: [6, 3]
      }
    })

    return { datasets: [...datasets, ...deltas] }
  }, [data, minTs, maxTs, deltaDefs])

  const xDomain = useMemo(() => {
    const anga = toXY(data.anga205).filter(p => p.x >= minTs && p.x <= maxTs)
    const munis = toXY(data.munish42).filter(p => p.x >= minTs && p.x <= maxTs)
    const xs: number[] = []
    for (const p of anga) xs.push(p.x)
    for (const p of munis) xs.push(p.x)
    if (xs.length === 0) return { min: undefined as number | undefined, max: undefined as number | undefined }
    let min = xs[0]
    let max = xs[0]
    for (let i = 1; i < xs.length; i++) {
      if (xs[i] < min) min = xs[i]
      if (xs[i] > max) max = xs[i]
    }
    return { min, max }
  }, [data, minTs, maxTs])

  const options = useMemo(() => {
    const min = xDomain.min
    const max = xDomain.max
    let paddedMin = min
    let paddedMax = max
    if (min !== undefined && max !== undefined) {
      const span = max - min
      const pad = span * 0.03
      paddedMin = min - pad
      paddedMax = max + pad
    }
    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 12
        }
      },
      plugins: {
        title: {
          display: true,
          text: 'LeetCode Solves Over Time',
          color: '#e5e7eb'
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          callbacks: {
            title: (ctx: any) => {
              if (ctx.length && ctx[0].parsed?.x) return formatTs(ctx[0].parsed.x)
              return ''
            }
          }
        },
        legend: {
          padding: 14,
          labels: {
            color: '#e5e7eb',
            padding: 16,
            filter: (legendItem: any) => legendItem.text !== 'Gap'
          }
        }
      },
      scales: {
        x: {
          type: 'linear' as const,
          title: { display: true, text: 'Time', color: '#e5e7eb' },
          bounds: 'ticks' as const,
          offset: false,
          grace: 0,
          min: paddedMin,
          max: paddedMax,
          ticks: {
            callback: (val: any) => formatDateOnly(Number(val)),
            color: '#9ca3af'
          },
          grid: {
            color: 'rgba(255,255,255,0.08)'
          }
        },
        y: {
          title: { display: true, text: 'Total Solved', color: '#e5e7eb' },
          beginAtZero: false,
          ticks: { color: '#9ca3af' },
          grid: {
            color: 'rgba(255,255,255,0.08)'
          }
        }
      }
    }
  }, [xDomain])

  if (loading) return <div className="min-h-screen bg-neutral-900 text-neutral-100 p-4">Loading…</div>
  if (error) return <div className="min-h-screen bg-neutral-900 text-neutral-100 p-4">Error: {error}</div>

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 p-4">
      <div className="max-w-5xl mx-auto">
        <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold leading-tight">Leetcode Progress Tracker</h1>
            <div className="text-sm text-neutral-400">Angad & friends</div>
          </div>
          <div className="shrink-0">
            <GitHubButton
              href="https://github.com/Anga205/anga_vs_munis_tracker"
              data-color-scheme="no-preference: dark; light: dark; dark: dark;"
              data-size="large"
              aria-label="Star Anga205/anga_vs_munis_tracker on GitHub"
            >
              Source Code
            </GitHubButton>
          </div>
        </header>

        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Time range */}
          <section className="bg-neutral-900/40 border border-neutral-800 rounded-lg p-3">
            <div className="text-sm font-medium text-neutral-200 mb-2">Time</div>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="range" className="text-sm text-neutral-300">Range</label>
              <select
                id="range"
                value={range}
                onChange={e => {
                  const next = e.target.value as typeof range
                  setRange(next)
                  if (next !== 'custom') setCustomWindow(null)
                }}
                className="bg-neutral-800 text-neutral-100 border border-neutral-700 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="1y">Last year</option>
                <option value="all">All time</option>
                <option value="custom">Custom…</option>
              </select>

              {range === 'custom' && (
                <>
                  <span className="hidden sm:inline text-sm text-neutral-500">|</span>
                  <label className="text-sm text-neutral-300" htmlFor="customSpan">Last</label>
                  <input
                    id="customSpan"
                    inputMode="text"
                    placeholder="90d or 1y 2mo"
                    value={customSpan}
                    onChange={e => {
                      setCustomSpan(e.target.value)
                      setCustomWindow(null)
                    }}
                    className="bg-neutral-800 text-neutral-100 border border-neutral-700 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64 max-w-full"
                    aria-describedby="customSpanHelp"
                  />
                </>
              )}
            </div>
            {range === 'custom' && (
              <div id="customSpanHelp" className="mt-2 text-xs text-neutral-400">
                {customWindow ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span>
                      Selected: {formatDateOnly(customWindow.from)} → {formatDateOnly(customWindow.to)} ({formatHumanDuration(Math.abs(customWindow.to - customWindow.from))})
                    </span>
                    <button
                      type="button"
                      className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
                      onClick={() => setCustomWindow(null)}
                      title="Return to typed duration"
                    >
                      Clear selection
                    </button>
                  </div>
                ) : (
                  <>
                    {customSpanSeconds != null
                      ? `Showing last ${formatHumanDuration(customSpanSeconds)}. Drag on the graph to select a window.`
                      : 'Type a duration like 90d, 7d 12h, 1y 2mo. Drag on the graph to select a window.'}
                  </>
                )}
              </div>
            )}
          </section>

          {/* Delta creator */}
          <section className="bg-neutral-900/40 border border-neutral-800 rounded-lg p-3">
            <div className="text-sm font-medium text-neutral-200 mb-2">Delta lines</div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-neutral-300" htmlFor="deltaA">A</label>
              <select
                id="deltaA"
                value={deltaA as string}
                onChange={e => setDeltaA(e.target.value as keyof ReadingsJson)}
                className="bg-neutral-800 text-neutral-100 border border-neutral-700 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SERIES.map(s => (
                  <option key={s.key as string} value={s.key as string}>{s.label}</option>
                ))}
              </select>
              <span className="text-sm text-neutral-400">−</span>
              <label className="text-sm text-neutral-300" htmlFor="deltaB">B</label>
              <select
                id="deltaB"
                value={deltaB as string}
                onChange={e => setDeltaB(e.target.value as keyof ReadingsJson)}
                className="bg-neutral-800 text-neutral-100 border border-neutral-700 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SERIES.map(s => (
                  <option key={s.key as string} value={s.key as string}>{s.label}</option>
                ))}
              </select>
              <button
                className="bg-blue-600 hover:bg-blue-700 text-white rounded px-2 py-1 text-sm"
                onClick={() => {
                  if (deltaA === deltaB) return
                  setDeltaDefs(prev => [{ a: deltaA, b: deltaB, id: Date.now() }, ...prev])
                }}
              >
                Add
              </button>
            </div>
            {deltaDefs.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {deltaDefs.map(d => (
                  <div key={d.id} className="flex items-center gap-1 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs">
                    <span>Δ ({SERIES.find(s => s.key === d.a)?.label} − {SERIES.find(s => s.key === d.b)?.label})</span>
                    <button
                      className="text-red-400 hover:text-red-300 ml-1"
                      onClick={() => setDeltaDefs(prev => prev.filter(x => x.id !== d.id))}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div
          className="w-full h-80 md:h-96 relative bg-neutral-900/30 border border-neutral-800 rounded-lg p-2"
          onPointerDown={e => {
            const chart = chartRef.current
            const canvas = chart?.canvas
            if (!chart || !canvas) return
            const rect = canvas.getBoundingClientRect()
            const x = e.clientX - rect.left
            const y = e.clientY - rect.top
            const area = chart.chartArea
            if (!area) return
            // Only start selection if inside plot area.
            if (x < area.left || x > area.right || y < area.top || y > area.bottom) return
            e.currentTarget.setPointerCapture(e.pointerId)
            setDrag({ startX: x, currentX: x })
          }}
          onPointerMove={e => {
            if (!drag) return
            const chart = chartRef.current
            const canvas = chart?.canvas
            if (!chart || !canvas) return
            const rect = canvas.getBoundingClientRect()
            const x = e.clientX - rect.left
            setDrag(prev => (prev ? { ...prev, currentX: x } : prev))
          }}
          onPointerUp={() => {
            const chart = chartRef.current
            const area = chart?.chartArea
            const scaleX: any = chart?.scales?.x
            if (!chart || !area || !scaleX || !drag) {
              setDrag(null)
              return
            }

            const a = Math.max(area.left, Math.min(area.right, drag.startX))
            const b = Math.max(area.left, Math.min(area.right, drag.currentX))
            const width = Math.abs(b - a)
            setDrag(null)
            if (width < 6) return

            const x0 = scaleX.getValueForPixel(Math.min(a, b))
            const x1 = scaleX.getValueForPixel(Math.max(a, b))
            if (!Number.isFinite(x0) || !Number.isFinite(x1)) return
            const from = Math.floor(Number(x0))
            const to = Math.floor(Number(x1))
            setCustomWindow({ from, to })
            setCustomSpan(formatHumanDuration(Math.abs(to - from)))
            setRange('custom')
          }}
          onPointerLeave={() => setDrag(null)}
        >
          <Line ref={chartRef} data={chartData} options={options} />
          {(() => {
            const chart = chartRef.current
            const area = chart?.chartArea
            if (!drag || !chart || !area) return null
            const left = Math.max(area.left, Math.min(area.right, Math.min(drag.startX, drag.currentX)))
            const right = Math.max(area.left, Math.min(area.right, Math.max(drag.startX, drag.currentX)))
            return (
              <div
                className="absolute bg-blue-500/20 border border-blue-400/60 rounded-sm pointer-events-none"
                style={{
                  left,
                  width: Math.max(0, right - left),
                  top: area.top,
                  height: Math.max(0, area.bottom - area.top)
                }}
              />
            )
          })()}
        </div>
      </div>
    </div>
  )
}
