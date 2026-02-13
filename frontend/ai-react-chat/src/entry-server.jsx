import { StrictMode } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import App from './App'

export function render(url, options) {
  return renderToPipeableStream(
    <StrictMode>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
      <vite-streaming-end></vite-streaming-end>
    </StrictMode>,
    options
  )
}