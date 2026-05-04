import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useStorageInstance } from './useStorage'
import { getProvider } from '../storage'
import { invalidateFontCache } from './useFontStyles'

// Remote backends get 5min staleTime (mutations invalidate immediately anyway).
// Local backends get Infinity (only invalidate on mutation).
const isRemote = () => ['s3', 'googleDrive'].includes(getProvider())
const staleTime = () => isRemote() ? 5 * 60_000 : Infinity
const gcTime = () => isRemote() ? 10 * 60_000 : Infinity

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
}

// ── Query hooks ─────────────────────────────────────────────────────

export function useGames() {
  const storage = useStorageInstance()
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
  const storage = useStorageInstance()
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
  const storage = useStorageInstance()
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
  const storage = useStorageInstance()
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
  const storage = useStorageInstance()
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
  const storage = useStorageInstance()
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
  const storage = useStorageInstance()
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
  const storage = useStorageInstance()
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
  const storage = useStorageInstance()
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

export function useCreateGame() {
  const storage = useStorageInstance()
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (name: string) => storage.createGame(name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.games() }) },
  })
}

export function useUpdateGame(gameId: string | undefined) {
  const storage = useStorageInstance()
  const qc = useQueryClient()
  return useMutation<any, Error, Record<string, any>>({
    mutationFn: (updates: Record<string, any>) => storage.updateGame(gameId!, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.game(gameId!) })
      qc.invalidateQueries({ queryKey: queryKeys.games() })
    },
  })
}

export function useDeleteGame() {
  const storage = useStorageInstance()
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (gameId: string) => storage.deleteGame(gameId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.games() }) },
  })
}

export function useCreateCollection(gameId: string | undefined) {
  const storage = useStorageInstance()
  const qc = useQueryClient()
  return useMutation<any, Error, { name: string; layoutId: string }>({
    mutationFn: ({ name, layoutId }) =>
      storage.createCollection(gameId!, name, layoutId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.collections(gameId!) }) },
  })
}

export function useUpdateCollection(gameId: string | undefined) {
  const storage = useStorageInstance()
  const qc = useQueryClient()
  return useMutation<any, Error, { collectionId: string; updates: Record<string, any> }>({
    mutationFn: ({ collectionId, updates }) =>
      storage.updateCollection(gameId!, collectionId, updates),
    onSuccess: (_data, { collectionId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.collections(gameId!) })
      qc.invalidateQueries({ queryKey: queryKeys.collection(gameId!, collectionId) })
    },
  })
}

export function useDeleteCollection(gameId: string | undefined) {
  const storage = useStorageInstance()
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (collectionId: string) => storage.deleteCollection(gameId!, collectionId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.collections(gameId!) }) },
  })
}

export function useCreateLayout(gameId: string | undefined) {
  const storage = useStorageInstance()
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (name: string) => storage.createLayout(gameId!, name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.layouts(gameId!) }) },
  })
}

export function useSaveLayout(gameId: string | undefined) {
  const storage = useStorageInstance()
  const qc = useQueryClient()
  return useMutation<any, Error, { layoutId: string; layout: any }>({
    mutationFn: ({ layoutId, layout }) =>
      storage.saveLayout(gameId!, layoutId, layout),
    onSuccess: (_data, vars) => {
      // Don't invalidate the individual layout query — the optimistic update
      // in handleLayoutSave already set the correct value. Refetching would
      // cause a race that reverts edits (especially on slow backends like S3).
      void vars
      qc.invalidateQueries({ queryKey: queryKeys.layouts(gameId!) })
    },
  })
}

export function useCopyLayout(gameId: string | undefined) {
  const storage = useStorageInstance()
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (layoutId: string) => storage.copyLayout(gameId!, layoutId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.layouts(gameId!) }) },
  })
}

export function useDeleteLayout(gameId: string | undefined) {
  const storage = useStorageInstance()
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (layoutId: string) => storage.deleteLayout(gameId!, layoutId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.layouts(gameId!) }) },
  })
}

export function useSaveCard(gameId: string | undefined, collectionId: string | undefined) {
  const storage = useStorageInstance()
  const qc = useQueryClient()
  return useMutation<any, Error, { cardId: string; card: any }>({
    mutationFn: ({ cardId, card }) =>
      storage.saveCard(gameId!, collectionId!, cardId, card),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.cards(gameId!, collectionId!) }) },
  })
}

export function useCopyCard(gameId: string | undefined, collectionId: string | undefined) {
  const storage = useStorageInstance()
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (cardId: string) => storage.copyCard(gameId!, collectionId!, cardId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.cards(gameId!, collectionId!) }) },
  })
}

export function useDeleteCard(gameId: string | undefined, collectionId: string | undefined) {
  const storage = useStorageInstance()
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (cardId: string) => storage.deleteCard(gameId!, collectionId!, cardId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.cards(gameId!, collectionId!) }) },
  })
}

export function useAddGoogleFont(gameId: string | undefined) {
  const storage = useStorageInstance()
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (fontName: string) => storage.addGoogleFont(gameId!, fontName),
    onSuccess: () => { invalidateFontCache(gameId!); qc.invalidateQueries({ queryKey: queryKeys.fonts(gameId!) }) },
  })
}

export function useUploadFont(gameId: string | undefined) {
  const storage = useStorageInstance()
  const qc = useQueryClient()
  return useMutation<any, Error, File>({
    mutationFn: (file: File) => storage.uploadFont(gameId!, file),
    onSuccess: () => { invalidateFontCache(gameId!); qc.invalidateQueries({ queryKey: queryKeys.fonts(gameId!) }) },
  })
}

export function useDeleteFont(gameId: string | undefined) {
  const storage = useStorageInstance()
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (filename: string) => storage.deleteFont(gameId!, filename),
    onSuccess: () => { invalidateFontCache(gameId!); qc.invalidateQueries({ queryKey: queryKeys.fonts(gameId!) }) },
  })
}

export function useUploadImage(gameId: string | undefined) {
  const storage = useStorageInstance()
  const qc = useQueryClient()
  return useMutation<string, Error, File>({
    mutationFn: (file: File) => storage.uploadImage(gameId!, file),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.images(gameId!) }) },
  })
}

export function useDeleteImage(gameId: string | undefined) {
  const storage = useStorageInstance()
  const qc = useQueryClient()
  return useMutation<any, Error, string>({
    mutationFn: (filename: string) => storage.deleteImage(gameId!, filename),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.images(gameId!) }) },
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
  }
}
