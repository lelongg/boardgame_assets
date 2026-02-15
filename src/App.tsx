import { Routes, Route } from 'react-router-dom'
import GamesPage from './pages/GamesPage'
import GameEditorPage from './pages/GameEditorPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<GamesPage />} />
      <Route path="/game/:gameId" element={<GameEditorPage />} />
    </Routes>
  )
}

export default App
