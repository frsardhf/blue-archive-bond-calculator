import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

createApp(App).mount('#app')

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        console.log('[SW] Service Worker registered with scope:', registration.scope);
      })
      .catch((error) => {
        console.error('[SW] Service Worker registration failed:', error);
      });
  });
}
