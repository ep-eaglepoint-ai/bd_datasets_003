import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/src/sw/service-worker.js')
      .then(reg => {
        console.log('SW Registered with scope:', reg.scope);
      })
      .catch(err => {
        console.error('SW Registration failed:', err);
      });
  });
}