import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Copy, ArrowRight } from 'lucide-react'

type Collection = { id: string; name: string }

/**
 * Pick a destination collection and copy or move a card into it.
 * `targets` should already exclude the card's current collection.
 */
export default function TransferCardDialog({
  open,
  onOpenChange,
  cardName,
  targets,
  onTransfer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  cardName: string
  targets: Collection[]
  onTransfer: (targetCollectionId: string, mode: 'copy' | 'move') => Promise<void> | void
}) {
  const [target, setTarget] = useState<string>('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) { setTarget(targets[0]?.id ?? ''); setBusy(false) }
  }, [open, targets])

  const run = async (mode: 'copy' | 'move') => {
    if (!target || busy) return
    setBusy(true)
    try { await onTransfer(target, mode); onOpenChange(false) }
    finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move or copy card</DialogTitle>
          <DialogDescription>
            Send “{cardName}” to another collection.
          </DialogDescription>
        </DialogHeader>
        {targets.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No other collection to send this card to. Create another collection first.</p>
        ) : (
          <div className="py-2">
            <label className="text-xs text-muted-foreground">Destination collection</label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue placeholder="Choose a collection" />
              </SelectTrigger>
              <SelectContent>
                {targets.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="outline" onClick={() => run('copy')} disabled={!target || busy}>
            <Copy className="mr-1.5 h-4 w-4" /> Copy
          </Button>
          <Button onClick={() => run('move')} disabled={!target || busy}>
            <ArrowRight className="mr-1.5 h-4 w-4" /> Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
