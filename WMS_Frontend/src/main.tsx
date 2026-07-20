import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App'
import { setDocumentDirection } from './i18n/helpers'
import i18n from './i18n'

setDocumentDirection(i18n.language);
i18n.on('languageChanged', (lng: string) => setDocumentDirection(lng));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
