import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DragProvider } from './components/DragDrop'
import Lobby from './pages/Lobby'
import Game from './pages/Game'
import './styles/global.css'

export default function App() {
  return (
    <BrowserRouter>
      <DragProvider>
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/game" element={<Game />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      </DragProvider>
    </BrowserRouter>
  )
}
