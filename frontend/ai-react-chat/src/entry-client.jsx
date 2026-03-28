import './index.css'
import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element #root was not found')
}

const app = (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)

const hasServerRenderedMarkup = rootElement.children.length > 0

if (hasServerRenderedMarkup) {
  hydrateRoot(rootElement, app)
} else {
  createRoot(rootElement).render(app)
}
