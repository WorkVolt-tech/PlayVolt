import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { TvApp } from './tv/TvApp.jsx';
import { isTvLink } from './tv/tvLink.js';
import { VersionAlert } from './components/VersionAlert.jsx';
import '../styles.css';
import './polish.css';

// "?tv=ROOM#token" opens the shared big-screen display; anything else is the phone game.
const tv = isTvLink();
createRoot(document.getElementById('root')).render(
  <React.StrictMode>{tv ? <><TvApp /><VersionAlert autoUpdate /></> : <App />}</React.StrictMode>
);
