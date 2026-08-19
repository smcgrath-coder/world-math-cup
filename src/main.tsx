import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installBrowserMusic } from './audio/music'
import { installBrowserSfx } from './audio/sfx'

// Installed here rather than on first use, so a test render never reaches for a
// media stack jsdom does not have. Screens see nothing installed and stay quiet.
installBrowserMusic()
installBrowserSfx()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
