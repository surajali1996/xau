import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safely register PWA service worker without blocking UI render
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch((err) => {
      console.warn('PWA service worker registration skipped:', err);
    });
}

createRoot(document.getElementById('root')!).render(<App />);

