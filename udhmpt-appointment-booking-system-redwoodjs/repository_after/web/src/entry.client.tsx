import { hydrateRoot, createRoot } from 'react-dom/client'
import App from './App'

const redwoodApp = document.getElementById('redwood-app')

if (redwoodApp) {
    if (redwoodApp.children.length > 0) {
        hydrateRoot(redwoodApp, <App />)
    } else {
        const root = createRoot(redwoodApp)
        root.render(<App />)
    }
}
