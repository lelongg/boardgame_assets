import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useStorageInstance } from './useStorage'
import { getProvider } from '../storage'
import { invalidateFontCache } from './useFontStyles'

// Remote backends get 5min staleTime (mutations invalidate immediately anyway).
// Local backends get Infinity (only invalidate on mutation).
const isRemote = () => ['s3', 'googleDrive'].includes(getProvider())
export const staleTime = () => isRemote() ? 5 * 60_000 : Infinity
export const gcTime = () => isRemote() ? 10 * 60_000 : Infinity

// ── Query keys ──────────────────────────────────────────────────────
export const queryKeys = {
  games: () => ['games'] as const,
  game: (gameId: string) => ['game', gameId] as const,
  collections: (gameId: string) => ['collections', gameId] as const,
  collection: (gameId: string, collectionId: string) => ['collection', gameId, collectionId] as const,
  layouts: (gameId: string) => ['layouts', gameId] as const,
  layout: (gameId: string, layoutId: string) => ['layout', gameId, layoutId] as const,
  cards: (gameId: string, collectionId: string) => ['cards', gameId, collectionId] as const,
  fonts: (gameId: string) => ['fonts', gameId] as const,
  images: (gameId: string) => ['images', gameId] as const,
  checkpoints: (gameId: string, collectionId: string) => ['checkpoints', gameId, collectionId] as const,
  checkpoint: (gameId: string, collectionId: string, checkpointId: string) => ['checkpoint', gameId, collectionId, checkpointId] as const,
  layoutCheckpoints: (gameId: string, layoutId: string) => ['layoutCheckpoints', gameId, layoutId] as const,
}

// ── Query hooks ─────────────────────────────────────────────────────

export function useGames() {
  const storage = useStorageInstance()!
  return useQuery<any[]>({
    queryKey: queryKeys.games(),
    queryFn: () => storage.listGames(),
    enabled: !!storage,
    staleTime: staleTime(),
    gcTime: gcTime(),
    placeholderData: keepPreviousData,
  })
}

export function useGame(gameId: string | undefined) {
  const storage = useStorageInstance()!
  return useQuery<any>({
    queryKey: queryKeys.game(gameId!),
    queryFn: () => storage.getGame(gameId!),
    enabled: !!storage && !!gameId,
    staleTime: staleTime(),
    gcTime: gcTime(),
    placeholderData: keepPreviousData,
  })
}

export function useCollections(gameId: string | undefined) {
  const storage = useStorageInstance()!
  return useQuery<any[]>({
    queryKey: queryKeys.collections(gameId!),
    queryFn: () => storage.listCollections(gameId!),
    enabled: !!storage && !!gameId,
    staleTime: staleTime(),
    gcTime: gcTime(),
    placeholderData: keepPreviousData,
  })
}

export function useCollection(gameId: string | undefined, collectionId: string | undefined) {
  const storage = useStorageInstance()!
  return useQuery<any>({
    queryKey: queryKeys.collection(gameId!, collectionId!),
    queryFn: () => storage.getCollection(gameId!, collectionId!),
    enabled: !!storage && !!gameId && !!collectionId,
    staleTime: staleTime(),
    gcTime: gcTime(),
    placeholderData: keepPreviousData,
  })
}

export function useLayouts(gameId: string | undefined) {
  const storage = useStorageInstance()!
  return useQuery<any[]>({
    queryKey: queryKeys.layouts(gameId!),
    queryFn: () => storage.listLayouts(gameId!),
    enabled: !!storage && !!gameId,
    staleTime: staleTime(),
    gcTime: gcTime(),
    placeholderData: keepPreviousData,
  })
}

export function useLayout(gameId: string | undefined, layoutId: string | undefined) {
  const storage = useStorageInstance()!
  return useQuery<any>({
    queryKey: queryKeys.layout(gameId!, layoutId!),
    queryFn: () => storage.getLayout(gameId!, layoutId!),
    enabled: !!storage && !!gameId && !!layoutId,
    // Always Infinity: the cache is kept current via setQueryData on every save,
    // so auto-refetch on window-focus or mount would race with in-flight mutations
    // and could overwrite optimistic edits with stale storage data.
    staleTime: Infinity,
    gcTime: gcTime(),
    placeholderData: keepPreviousData,
  })
}

export function useCards(gameId: string | undefined, collectionId: string | undefined) {
  const storage = useStorageInstance()!
  return useQuery<any[]>({
    queryKey: queryKeys.cards(gameId!, collectionId!),
    queryFn: () => storage.listCards(gameId!, collectionId!),
    enabled: !!storage && !!gameId && !!collectionId,
    staleTime: staleTime(),
    gcTime: gcTime(),
    placeholderData: keepPreviousData,
  })
}

export function useFonts(gameId: string | undefined) {
  const storage = useStorageInstance()!
  return useQuery<Record<string, { name: string; file: string; source: 'upload' | 'google' }>>({
    queryKey: queryKeys.fonts(gameId!),
    queryFn: () => storage.listFonts(gameId!),
    enabled: !!storage && !!gameId,
    staleTime: staleTime(),
    gcTime: gcTime(),
    placeholderData: keepPreviousData,
  })
}

export function useImages(gameId: string | undefined) {
  const storage = useStorageInstance()!
  return useQuery<{ file: string; url: string; name: string }[]>({
    queryKey: queryKeys.images(gameId!),
    queryFn: () => storage.listImages?.(gameId!) ?? [],
    enabled: !!storage && !!gameId,
    staleTime: staleTime(),
    gcTime: gcTime(),
    placeholderData: keepPreviousData,
  })
}

// ── Mutation hooks ──────────────────────────────────────────────────

// Mutations update the query caches in place with what the backend returned
// instead of invalidating: on slow backends (S3) a refetch takes seconds during
// which the UI keeps showing pre-mutation data, making every action look like
// it did nothing. Invalidation stays as a fallback when a backend returns
// nothing usable.

export function useCreateGame() {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (name: string) => storage.createGame(name),
    onSuccess: (created) => {
      if (created?.id) {
        qc.setQueryData<any[]>(queryKeys.games(), (old) => old ? [...old, created] : old)
      } else {
        qc.invalidateQueries({ queryKey: queryKeys.games() })
      }
    },
  })
}

export function useUpdateGame(gameId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, Record<string, any>>({
    mutationFn: (updates: Record<string, any>) => storage.updateGame(gameId!, updates),
    onSuccess: (updated) => {
      // Update caches in place with what the backend persisted instead of
      // refetching: on slow backends (S3) the refetch takes seconds during
      // which the UI keeps showing the pre-edit value, making the change look
      // like it did nothing.
      if (updated) {
        qc.setQueryData(queryKeys.game(gameId!), updated)
        qc.setQueryData<any[]>(queryKeys.games(), (old) =>
          old ? old.map((g: any) => g.id === gameId ? { ...g, ...updated } : g) : old)
      } else {
        qc.invalidateQueries({ queryKey: queryKeys.game(gameId!) })
        qc.invalidateQueries({ queryKey: queryKeys.games() })
      }
    },
  })
}

export function useDeleteGame() {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (gameId: string) => storage.deleteGame(gameId),
    onSuccess: (_res, gameId) => {
      qc.setQueryData<any[]>(queryKeys.games(), (old) =>
        old ? old.filter((g: any) => g.id !== gameId) : old)
      qc.removeQueries({ queryKey: queryKeys.game(gameId) })
    },
  })
}

export function useCreateCollection(gameId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, { name: string; layoutId: string }>({
    mutationFn: ({ name, layoutId }) =>
      storage.createCollection(gameId!, name, layoutId),
    onSuccess: (created) => {
      if (created?.id) {
        qc.setQueryData<any[]>(queryKeys.collections(gameId!), (old) => old ? [...old, created] : old)
        qc.setQueryData(queryKeys.collection(gameId!, created.id), created)
      } else {
        qc.invalidateQueries({ queryKey: queryKeys.collections(gameId!) })
      }
    },
  })
}

export function useUpdateCollection(gameId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, { collectionId: string; updates: Record<string, any> }>({
    mutationFn: ({ collectionId, updates }) =>
      storage.updateCollection(gameId!, collectionId, updates),
    onSuccess: (updated, { collectionId }) => {
      // Immediately update the caches so dependents (e.g. the layout dropdown,
      // the collections list) react without waiting for a refetch. On slow
      // backends (S3) a refetch takes seconds and keeps showing pre-edit data,
      // making the update look like it did nothing.
      if (updated) {
        qc.setQueryData(queryKeys.collection(gameId!, collectionId), updated)
        qc.setQueryData<any[]>(queryKeys.collections(gameId!), (old) =>
          old ? old.map((c: any) => c.id === collectionId ? updated : c) : old)
      } else {
        qc.invalidateQueries({ queryKey: queryKeys.collections(gameId!) })
        qc.invalidateQueries({ queryKey: queryKeys.collection(gameId!, collectionId) })
      }
    },
  })
}

export function useDeleteCollection(gameId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (collectionId: string) => storage.deleteCollection(gameId!, collectionId),
    onSuccess: (_res, collectionId) => {
      qc.setQueryData<any[]>(queryKeys.collections(gameId!), (old) =>
        old ? old.filter((c: any) => c.id !== collectionId) : old)
      qc.removeQueries({ queryKey: queryKeys.collection(gameId!, collectionId) })
      qc.removeQueries({ queryKey: queryKeys.cards(gameId!, collectionId) })
    },
  })
}

export function useCreateLayout(gameId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (name: string) => storage.createLayout(gameId!, name),
    onSuccess: (created) => {
      if (created?.id) {
        qc.setQueryData<any[]>(queryKeys.layouts(gameId!), (old) => old ? [...old, created] : old)
        qc.setQueryData(queryKeys.layout(gameId!, created.id), created)
      } else {
        qc.invalidateQueries({ queryKey: queryKeys.layouts(gameId!) })
      }
    },
  })
}

export function useSaveLayout(gameId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, { layoutId: string; layout: any }>({
    mutationFn: ({ layoutId, layout }) =>
      storage.saveLayout(gameId!, layoutId, layout),
    onSuccess: (saved, vars) => {
      // Don't refetch — update both layout caches in place. Refetching would
      // cause a race that reverts edits (especially on slow backends like S3,
      // where the refetch takes seconds and serves pre-save data meanwhile).
      const layout = saved ?? vars.layout
      qc.setQueryData(queryKeys.layout(gameId!, vars.layoutId), layout)
      qc.setQueryData<any[]>(queryKeys.layouts(gameId!), (old) =>
        old ? old.map((l: any) => l.id === vars.layoutId ? layout : l) : old)
    },
  })
}

export function useCopyLayout(gameId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (layoutId: string) => storage.copyLayout(gameId!, layoutId),
    onSuccess: (copy) => {
      if (copy?.id) {
        qc.setQueryData<any[]>(queryKeys.layouts(gameId!), (old) => old ? [...old, copy] : old)
        qc.setQueryData(queryKeys.layout(gameId!, copy.id), copy)
      } else {
        qc.invalidateQueries({ queryKey: queryKeys.layouts(gameId!) })
      }
    },
  })
}

export function useDeleteLayout(gameId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (layoutId: string) => storage.deleteLayout(gameId!, layoutId),
    onSuccess: (_res, layoutId) => {
      qc.setQueryData<any[]>(queryKeys.layouts(gameId!), (old) =>
        old ? old.filter((l: any) => l.id !== layoutId) : old)
      qc.removeQueries({ queryKey: queryKeys.layout(gameId!, layoutId) })
    },
  })
}

export function useSaveCard(gameId: string | undefined, collectionId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, { cardId: string; card: any }>({
    mutationFn: ({ cardId, card }) =>
      storage.saveCard(gameId!, collectionId!, cardId, card),
    onSuccess: (saved) => {
      // In-place update (or append for a new card) instead of a refetch — see
      // useSaveLayout for why refetching misbehaves on slow backends.
      if (saved?.id) {
        qc.setQueryData<any[]>(queryKeys.cards(gameId!, collectionId!), (old) => {
          if (!old) return old
          return old.some((c: any) => c.id === saved.id)
            ? old.map((c: any) => c.id === saved.id ? saved : c)
            : [...old, saved]
        })
      } else {
        qc.invalidateQueries({ queryKey: queryKeys.cards(gameId!, collectionId!) })
      }
    },
  })
}

export function useCopyCard(gameId: string | undefined, collectionId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (cardId: string) => storage.copyCard(gameId!, collectionId!, cardId),
    onSuccess: (copy) => {
      if (copy?.id) {
        qc.setQueryData<any[]>(queryKeys.cards(gameId!, collectionId!), (old) => old ? [...old, copy] : old)
      } else {
        qc.invalidateQueries({ queryKey: queryKeys.cards(gameId!, collectionId!) })
      }
    },
  })
}

export function useDeleteCard(gameId: string | undefined, collectionId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (cardId: string) => storage.deleteCard(gameId!, collectionId!, cardId),
    onSuccess: (_res, cardId) => {
      qc.setQueryData<any[]>(queryKeys.cards(gameId!, collectionId!), (old) =>
        old ? old.filter((c: any) => c.id !== cardId) : old)
    },
  })
}

/**
 * Copy or move a card to another collection. Composed from saveCard/deleteCard
 * so no backend changes are needed; both collections' card caches are updated
 * in place. Copy generates a fresh id (so duplicating twice never clobbers);
 * move keeps the id and is best-effort atomic — if the source delete fails
 * after the write, the card exists in both collections (recoverable, never lost).
 */
export function useTransferCard(gameId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, { sourceCollectionId: string; targetCollectionId: string; card: any; mode: 'copy' | 'move' }>({
    mutationFn: async ({ sourceCollectionId, targetCollectionId, card, mode }) => {
      const targetId = mode === 'move' ? card.id : null
      const saved = await storage.saveCard(gameId!, targetCollectionId, targetId, { ...card, id: targetId ?? undefined })
      if (mode === 'move') await storage.deleteCard(gameId!, sourceCollectionId, card.id)
      return saved
    },
    onSuccess: (saved, { sourceCollectionId, targetCollectionId, card, mode }) => {
      if (mode === 'move') {
        qc.setQueryData<any[]>(queryKeys.cards(gameId!, sourceCollectionId), (old) =>
          old ? old.filter((c: any) => c.id !== card.id) : old)
      }
      if (saved?.id) {
        qc.setQueryData<any[]>(queryKeys.cards(gameId!, targetCollectionId), (old) => {
          if (!old) return old
          return old.some((c: any) => c.id === saved.id)
            ? old.map((c: any) => c.id === saved.id ? saved : c)
            : [...old, saved]
        })
      } else {
        qc.invalidateQueries({ queryKey: queryKeys.cards(gameId!, targetCollectionId) })
      }
    },
  })
}

// ── Checkpoints ─────────────────────────────────────────────────────

export function useCheckpoints(gameId: string | undefined, collectionId: string | undefined) {
  const storage = useStorageInstance()!
  return useQuery<{ id: string; name: string; createdAt: string }[]>({
    queryKey: queryKeys.checkpoints(gameId!, collectionId!),
    queryFn: () => storage.listCheckpoints(gameId!, collectionId!),
    enabled: !!storage && !!gameId && !!collectionId,
    staleTime: staleTime(),
    gcTime: gcTime(),
  })
}

export function useCreateCheckpoint(gameId: string | undefined, collectionId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (name: string) => storage.createCheckpoint(gameId!, collectionId!, name),
    onSuccess: (meta) => {
      if (meta?.id) {
        // Checkpoint listings are newest-first.
        qc.setQueryData<any[]>(queryKeys.checkpoints(gameId!, collectionId!), (old) =>
          old ? [meta, ...old] : old)
      } else {
        qc.invalidateQueries({ queryKey: queryKeys.checkpoints(gameId!, collectionId!) })
      }
    },
  })
}

export function useRestoreCheckpoint(gameId: string | undefined, collectionId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (checkpointId: string) => storage.restoreCheckpoint(gameId!, collectionId!, checkpointId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.cards(gameId!, collectionId!) })
      qc.invalidateQueries({ queryKey: queryKeys.collection(gameId!, collectionId!) })
      qc.invalidateQueries({ queryKey: queryKeys.checkpoints(gameId!, collectionId!) })
    },
  })
}

export function useDeleteCheckpoint(gameId: string | undefined, collectionId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (checkpointId: string) => storage.deleteCheckpoint(gameId!, collectionId!, checkpointId),
    onSuccess: (_res, checkpointId) => {
      qc.setQueryData<any[]>(queryKeys.checkpoints(gameId!, collectionId!), (old) =>
        old ? old.filter((cp: any) => cp.id !== checkpointId) : old)
    },
  })
}

// ── Layout checkpoints ──────────────────────────────────────────────

export function useLayoutCheckpoints(gameId: string | undefined, layoutId: string | undefined) {
  const storage = useStorageInstance()!
  return useQuery<{ id: string; name: string; createdAt: string }[]>({
    queryKey: queryKeys.layoutCheckpoints(gameId!, layoutId!),
    queryFn: () => storage.listLayoutCheckpoints(gameId!, layoutId!),
    enabled: !!storage && !!gameId && !!layoutId,
    staleTime: staleTime(),
    gcTime: gcTime(),
  })
}

export function useCreateLayoutCheckpoint(gameId: string | undefined, layoutId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (name: string) => storage.createLayoutCheckpoint(gameId!, layoutId!, name),
    onSuccess: (meta) => {
      if (meta?.id) {
        qc.setQueryData<any[]>(queryKeys.layoutCheckpoints(gameId!, layoutId!), (old) =>
          old ? [meta, ...old] : old)
      } else {
        qc.invalidateQueries({ queryKey: queryKeys.layoutCheckpoints(gameId!, layoutId!) })
      }
    },
  })
}

export function useRestoreLayoutCheckpoint(gameId: string | undefined, layoutId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (checkpointId: string) => storage.restoreLayoutCheckpoint(gameId!, layoutId!, checkpointId),
    onSuccess: () => {
      // The per-id layout query has staleTime: Infinity, so an explicit
      // invalidation is the only way it ever refetches.
      qc.invalidateQueries({ queryKey: queryKeys.layout(gameId!, layoutId!) })
      qc.invalidateQueries({ queryKey: queryKeys.layouts(gameId!) })
      qc.invalidateQueries({ queryKey: queryKeys.layoutCheckpoints(gameId!, layoutId!) })
    },
  })
}

export function useDeleteLayoutCheckpoint(gameId: string | undefined, layoutId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (checkpointId: string) => storage.deleteLayoutCheckpoint(gameId!, layoutId!, checkpointId),
    onSuccess: (_res, checkpointId) => {
      qc.setQueryData<any[]>(queryKeys.layoutCheckpoints(gameId!, layoutId!), (old) =>
        old ? old.filter((cp: any) => cp.id !== checkpointId) : old)
    },
  })
}

export function useAddGoogleFont(gameId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (fontName: string) => storage.addGoogleFont(gameId!, fontName),
    onSuccess: (result) => {
      invalidateFontCache(gameId!)
      if (result?.fonts) qc.setQueryData(queryKeys.fonts(gameId!), result.fonts)
      else qc.invalidateQueries({ queryKey: queryKeys.fonts(gameId!) })
    },
  })
}

export function useUploadFont(gameId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, File>({
    mutationFn: (file: File) => storage.uploadFont(gameId!, file),
    onSuccess: (result) => {
      invalidateFontCache(gameId!)
      if (result?.fonts) qc.setQueryData(queryKeys.fonts(gameId!), result.fonts)
      else qc.invalidateQueries({ queryKey: queryKeys.fonts(gameId!) })
    },
  })
}

export function useDeleteFont(gameId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (filename: string) => storage.deleteFont(gameId!, filename),
    onSuccess: (result) => {
      invalidateFontCache(gameId!)
      if (result?.fonts) qc.setQueryData(queryKeys.fonts(gameId!), result.fonts)
      else qc.invalidateQueries({ queryKey: queryKeys.fonts(gameId!) })
    },
  })
}

export function useRenameFont(gameId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, { slot: string; newName: string }>({
    mutationFn: ({ slot, newName }) => storage.renameFont(gameId!, slot, newName),
    onSuccess: (result) => {
      // Backends return the updated manifest — use it directly instead of
      // refetching (slow backends serve pre-save data for a while).
      if (result?.fonts) qc.setQueryData(queryKeys.fonts(gameId!), result.fonts)
      else qc.invalidateQueries({ queryKey: queryKeys.fonts(gameId!) })
    },
  })
}

export function useUploadImage(gameId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<string, Error, File>({
    mutationFn: (file: File) => storage.uploadImage(gameId!, file),
    onSuccess: (url, file) => {
      // uploadImage only returns the URL — derive the listing entry like the
      // backends do (hash filename from the URL, display name from the
      // original filename). Re-uploads of identical content keep their entry.
      const fileName = url?.split('/').pop()
      if (url && fileName) {
        const dot = file.name.lastIndexOf('.')
        const displayName = (dot > 0 ? file.name.slice(0, dot) : file.name) || fileName
        qc.setQueryData<any[]>(queryKeys.images(gameId!), (old) => {
          if (!old) return old
          if (old.some((img: any) => img.file === fileName)) return old
          return [...old, { file: fileName, url, name: displayName }]
        })
      } else {
        qc.invalidateQueries({ queryKey: queryKeys.images(gameId!) })
      }
    },
  })
}

export function useRenameImage(gameId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, { file: string; newName: string }>({
    mutationFn: ({ file, newName }) => storage.renameImage(gameId!, file, newName),
    onSuccess: (_res, { file, newName }) => {
      // Only the display name changes — update it in place rather than
      // refetching the whole listing (slow on S3, and prone to serving the
      // pre-rename sidecar for a while).
      qc.setQueryData<any[]>(queryKeys.images(gameId!), (old) =>
        old ? old.map((img: any) => img.file === file ? { ...img, name: newName } : img) : old)
    },
  })
}

export function useDeleteImage(gameId: string | undefined) {
  const storage = useStorageInstance()!
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (filename: string) => storage.deleteImage(gameId!, filename),
    onSuccess: (_res, filename) => {
      qc.setQueryData<any[]>(queryKeys.images(gameId!), (old) =>
        old ? old.filter((img: any) => img.file !== filename) : old)
    },
  })
}

// ── Utility: invalidate all data for a game ─────────────────────────

export function useInvalidateGame(gameId: string | undefined) {
  const qc = useQueryClient()
  return () => {
    if (!gameId) return
    qc.invalidateQueries({ queryKey: queryKeys.game(gameId) })
    qc.invalidateQueries({ queryKey: queryKeys.collections(gameId) })
    qc.invalidateQueries({ queryKey: queryKeys.layouts(gameId) })
    qc.invalidateQueries({ queryKey: queryKeys.fonts(gameId) })
    qc.invalidateQueries({ queryKey: queryKeys.images(gameId) })
    // Prefix-match the per-id queries; these include the layout query, which
    // has staleTime: Infinity and is otherwise never refetched.
    qc.invalidateQueries({ queryKey: ['collection', gameId] })
    qc.invalidateQueries({ queryKey: ['layout', gameId] })
    qc.invalidateQueries({ queryKey: ['cards', gameId] })
  }
}
