import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import { Agentation } from 'agentation'

const rootEl = document.getElementById('agentation-root')
if (rootEl && import.meta.env.DEV) {
  createRoot(rootEl).render(
    <StrictMode>
      <Agentation />
    </StrictMode>
  )
}
