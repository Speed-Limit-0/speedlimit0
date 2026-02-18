const arrowIconUrl = new URL(
  './figma-assets/6a77dd82a8f1f394ef591ad599732e1c023fc97c.svg',
  import.meta.url
).href

const viewStorageKey = 'speedlimit0:view'
const positionStorageKey = 'speedlimit0:positions'
const panStorageKey = 'speedlimit0:pan'
const zoomStorageKey = 'speedlimit0:zoom'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 3
const ZOOM_STEP = 0.06

const listContainer = document.getElementById('explorations-list')
const canvasContainer = document.getElementById('explorations-canvas')
const canvasStage = document.getElementById('canvas-stage')
const viewToggle = document.getElementById('view-toggle')
const viewToggleTrack = document.getElementById('view-toggle-track')
const viewToggleThumb = document.getElementById('view-toggle-thumb')
const viewOptionList = document.querySelector('[data-view-option="list"]')
const viewOptionCanvas = document.querySelector('[data-view-option="canvas"]')

const modal = document.getElementById('action-modal')
const modalContent = document.getElementById('modal-content')
const modalTitle = document.getElementById('modal-title')
const modalInput = document.getElementById('modal-input')
const modalAuthorInput = document.getElementById('modal-author-input')
const modalCancel = document.getElementById('modal-cancel')
const modalSubmit = document.getElementById('modal-submit')
const newExplorationButton = document.getElementById('new-exploration-btn')

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  year: 'numeric',
})

const state = {
  viewMode: localStorage.getItem(viewStorageKey) || 'list',
  positions: {},
  pan: { x: 0, y: 0 },
  zoom: 1,
  selectedCardId: null,
}

const parsePositions = () => {
  const stored = localStorage.getItem(positionStorageKey)
  if (!stored) return {}
  try {
    const parsed = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch (error) {
    return {}
  }
}

const savePositions = () => {
  localStorage.setItem(positionStorageKey, JSON.stringify(state.positions))
}

const parsePan = () => {
  const stored = localStorage.getItem(panStorageKey)
  if (!stored) return { x: 0, y: 0 }
  try {
    const parsed = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object') return { x: 0, y: 0 }
    return { x: Number(parsed.x) || 0, y: Number(parsed.y) || 0 }
  } catch (error) {
    return { x: 0, y: 0 }
  }
}

const savePan = () => {
  localStorage.setItem(panStorageKey, JSON.stringify(state.pan))
}

const parseZoom = () => {
  const stored = localStorage.getItem(zoomStorageKey)
  if (stored == null) return 1
  const z = Number(stored)
  if (Number.isNaN(z) || z < MIN_ZOOM || z > MAX_ZOOM) return 1
  return z
}

const saveZoom = () => {
  localStorage.setItem(zoomStorageKey, String(state.zoom))
}

const applyStageTransform = () => {
  if (!canvasStage) return
  canvasStage.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`
}

const formatDate = (value) => {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return dateFormatter.format(date)
}

const slugify = (value) => {
  if (!value) return ''
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const openModal = () => {
  if (!modal || !modalContent || !modalInput || !modalAuthorInput) return
  modal.classList.remove('opacity-0', 'pointer-events-none')
  modalContent.classList.remove('scale-95')
  if (modalTitle) modalTitle.textContent = 'New Exploration'
  modalInput?.focus()
}

const closeModal = () => {
  if (!modal || !modalContent || !modalInput || !modalAuthorInput) return
  modal.classList.add('opacity-0', 'pointer-events-none')
  modalContent.classList.add('scale-95')
  modalInput.value = ''
  modalAuthorInput.value = ''
}

const updateViewToggle = () => {
  if (!viewToggle || !viewToggleTrack || !viewToggleThumb || !viewOptionList || !viewOptionCanvas) return
  const isCanvas = state.viewMode === 'canvas'
  viewToggle.setAttribute('aria-checked', String(isCanvas))

  const trackRect = viewToggleTrack.getBoundingClientRect()
  const activeSegment = isCanvas ? viewOptionCanvas : viewOptionList
  const segmentRect = activeSegment.getBoundingClientRect()

  const left = segmentRect.left - trackRect.left
  const width = segmentRect.width

  viewToggleThumb.style.width = `${width}px`
  viewToggleThumb.style.transform = `translateX(${left}px)`

  viewOptionList.classList.toggle('text-neutral-900', !isCanvas)
  viewOptionList.classList.toggle('text-neutral-500', isCanvas)
  viewOptionCanvas.classList.toggle('text-neutral-900', isCanvas)
  viewOptionCanvas.classList.toggle('text-neutral-500', !isCanvas)
}

const updateView = (mode) => {
  if (!listContainer || !canvasContainer) return
  if (state.viewMode === mode) return
  state.viewMode = mode
  localStorage.setItem(viewStorageKey, mode)
  listContainer.classList.toggle('hidden', mode === 'canvas')
  canvasContainer.classList.toggle('hidden', mode === 'list')
  canvasContainer?.setAttribute('aria-hidden', mode === 'list' ? 'true' : 'false')
  document.documentElement.classList.toggle('canvas-view', mode === 'canvas')
  if (mode === 'canvas') setCanvasViewportTop()
  updateViewToggle()
  applyStageTransform()
}

const CANVAS_HEADER_GAP = 24

const setCanvasViewportTop = () => {
  const header = document.querySelector('#app header')
  if (!header || !canvasContainer) return
  const headerBottom = header.getBoundingClientRect().bottom
  canvasContainer.style.setProperty('--canvas-top', `${headerBottom + CANVAS_HEADER_GAP}px`)
}

const buildCard = (exploration, mode) => {
  const href = `/explorations/${exploration.id}/`

  if (mode === 'list') {
    const link = document.createElement('a')
    link.href = href
    link.dataset.iterationId = exploration.id
    link.dataset.iterationCard = 'true'
    link.className =
      'group block bg-white border border-[#ededed] rounded-lg p-3 flex flex-col gap-8 text-[12px] text-neutral-900 shadow-none transition-shadow hover:shadow-none'

    const header = document.createElement('div')
    header.className = 'flex flex-col gap-1'

    const title = document.createElement('p')
    title.className = 'font-medium text-neutral-900'
    title.textContent = exploration.title || 'Untitled Exploration'

    const description = document.createElement('p')
    description.className = 'text-[#a2a2a2]'
    description.textContent = exploration.description || 'A new experiment.'

    header.append(title, description)

    const footer = document.createElement('div')
    footer.className = 'flex items-end justify-between'

    const meta = document.createElement('div')
    meta.className = 'flex flex-col text-[#a2a2a2]'

    const author = document.createElement('p')
    const authorName = exploration.authors?.[0] || 'Anonymous'
    author.textContent = `By ${authorName}`

    const date = document.createElement('p')
    date.textContent = formatDate(exploration.date)

    meta.append(author, date)

    const arrowIcon = document.createElement('img')
    arrowIcon.src = arrowIconUrl
    arrowIcon.alt = ''
    arrowIcon.className = 'size-8'

    footer.append(meta, arrowIcon)
    link.append(header, footer)
    return link
  }

  const card = document.createElement('article')
  card.dataset.iterationId = exploration.id
  card.dataset.iterationCard = 'true'
  card.className =
    'group bg-white border border-[#ededed] rounded-lg p-3 flex flex-col gap-8 text-[12px] text-neutral-900 shadow-none select-none'
  card.classList.add('absolute', 'cursor-grab')
  card.style.width = '240px'

  const header = document.createElement('div')
  header.className = 'flex flex-col gap-1'

  const title = document.createElement('p')
  title.className = 'font-medium text-neutral-900'
  title.textContent = exploration.title || 'Untitled Exploration'

  const description = document.createElement('p')
  description.className = 'text-[#a2a2a2]'
  description.textContent = exploration.description || 'A new experiment.'

  header.append(title, description)

  const footer = document.createElement('div')
  footer.className = 'flex items-end justify-between'

  const meta = document.createElement('div')
  meta.className = 'flex flex-col text-[#a2a2a2]'

  const author = document.createElement('p')
  const authorName = exploration.authors?.[0] || 'Anonymous'
  author.textContent = `By ${authorName}`

  const date = document.createElement('p')
  date.textContent = formatDate(exploration.date)

  meta.append(author, date)

  const arrowLink = document.createElement('a')
  arrowLink.href = href
  arrowLink.dataset.action = 'open'
  arrowLink.setAttribute('aria-label', `Open ${exploration.title || 'exploration'}`)
  arrowLink.className = 'flex size-8 shrink-0 items-center justify-center'

  const arrowIcon = document.createElement('img')
  arrowIcon.src = arrowIconUrl
  arrowIcon.alt = ''
  arrowIcon.className = 'size-8'
  arrowLink.appendChild(arrowIcon)

  footer.append(meta, arrowLink)
  card.append(header, footer)

  return card
}

const renderExplorations = (explorations) => {
  if (!listContainer || !canvasStage) return
  listContainer.replaceChildren()
  canvasStage.replaceChildren()

  if (!explorations.length) {
    const empty = document.createElement('div')
    empty.className = 'py-12 text-center text-neutral-400 text-sm font-mono'
    empty.textContent = 'No explorations yet.'
    listContainer.appendChild(empty)
    return
  }

  const listFragment = document.createDocumentFragment()
  const canvasFragment = document.createDocumentFragment()

  explorations.forEach((exploration, index) => {
    const listCard = buildCard(exploration, 'list')
    listFragment.appendChild(listCard)

    const canvasCard = buildCard(exploration, 'canvas')
    const storedPosition = state.positions[exploration.id]
    const position = storedPosition || {
      x: 24 + (index % 3) * 260,
      y: 24 + Math.floor(index / 3) * 180,
    }
    state.positions[exploration.id] = position
    canvasCard.style.left = `${position.x}px`
    canvasCard.style.top = `${position.y}px`
    canvasFragment.appendChild(canvasCard)
  })

  listContainer.appendChild(listFragment)
  canvasStage.appendChild(canvasFragment)
  savePositions()
}

const fetchExplorations = async () => {
  try {
    const response = await fetch('/explorations.json', { cache: 'no-store' })
    if (!response.ok) throw new Error('Failed to load explorations.')
    const data = await response.json()
    if (!Array.isArray(data)) throw new Error('Unexpected response.')
    return data
  } catch (error) {
    return []
  }
}

const handleCreateExploration = async () => {
  const title = modalInput.value.trim()
  if (!title) {
    modalInput.focus()
    return
  }

  const author = modalAuthorInput.value.trim()
  const baseId = slugify(title) || 'exploration'
  const id = `${baseId}-${Date.now().toString(36)}`

  modalSubmit.disabled = true

  try {
    const response = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'new',
        id,
        title,
        author: author || 'Anonymous',
      }),
    })

    if (!response.ok) throw new Error('Unable to create exploration.')
    window.location.reload()
  } catch (error) {
    modalTitle.textContent = 'Something went wrong'
  } finally {
    modalSubmit.disabled = false
  }
}

const getStagePoint = (clientX, clientY) => {
  if (!canvasContainer) return { x: 0, y: 0 }
  const rect = canvasContainer.getBoundingClientRect()
  const vx = clientX - rect.left
  const vy = clientY - rect.top
  return {
    x: (vx - state.pan.x) / state.zoom,
    y: (vy - state.pan.y) / state.zoom,
  }
}

const duplicateExploration = async (sourceExploration, position) => {
  const baseId = slugify(sourceExploration.title) || 'exploration'
  const newId = `${baseId}-copy-${Date.now().toString(36)}`
  const title = (sourceExploration.title || 'Untitled') + ' (copy)'
  const author = sourceExploration.authors?.[0] || 'Anonymous'
  try {
    const response = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'duplicate',
        id: newId,
        sourceId: sourceExploration.id,
        title,
        author,
      }),
    })
    if (!response.ok) throw new Error('Duplicate failed')
    if (position) state.positions[newId] = position
    return newId
  } catch (error) {
    return null
  }
}

const handleKeyDuplicate = (event) => {
  if (event.key.toLowerCase() !== 'd') return
  const isMod = event.metaKey || event.ctrlKey
  if (!isMod || state.viewMode !== 'canvas' || !state.selectedCardId) return
  event.preventDefault()
  const exploration = state.explorations?.find((e) => e.id === state.selectedCardId)
  if (!exploration) return
  const pos = state.positions[exploration.id] || { x: 24, y: 24 }
  const newPosition = { x: pos.x + 24, y: pos.y + 24 }
  duplicateExploration(exploration, newPosition).then((id) => {
    if (id) fetchAndRender()
  })
}

const sortByRecentlyEdited = (items) => {
  return [...items].sort((a, b) => {
    const dateA = new Date(a.updated || a.date || 0).getTime()
    const dateB = new Date(b.updated || b.date || 0).getTime()
    return dateB - dateA
  })
}

const fetchAndRender = async () => {
  const raw = await fetchExplorations()
  state.explorations = sortByRecentlyEdited(raw)
  renderExplorations(state.explorations)
}

const setupCanvasInteraction = () => {
  if (!canvasContainer || !canvasStage) return

  let active = null
  let panStart = null

  const handlePanMove = (event) => {
    if (!panStart) return
    state.pan.x = panStart.x + (event.clientX - panStart.clientX)
    state.pan.y = panStart.y + (event.clientY - panStart.clientY)
    applyStageTransform()
  }

  const handlePanUp = () => {
    if (!panStart) return
    panStart = null
    savePan()
    canvasStage.classList.remove('cursor-grabbing')
    canvasStage.classList.add('cursor-grab')
    window.removeEventListener('mousemove', handlePanMove)
    window.removeEventListener('mouseup', handlePanUp)
  }

  const handleCardMove = (event) => {
    if (!active || active.isGhost) return
    const pt = getStagePoint(event.clientX, event.clientY)
    const x = pt.x - active.offsetX
    const y = pt.y - active.offsetY
    active.card.style.left = `${x}px`
    active.card.style.top = `${y}px`
    state.positions[active.id] = { x, y }
  }

  const handleCardUp = async (event) => {
    if (!active) return
    if (active.isGhost) {
      const pt = getStagePoint(event.clientX, event.clientY)
      const dropPosition = {
        x: pt.x - active.offsetX,
        y: pt.y - active.offsetY,
      }
      active.ghost.remove()
      const newId = await duplicateExploration(active.sourceExploration, dropPosition)
      if (newId) await fetchAndRender()
    } else {
      active.card.classList.remove('cursor-grabbing')
      savePositions()
    }
    active = null
    window.removeEventListener('mousemove', handleCardMove)
    window.removeEventListener('mouseup', handleCardUp)
  }

  canvasStage.addEventListener('mousedown', (event) => {
    if (state.viewMode !== 'canvas') return
    const card = event.target.closest('[data-iteration-card="true"]')
    const isOpenControl = event.target.closest('[data-action="open"]')

    if (card && !isOpenControl) {
      event.preventDefault()
      state.selectedCardId = card.dataset.iterationId
      const exploration = state.explorations?.find((e) => e.id === card.dataset.iterationId)
      const stagePt = getStagePoint(event.clientX, event.clientY)
      const cardX = state.positions[card.dataset.iterationId]?.x ?? 0
      const cardY = state.positions[card.dataset.iterationId]?.y ?? 0
      const offsetX = stagePt.x - cardX
      const offsetY = stagePt.y - cardY

      if (event.altKey) {
        const ghost = card.cloneNode(true)
        ghost.classList.add('cursor-grabbing', 'z-50', 'opacity-90')
        ghost.style.left = `${cardX}px`
        ghost.style.top = `${cardY}px`
        canvasStage.appendChild(ghost)
        active = {
          card: ghost,
          id: null,
          offsetX,
          offsetY,
          isGhost: true,
          ghost,
          sourceExploration: exploration || { id: card.dataset.iterationId, title: '', authors: [] },
        }
      } else {
        card.classList.add('cursor-grabbing')
        active = {
          card,
          id: card.dataset.iterationId,
          offsetX,
          offsetY,
          isGhost: false,
        }
      }
      window.addEventListener('mousemove', handleCardMove)
      window.addEventListener('mouseup', handleCardUp, { once: true })
      return
    }

    if (!card) {
      event.preventDefault()
      panStart = {
        x: state.pan.x,
        y: state.pan.y,
        clientX: event.clientX,
        clientY: event.clientY,
      }
      canvasStage.classList.remove('cursor-grab')
      canvasStage.classList.add('cursor-grabbing')
      window.addEventListener('mousemove', handlePanMove)
      window.addEventListener('mouseup', handlePanUp)
    }
  })

  const handleWheel = (event) => {
    if (state.viewMode !== 'canvas') return
    event.preventDefault()
    const zoomGesture = event.ctrlKey || event.metaKey
    if (zoomGesture) {
      const rect = canvasContainer.getBoundingClientRect()
      const vx = event.clientX - rect.left
      const vy = event.clientY - rect.top
      const oldZoom = state.zoom
      const delta = -Math.sign(event.deltaY) * ZOOM_STEP
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.zoom + delta))
      if (newZoom === oldZoom) return
      state.pan.x = vx - ((vx - state.pan.x) * newZoom) / oldZoom
      state.pan.y = vy - ((vy - state.pan.y) * newZoom) / oldZoom
      state.zoom = newZoom
      applyStageTransform()
      savePan()
      saveZoom()
      return
    }
    let dx = event.deltaX
    let dy = event.deltaY
    if (event.deltaMode === 1) {
      dx *= 40
      dy *= 40
    } else if (event.deltaMode === 2) {
      dx *= canvasContainer.clientWidth
      dy *= canvasContainer.clientHeight
    }
    state.pan.x -= dx
    state.pan.y -= dy
    applyStageTransform()
    savePan()
  }

  canvasContainer.addEventListener('wheel', handleWheel, { passive: false })
}

const zoomIn = () => {
  if (!canvasContainer) return
  const rect = canvasContainer.getBoundingClientRect()
  const vx = rect.width / 2
  const vy = rect.height / 2
  const oldZoom = state.zoom
  const newZoom = Math.min(MAX_ZOOM, state.zoom + ZOOM_STEP)
  if (newZoom === oldZoom) return
  state.pan.x = vx - ((vx - state.pan.x) * newZoom) / oldZoom
  state.pan.y = vy - ((vy - state.pan.y) * newZoom) / oldZoom
  state.zoom = newZoom
  applyStageTransform()
  savePan()
  saveZoom()
}

const zoomOut = () => {
  if (!canvasContainer) return
  const rect = canvasContainer.getBoundingClientRect()
  const vx = rect.width / 2
  const vy = rect.height / 2
  const oldZoom = state.zoom
  const newZoom = Math.max(MIN_ZOOM, state.zoom - ZOOM_STEP)
  if (newZoom === oldZoom) return
  state.pan.x = vx - ((vx - state.pan.x) * newZoom) / oldZoom
  state.pan.y = vy - ((vy - state.pan.y) * newZoom) / oldZoom
  state.zoom = newZoom
  applyStageTransform()
  savePan()
  saveZoom()
}

const zoomReset = () => {
  if (!canvasContainer) return
  const rect = canvasContainer.getBoundingClientRect()
  const vx = rect.width / 2
  const vy = rect.height / 2
  const oldZoom = state.zoom
  const newZoom = 1
  state.pan.x = vx - ((vx - state.pan.x) * newZoom) / oldZoom
  state.pan.y = vy - ((vy - state.pan.y) * newZoom) / oldZoom
  state.zoom = newZoom
  applyStageTransform()
  savePan()
  saveZoom()
}

const init = async () => {
  state.positions = parsePositions()
  state.pan = parsePan()
  state.zoom = parseZoom()
  updateViewToggle()
  listContainer?.classList.toggle('hidden', state.viewMode === 'canvas')
  canvasContainer?.classList.toggle('hidden', state.viewMode === 'list')
  canvasContainer?.setAttribute('aria-hidden', state.viewMode === 'list' ? 'true' : 'false')
  document.documentElement.classList.toggle('canvas-view', state.viewMode === 'canvas')
  if (state.viewMode === 'canvas') setCanvasViewportTop()
  applyStageTransform()

  viewToggle?.addEventListener('click', () => {
    updateView(state.viewMode === 'list' ? 'canvas' : 'list')
  })

  if (viewToggleTrack) {
    const resizeObserver = new ResizeObserver(() => updateViewToggle())
    resizeObserver.observe(viewToggleTrack)
  }

  newExplorationButton?.addEventListener('click', openModal)
  modalCancel?.addEventListener('click', closeModal)
  modalSubmit?.addEventListener('click', handleCreateExploration)
  modal?.addEventListener('click', (event) => {
    if (event.target !== modal) return
    closeModal()
  })
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    if (modal?.classList.contains('pointer-events-none')) return
    closeModal()
  })

  window.addEventListener('keydown', handleKeyDuplicate)

  const handleKeyZoom = (event) => {
    if (state.viewMode !== 'canvas') return
    const mod = event.metaKey || event.ctrlKey
    if (!mod) return
    if (event.key === '0') {
      event.preventDefault()
      zoomReset()
      return
    }
    if (event.key === '=' || event.key === '+') {
      event.preventDefault()
      zoomIn()
      return
    }
    if (event.key === '-') {
      event.preventDefault()
      zoomOut()
      return
    }
  }
  window.addEventListener('keydown', handleKeyZoom)

  setupCanvasInteraction()

  const raw = await fetchExplorations()
  state.explorations = sortByRecentlyEdited(raw)
  renderExplorations(state.explorations)
}

init()
