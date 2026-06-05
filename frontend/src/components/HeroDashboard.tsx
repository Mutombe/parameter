import { useEffect, useRef, useState } from 'react'
import {
  motion,
  AnimatePresence,
  animate,
  useMotionValue,
  useSpring,
} from 'framer-motion'
import {
  ComposedChart, Area, Line, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip,
} from 'recharts'
import { AiOutlineDollar } from 'react-icons/ai'
import { PieChart as PieIcon, Receipt, TrendingUp, TrendingDown } from 'lucide-react'

/* ------------------------------------------------------------------
   HeroDashboard — an interactive, "live" mini-analytics panel for the
   landing hero. Built on recharts + framer-motion with the VANTA ion
   accent. Click a metric to drive the chart; toggle MTD/YTD; it also
   auto-cycles until you interact, and tilts toward the cursor.
   ------------------------------------------------------------------ */

type Period = 'MTD' | 'YTD'
type MetricKey = 'revenue' | 'occupancy' | 'collections'

interface Slice {
  value: number
  delta: number
  gauge: number
  points: number[]
}
interface Metric {
  label: string
  icon: typeof AiOutlineDollar
  fmt: (n: number) => string
  MTD: Slice
  YTD: Slice
}

const METRICS: Record<MetricKey, Metric> = {
  revenue: {
    label: 'Revenue',
    icon: AiOutlineDollar,
    fmt: (n) => '$' + Math.round(n).toLocaleString(),
    MTD: { value: 48250, delta: 12.4, gauge: 80, points: [20, 36, 26, 46, 32, 52, 38, 58, 30, 64, 48, 74] },
    YTD: { value: 512400, delta: 23.1, gauge: 88, points: [120, 210, 160, 270, 220, 330, 280, 400, 300, 460, 410, 512] },
  },
  occupancy: {
    label: 'Occupancy',
    icon: PieIcon,
    fmt: (n) => Math.round(n) + '%',
    MTD: { value: 94, delta: 2.1, gauge: 94, points: [85, 93, 87, 96, 89, 97, 90, 98, 88, 95, 91, 99] },
    YTD: { value: 91, delta: 4.5, gauge: 91, points: [79, 89, 83, 91, 85, 93, 86, 92, 84, 94, 89, 91] },
  },
  collections: {
    label: 'Collections',
    icon: Receipt,
    fmt: (n) => Math.round(n) + '%',
    MTD: { value: 75, delta: -3.2, gauge: 75, points: [60, 82, 66, 86, 70, 90, 68, 92, 64, 88, 74, 94] },
    YTD: { value: 82, delta: 5.8, gauge: 82, points: [58, 76, 64, 82, 68, 86, 74, 90, 70, 88, 80, 83] },
  },
}

const ORDER: MetricKey[] = ['revenue', 'occupancy', 'collections']

/* Count-up that re-animates from the previous to the new value. */
function Counter({ value, format }: { value: number; format: (n: number) => string }) {
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)
  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    })
    prev.current = value
    return () => controls.stop()
  }, [value])
  return <>{format(display)}</>
}

/* Animated circular gauge (SVG). */
function Gauge({ pct }: { pct: number }) {
  const r = 30
  const c = 2 * Math.PI * r
  return (
    <div className="relative h-[78px] w-[78px] shrink-0">
      <svg width="78" height="78" viewBox="0 0 78 78">
        <circle cx="39" cy="39" r={r} fill="none" stroke="#eef0f4" strokeWidth="7" />
        <motion.circle
          cx="39" cy="39" r={r} fill="none" stroke="url(#gaugeGrad)" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c - (Math.min(pct, 100) / 100) * c }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          transform="rotate(-90 39 39)"
        />
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5ee7ff" />
            <stop offset="100%" stopColor="#2b8fff" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-gray-900 tabular-nums">
          <Counter value={pct} format={(n) => Math.round(n) + '%'} />
        </span>
      </div>
    </div>
  )
}

function ChartTip({ active, payload, fmt }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-ion/30 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-gray-900 shadow-lg backdrop-blur">
      {fmt(payload[0].value)}
    </div>
  )
}

export default function HeroDashboard() {
  const [metric, setMetric] = useState<MetricKey>('revenue')
  const [period, setPeriod] = useState<Period>('MTD')
  const [locked, setLocked] = useState(false) // user took control → stop auto-cycle
  const [hovering, setHovering] = useState(false)

  // Auto-cycle metrics until the user interacts (and not while hovering).
  useEffect(() => {
    if (locked || hovering) return
    const id = setInterval(() => {
      setMetric((m) => ORDER[(ORDER.indexOf(m) + 1) % ORDER.length])
    }, 3200)
    return () => clearInterval(id)
  }, [locked, hovering])

  // 3D cursor tilt.
  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const srx = useSpring(rx, { stiffness: 150, damping: 18 })
  const sry = useSpring(ry, { stiffness: 150, damping: 18 })
  const cardRef = useRef<HTMLDivElement>(null)
  function onMove(e: React.MouseEvent) {
    const el = cardRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    rx.set(-py * 5)
    ry.set(px * 6)
  }
  function onLeave() {
    rx.set(0); ry.set(0); setHovering(false)
  }

  const pick = (m: MetricKey) => { setMetric(m); setLocked(true) }

  const m = METRICS[metric]
  const slice = m[period]
  const data = slice.points.map((v, i) => ({ i, v }))
  const up = slice.delta >= 0
  const avg = Math.round(data.reduce((a, d) => a + d.v, 0) / data.length)

  // Pulsing "live" marker drawn only on the final data point.
  const renderDot = (p: any) => {
    if (p.index !== data.length - 1) return <g key={`d${p.index}`} />
    return (
      <g key="live-dot">
        <circle cx={p.cx} cy={p.cy} r={6} fill="#5ee7ff" opacity={0.3}>
          <animate attributeName="r" values="5;13;5" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.45;0;0.45" dur="1.8s" repeatCount="indefinite" />
        </circle>
        <circle cx={p.cx} cy={p.cy} r={4} fill="#2b8fff" stroke="#fff" strokeWidth={2} />
      </g>
    )
  }

  return (
    <div style={{ perspective: 1000 }}>
      <motion.div
        ref={cardRef}
        onMouseMove={onMove}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={onLeave}
        style={{ rotateX: srx, rotateY: sry, transformStyle: 'preserve-3d' }}
        className="relative rounded-2xl border border-gray-100 bg-white p-5 shadow-xl ring-1 ring-ion/15"
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">Dashboard Overview</h3>
            <span className="relative flex h-2 w-2" title="Live">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ion opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-ion-deep" />
            </span>
          </div>
          {/* Period toggle */}
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            {(['MTD', 'YTD'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setLocked(true) }}
                className={`relative rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  period === p ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {period === p && (
                  <motion.span
                    layoutId="periodPill"
                    className="absolute inset-0 rounded-md bg-white shadow-sm ring-1 ring-ion/30"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative">{p}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Headline + gauge */}
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="eyebrow-mono text-ion-deep">{m.label}</span>
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                  up ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                }`}
              >
                {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {up ? '+' : ''}{slice.delta}%
              </span>
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={metric + period}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="mt-0.5 text-3xl font-bold tracking-tight text-gray-900 tabular-nums"
              >
                <Counter value={slice.value} format={m.fmt} />
              </motion.div>
            </AnimatePresence>
            <p className="mt-0.5 text-xs text-gray-400">vs previous {period === 'MTD' ? 'month' : 'year'}</p>
          </div>
          <Gauge pct={slice.gauge} />
        </div>

        {/* Trend chart — glowing natural curve, gridlines, avg line, live dot */}
        <div className="-mx-1 h-[150px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 14, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="heroArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5ee7ff" stopOpacity={0.55} />
                  <stop offset="55%" stopColor="#2b8fff" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="#2b8fff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="heroStroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#5ee7ff" />
                  <stop offset="100%" stopColor="#2b8fff" />
                </linearGradient>
                <filter id="heroGlow" x="-25%" y="-50%" width="150%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.18)" strokeDasharray="3 4" />
              <ReferenceLine y={avg} stroke="rgba(100,116,139,0.55)" strokeDasharray="5 5" />
              <Tooltip content={<ChartTip fmt={m.fmt} />} cursor={{ stroke: '#5ee7ff', strokeWidth: 1, strokeDasharray: '3 3' }} />
              <Area
                type="natural"
                dataKey="v"
                stroke="none"
                fill="url(#heroArea)"
                animationDuration={900}
                animationEasing="ease-out"
              />
              <Line
                type="natural"
                dataKey="v"
                stroke="url(#heroStroke)"
                strokeWidth={3}
                style={{ filter: 'url(#heroGlow)' }}
                dot={renderDot}
                activeDot={{ r: 5, fill: '#2b8fff', stroke: '#fff', strokeWidth: 2 }}
                animationDuration={900}
                animationEasing="ease-out"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Metric switcher tiles */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {ORDER.map((key) => {
            const mm = METRICS[key]
            const Icon = mm.icon
            const activeTile = key === metric
            return (
              <button
                key={key}
                onClick={() => pick(key)}
                className={`group/tile rounded-xl border p-2.5 text-left transition-all ${
                  activeTile
                    ? 'border-ion/50 bg-ion/5 shadow-[0_0_22px_-10px_#5ee7ff]'
                    : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                }`}
              >
                <Icon className={`mb-1 h-4 w-4 ${activeTile ? 'text-ion-deep' : 'text-gray-400'}`} />
                <div className="text-sm font-bold tabular-nums text-gray-900">{mm.fmt(mm[period].value)}</div>
                <div className="text-[11px] text-gray-400">{mm.label}</div>
              </button>
            )
          })}
        </div>
      </motion.div>
    </div>
  )
}
