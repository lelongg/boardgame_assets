import { Routes, Route } from 'react-router-dom'
import GamesPage from './pages/GamesPage'
import CollectionsPage from './pages/CollectionsPage'
import GameEditorPage from './pages/GameEditorPage'
import PrintPage from './pages/PrintPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<GamesPage />} />
      <Route path="/game/:gameId" element={<CollectionsPage />} />
      <Route path="/game/:gameId/collection/:collectionId" element={<GameEditorPage />} />
      <Route path="/game/:gameId/print" element={<PrintPage />} />
      <Route path="/game/:gameId/collection/:collectionId/print" element={<PrintPage />} />
    </Routes>
  )
}

export default App
