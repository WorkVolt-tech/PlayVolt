import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { TvApp } from './TvApp.jsx';
import {TvPairPage} from './TvPairPage.jsx';
import { isTvPage } from './tvLink.js';
import './styles.css';
createRoot(document.getElementById('root')).render(<React.StrictMode>{isTvPage(window.location) ? <TvApp/> : new URLSearchParams(window.location.search).has('tv-connect') ? <TvPairPage/> : <App/>}</React.StrictMode>);
