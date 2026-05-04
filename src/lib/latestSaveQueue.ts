export type LatestSaveResult = 'saved' | 'superseded'

type PendingSave<T> = {
  value: T
  resolve: (result: LatestSaveResult) => void
  reject: (error: unknown) => void
}

export function createLatestSaveQueue<T>(save: (value: T) => Promise<unknown>) {
  let running = false
  let pending: PendingSave<T> | null = null

  const drain = async (initial: PendingSave<T>) => {
    running = true
    let current: PendingSave<T> | null = initial
    while (current) {
      try {
        await save(current.value)
        current.resolve('saved')
      } catch (error) {
        current.reject(error)
      }
      current = pending
      pending = null
    }
    running = false
  }

  const enqueue = (value: T) => new Promise<LatestSaveResult>((resolve, reject) => {
    const entry = { value, resolve, reject }
    if (!running) {
      void drain(entry)
      return
    }
    pending?.resolve('superseded')
    pending = entry
  })

  return { enqueue }
}
