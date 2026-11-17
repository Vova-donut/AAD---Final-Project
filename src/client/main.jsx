import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import './styles.css';
// Register only in the built app so a development cache cannot hide code changes.
if ('serviceWorker' in navigator && import.meta.env.PROD)
  window.addEventListener('load', () =>
    navigator.serviceWorker
      .register('/sw.js')
      .catch(() =>
        console.warn('Service worker registration failed. Check HTTPS trust and browser support.'),
      ),
  );
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
