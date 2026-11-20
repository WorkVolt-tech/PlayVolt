import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { TvApp } from './TvApp.jsx';
import { isTvPage } from './tvLink.js';
import './styles.css';
createRoot(document.getElementById('root')).render(<React.StrictMode>{isTvPage(window.location) ? <TvApp/> : <App/>}</React.StrictMode>);
