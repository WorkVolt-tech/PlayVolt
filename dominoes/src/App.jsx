import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DragProvider } from './components/DragDrop'
import Lobby from './pages/Lobby'
import Tracker from './pages/Tracker'
import Game from './pages/Game'
import './styles/global.css'

export default function App() {
  return (
    <BrowserRouter>
      <DragProvider>
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/game" element={<Game />} />
        <Route path="/tracker" element={<Tracker />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      </DragProvider>
    </BrowserRouter>
  )
}
