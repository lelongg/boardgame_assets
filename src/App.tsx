import { Routes, Route, useParams } from 'react-router-dom'
import GamesPage from './pages/GamesPage'
import CollectionsPage from './pages/CollectionsPage'
import GameEditorPage from './pages/GameEditorPage'
import PrintPage from './pages/PrintPage'

/** Remount the editor when the route params change. React Router reuses the
 *  mounted component on in-place param changes (e.g. browser back/forward
 *  between two collections), which would keep collection A's card state alive
 *  under collection B's URL — and auto-save would then write A's cards into B.
 *  Keying by params makes component identity match collection identity, and
 *  the unmount flush persists pending edits against the old collection. */
function KeyedGameEditorPage() {
  const { gameId, collectionId } = useParams()
  return <GameEditorPage key={`${gameId}:${collectionId}`} />
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<GamesPage />} />
      <Route path="/game/:gameId" element={<CollectionsPage />} />
      <Route path="/game/:gameId/collection/:collectionId" element={<KeyedGameEditorPage />} />
      <Route path="/game/:gameId/print" element={<PrintPage />} />
      <Route path="/game/:gameId/collection/:collectionId/print" element={<PrintPage />} />
    </Routes>
  )
}

export default App
