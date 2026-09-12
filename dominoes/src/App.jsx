import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DragProvider } from './components/DragDrop'
import Lobby from './pages/Lobby'
import Tracker from './pages/Tracker'
import WaTabLa from './pages/WaTabLa'
import Auth from './pages/Auth'
import Profile from './pages/Profile'
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
        <Route path="/wa-tab-la" element={<WaTabLa />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      </DragProvider>
    </BrowserRouter>
  )
}
