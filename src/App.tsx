import { Routes, Route } from 'react-router-dom'
import GamesPage from './pages/GamesPage'
import CollectionsPage from './pages/CollectionsPage'
import GameEditorPage from './pages/GameEditorPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<GamesPage />} />
      <Route path="/game/:gameId" element={<CollectionsPage />} />
      <Route path="/game/:gameId/collection/:collectionId" element={<GameEditorPage />} />
    </Routes>
  )
}

export default App
