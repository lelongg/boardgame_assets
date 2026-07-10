import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ConfirmButton from '@/components/ConfirmButton'
import { History, RotateCcw, Loader2 } from 'lucide-react'

type CheckpointMeta = { id: string; name: string; createdAt: string }

// Local date in YYYY-MM-DD, used as the default name for a new version.
const defaultVersionName = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Versions: named, restorable snapshots of a collection or a layout
 * (called "checkpoints" in the storage layer). Creating saves the current
 * state; restoring replaces the current state with the snapshot (callers
 * auto-save a "Before restore" version first).
 */
export default function CheckpointsDialog({
  open,
  onOpenChange,
  checkpoints,
  loading,
  busy,
  onCreate,
  onRestore,
  onDelete,
  description = 'Save a version of this collection’s cards and layout, and restore it later.',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  checkpoints: CheckpointMeta[]
  loading: boolean
  busy: boolean
  onCreate: (name: string) => Promise<void> | void
  onRestore: (id: string) => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
  description?: string
}) {
  const [name, setName] = useState(defaultVersionName)

  // Re-prime the default each time the dialog opens so a long-lived
  // session still suggests today's date, not the mount-time date.
  useEffect(() => {
    if (open) setName(defaultVersionName())
  }, [open])

  const submit = async () => {
    const n = name.trim()
    if (!n || busy) return
    await onCreate(n)
    setName(defaultVersionName())
  }

  const fmt = (iso: string) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="h-4 w-4" /> Versions</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form className="flex gap-2 py-1" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Version name (e.g. before rebalance)"
            className="h-9"
          />
          <Button type="submit" disabled={!name.trim() || busy}>Save</Button>
        </form>

        <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : checkpoints.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No versions yet.</p>
          ) : (
            <ul className="divide-y">
              {checkpoints.map((cp) => (
                <li key={cp.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{cp.name}</div>
                    <div className="text-xs text-muted-foreground">{fmt(cp.createdAt)}</div>
                  </div>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => onRestore(cp.id)} title="Restore this version (a safety snapshot is saved first)">
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
                  </Button>
                  <ConfirmButton iconOnly onConfirm={() => onDelete(cp.id)} disabled={busy} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
