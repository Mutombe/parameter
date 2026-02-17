import { Modal } from './ui/Modal'
import { Keyboard } from 'lucide-react'
import { modKey } from '../hooks/useHotkeys'

interface KeyboardShortcutsModalProps {
  open: boolean
  onClose: () => void
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 bg-gray-100 border border-gray-200 rounded text-xs font-medium text-gray-600">
      {children}
    </kbd>
  )
}

function ShortcutRow({ label, keys }: { label: string; keys: React.ReactNode[] }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="flex items-center gap-1">
        {keys.map((k, i) => (
          <span key={i}>{k}</span>
        ))}
      </div>
    </div>
  )
}

const generalShortcuts = [
  { label: 'Command palette', keys: [<Kbd key="mod">{modKey}</Kbd>, <Kbd key="k">K</Kbd>] },
  { label: 'This help', keys: [<Kbd key="?">?</Kbd>] },
  { label: 'Settings', keys: [<Kbd key="mod">{modKey}</Kbd>, <Kbd key=",">,</Kbd>] },
  { label: 'Toggle sidebar', keys: [<Kbd key="mod">{modKey}</Kbd>, <Kbd key="\\">\\</Kbd>] },
]

const navigationShortcuts = [
  { label: 'Dashboard', keys: [<Kbd key="g">G</Kbd>, <Kbd key="d">D</Kbd>] },
  { label: 'Invoices', keys: [<Kbd key="g">G</Kbd>, <Kbd key="i">I</Kbd>] },
  { label: 'Receipts', keys: [<Kbd key="g">G</Kbd>, <Kbd key="r">R</Kbd>] },
  { label: 'Expenses', keys: [<Kbd key="g">G</Kbd>, <Kbd key="e">E</Kbd>] },
  { label: 'Tenants', keys: [<Kbd key="g">G</Kbd>, <Kbd key="t">T</Kbd>] },
  { label: 'Properties', keys: [<Kbd key="g">G</Kbd>, <Kbd key="p">P</Kbd>] },
  { label: 'Landlords', keys: [<Kbd key="g">G</Kbd>, <Kbd key="l">L</Kbd>] },
  { label: 'Units', keys: [<Kbd key="g">G</Kbd>, <Kbd key="u">U</Kbd>] },
  { label: 'Leases', keys: [<Kbd key="g">G</Kbd>, <Kbd key="a">A</Kbd>] },
  { label: 'Settings', keys: [<Kbd key="g">G</Kbd>, <Kbd key="s">S</Kbd>] },
  { label: 'Notifications', keys: [<Kbd key="g">G</Kbd>, <Kbd key="n">N</Kbd>] },
  { label: 'Team', keys: [<Kbd key="g">G</Kbd>, <Kbd key="m">M</Kbd>] },
]

const pageShortcuts = [
  { label: 'Create new', keys: [<Kbd key="c">C</Kbd>] },
  { label: 'Focus search', keys: [<Kbd key="/">/</Kbd>] },
]

export default function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keyboard Shortcuts"
      icon={Keyboard}
      size="lg"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 -mt-2">
        {/* General */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">General</h3>
          <div className="divide-y divide-gray-100">
            {generalShortcuts.map((s) => (
              <ShortcutRow key={s.label} label={s.label} keys={s.keys} />
            ))}
          </div>
        </div>

        {/* Page Actions */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Page Actions</h3>
          <div className="divide-y divide-gray-100">
            {pageShortcuts.map((s) => (
              <ShortcutRow key={s.label} label={s.label} keys={s.keys} />
            ))}
          </div>
        </div>

        {/* Navigation - spans full width */}
        <div className="md:col-span-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Go-To Navigation</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-8">
            {[0, 1, 2].map((col) => (
              <div key={col} className="divide-y divide-gray-100">
                {navigationShortcuts.slice(col * 4, col * 4 + 4).map((s) => (
                  <ShortcutRow key={s.label} label={s.label} keys={s.keys} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
