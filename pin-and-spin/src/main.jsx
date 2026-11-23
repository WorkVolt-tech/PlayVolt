import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { TvApp } from './tv/TvApp.jsx';
import { isTvLink } from './tv/tvLink.js';
import { VersionAlert } from './components/VersionAlert.jsx';
import { isInstalled } from './pwa.js';
import { QrJoinScreen } from './screens/QrJoinScreen.jsx';
import '../styles.css';
import './polish.css';

// TV display stays separate; TV QR codes show the install/join handoff only
// when opened in a browser. Installed phone apps open the normal Join screen.
const tv = isTvLink();
const scanned = !tv && !isInstalled() && new URLSearchParams(location.search).get('install') === '1';
createRoot(document.getElementById('root')).render(
  <React.StrictMode>{tv ? <><TvApp /><VersionAlert autoUpdate /></> : scanned ? <><QrJoinScreen /><VersionAlert /></> : <App />}</React.StrictMode>
);
