import '@fontsource/manrope/600.css'
import '@fontsource/manrope/700.css'
import '@fontsource/manrope/800.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import './tokens.css'
import './scrollbar.css'
import './app.css'
import './i18n'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MainView } from './MainView'
import { MissedView, NotifyView } from './overlays'

const view = new URLSearchParams(location.search).get('view')
const App = view === 'notify' ? NotifyView : view === 'missed' ? MissedView : MainView

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
