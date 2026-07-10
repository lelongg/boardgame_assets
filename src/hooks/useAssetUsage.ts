import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useStorageInstance } from './useStorage'
import { useLayouts, useCollections, useFonts, useImages, queryKeys, staleTime, gcTime } from './useGameData'
import { collectUsedImageFiles, collectUsedFontSlots, findUnusedFontSlots } from '../assetUsage'

export type AssetUsage = {
  /** True while any of the underlying game data is still loading. */
  isLoading: boolean
  /** Image file names referenced by at least one layout, card or collection. */
  usedImageFiles: Set<string>
  /** Image file names present in storage but referenced nowhere. */
  unusedImageFiles: Set<string>
  /** Font slot keys that are referenced nowhere and safe to delete. */
  unusedFontSlots: Set<string>
}

/**
 * Scans the whole game (all layouts, all collections, all cards) for asset
 * references and reports which uploaded images and fonts are unused.
 * Checkpoint snapshots cannot be read through the storage interface and are
 * not scanned.
 */
export default function useAssetUsage(gameId: string | undefined): AssetUsage {
  const storage = useStorageInstance()!
  const { data: layouts = [], isLoading: layoutsLoading } = useLayouts(gameId)
  const { data: collections = [], isLoading: collectionsLoading } = useCollections(gameId)
  const { data: fonts = {}, isLoading: fontsLoading } = useFonts(gameId)
  const { data: images = [], isLoading: imagesLoading } = useImages(gameId)

  const cardQueries = useQueries({
    queries: collections.map((col: any) => ({
      queryKey: queryKeys.cards(gameId!, col.id),
      queryFn: () => storage.listCards(gameId!, col.id),
      enabled: !!storage && !!gameId,
      staleTime: staleTime(),
      gcTime: gcTime(),
    })),
  })

  const isLoading = layoutsLoading || collectionsLoading || fontsLoading || imagesLoading
    || cardQueries.some((q) => q.isLoading)

  // useQueries returns a fresh array every render; key the memo on the data
  // update timestamps so the scan only reruns when something actually changed.
  const cardsKey = cardQueries.map((q) => q.dataUpdatedAt).join(',')

  return useMemo(() => {
    const empty = {
      isLoading,
      usedImageFiles: new Set<string>(),
      unusedImageFiles: new Set<string>(),
      unusedFontSlots: new Set<string>(),
    }
    if (isLoading) return empty

    const allCards = cardQueries.flatMap((q) => (q.data as any[]) ?? [])
    const usedImageFiles = collectUsedImageFiles(layouts, collections, allCards)
    const unusedImageFiles = new Set(
      images.map((img) => img.file).filter((file) => !usedImageFiles.has(file)),
    )
    const usedFontSlots = collectUsedFontSlots(fonts, layouts, allCards)
    const unusedFontSlots = new Set(findUnusedFontSlots(fonts, usedFontSlots))
    return { isLoading, usedImageFiles, unusedImageFiles, unusedFontSlots }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, layouts, collections, fonts, images, cardsKey])
}
