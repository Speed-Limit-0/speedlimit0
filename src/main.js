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
const ZOOM_SENSITIVITY = 0.0075
const ZOOM_MIN_STEP = 0.001
const ZOOM_EASE = 0.18

const listContainer = document.getElementById('explorations-list')
const canvasContainer = document.getElementById('explorations-canvas')
const canvasPan = document.getElementById('canvas-pan')
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
const deleteModal = document.getElementById('delete-modal')
const deleteModalContent = document.getElementById('delete-modal-content')
const deleteModalCancel = document.getElementById('delete-modal-cancel')
const deleteModalConfirm = document.getElementById('delete-modal-confirm')

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const state = {
  viewMode: localStorage.getItem(viewStorageKey) || 'list',
  positions: {},
  pan: { x: 0, y: 0 },
  zoom: 1,
  zoomTarget: 1,
  zoomFocus: { x: 0, y: 0 },
  zoomRafId: 0,
  isPanning: false,
  isDragging: false,
  isSpacePanning: false,
  lastPointer: { x: 0, y: 0 },
  selectedCardId: null,
  selectedCardIds: new Set(),
  modalMode: 'create',
  editingId: null,
  deleteConfirmOpen: false,
  deleteConfirmIds: [],
}

let listClickTimer = 0

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

const isValidPosition = (value) => {
  return (
    value &&
    typeof value === 'object' &&
    Number.isFinite(Number(value.x)) &&
    Number.isFinite(Number(value.y))
  )
}

const normalizePosition = (value) => {
  if (!isValidPosition(value)) return null
  return { x: Number(value.x), y: Number(value.y) }
}

const persistPosition = async (id, position) => {
  if (!id || !isValidPosition(position)) return
  try {
    await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'position',
        id,
        position: normalizePosition(position),
      }),
    })
  } catch (error) {
    // Best-effort persistence; localStorage still keeps positions.
  }
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
  if (!canvasStage || !canvasPan) return
  canvasPan.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px)`
  canvasPan.style.transformOrigin = '0 0'
  canvasStage.style.transform = `scale(${state.zoom})`
  canvasStage.style.transformOrigin = '0 0'
}

const isEditableTarget = (target) => {
  if (!target || !(target instanceof Element)) return false
  return Boolean(target.closest('input, textarea, [contenteditable="true"]'))
}

const formatDate = (value) => {
  if (!value) return ''
  const hasTime = /T\d{2}:\d{2}/.test(value) || /\d{2}:\d{2}/.test(value)
  const date = new Date(hasTime ? value : `${value}T00:00:00`)
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

const openModal = ({ mode = 'create', exploration = null } = {}) => {
  if (!modal || !modalContent || !modalInput || !modalAuthorInput) return
  state.modalMode = mode
  state.editingId = exploration?.id || null
  modal.classList.remove('opacity-0', 'pointer-events-none')
  modalContent.classList.remove('scale-95')
  if (modalTitle) modalTitle.textContent = mode === 'edit' ? 'Edit Exploration' : 'New Exploration'
  if (modalSubmit) modalSubmit.textContent = mode === 'edit' ? 'Save' : 'Create'
  if (mode === 'edit' && exploration) {
    modalInput.value = exploration.title || ''
    modalAuthorInput.value = exploration.authors?.[0] || ''
  }
  modalInput?.focus()
}

const closeModal = () => {
  if (!modal || !modalContent || !modalInput || !modalAuthorInput) return
  modal.classList.add('opacity-0', 'pointer-events-none')
  modalContent.classList.add('scale-95')
  modalInput.value = ''
  modalAuthorInput.value = ''
  state.modalMode = 'create'
  state.editingId = null
  if (modalTitle) modalTitle.textContent = 'New Exploration'
  if (modalSubmit) modalSubmit.textContent = 'Create'
}

const openDeleteModal = (ids) => {
  if (!deleteModal || !deleteModalContent) return
  state.deleteConfirmOpen = true
  state.deleteConfirmIds = ids
  deleteModal.classList.remove('opacity-0', 'pointer-events-none')
  deleteModalContent.classList.remove('scale-95')
  deleteModal.setAttribute('aria-hidden', 'false')
}

const closeDeleteModal = () => {
  if (!deleteModal || !deleteModalContent) return
  state.deleteConfirmOpen = false
  state.deleteConfirmIds = []
  deleteModal.classList.add('opacity-0', 'pointer-events-none')
  deleteModalContent.classList.add('scale-95')
  deleteModal.setAttribute('aria-hidden', 'true')
}

const confirmDeleteSelection = () => {
  if (!state.deleteConfirmOpen || !state.deleteConfirmIds.length) return
  const ids = [...state.deleteConfirmIds]
  closeDeleteModal()
  deleteExplorations(ids).then((success) => {
    if (!success) return
    ids.forEach((id) => {
      delete state.positions[id]
    })
    savePositions()
    clearSelection()
    fetchAndRender()
  })
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

const getCardElement = (id) => {
  if (!canvasStage || !id) return null
  return canvasStage.querySelector(`[data-iteration-id="${id}"]`)
}

const setCardSelected = (card, selected) => {
  if (!card) return
  card.classList.toggle('canvas-card--selected', selected)
  card.setAttribute('aria-selected', selected ? 'true' : 'false')
}

const clearSelection = () => {
  state.selectedCardIds.forEach((id) => {
    const card = getCardElement(id)
    if (card) setCardSelected(card, false)
  })
  state.selectedCardIds.clear()
  state.selectedCardId = null
}

const addCardSelection = (card) => {
  if (!card) return
  const id = card.dataset.iterationId
  if (!id) return
  if (state.selectedCardIds.has(id)) {
    state.selectedCardId = id
    setCardSelected(card, true)
    return
  }
  state.selectedCardIds.add(id)
  state.selectedCardId = id
  setCardSelected(card, true)
}

const selectSingleCard = (card) => {
  if (!card) return
  clearSelection()
  addCardSelection(card)
}

const syncSelectionStyles = () => {
  if (!canvasStage) return
  const next = new Set()
  state.selectedCardIds.forEach((id) => {
    const card = getCardElement(id)
    if (!card) return
    setCardSelected(card, true)
    next.add(id)
  })
  state.selectedCardIds = next
  if (state.selectedCardId && !state.selectedCardIds.has(state.selectedCardId)) {
    state.selectedCardId = state.selectedCardIds.values().next().value || null
  }
}

const CANVAS_HEADER_GAP = 24

const setCanvasViewportTop = () => {
  const header = document.querySelector('#app header')
  if (!header || !canvasContainer) return
  const headerBottom = header.getBoundingClientRect().bottom
  canvasContainer.style.setProperty('--canvas-top', `${headerBottom + CANVAS_HEADER_GAP}px`)
}

const getPreviewUrl = (exploration) =>
  exploration.previewUrl || exploration.preview || `/explorations/${exploration.id}/`

const buildThumbnail = (exploration) => {
  const wrapper = document.createElement('div')
  wrapper.className =
    'relative w-full overflow-hidden rounded-md bg-[#f6f6f6] border border-[#efefef]'
  wrapper.style.aspectRatio = '16 / 9'

  const scaler = document.createElement('div')
  scaler.style.cssText = 'position:absolute;top:0;left:0;transform-origin:0 0;pointer-events:none;'

  const frame = document.createElement('iframe')
  frame.loading = 'lazy'
  frame.title = exploration.title ? `${exploration.title} preview` : 'Exploration preview'
  frame.tabIndex = -1
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'border:0;pointer-events:none;display:block;'

  const THUMB_MAX_W = 400
  let nativeW = 0

  const ro = new ResizeObserver(() => {
    const w = wrapper.offsetWidth
    if (!w) return
    if (!nativeW) {
      // Cap the viewport so all thumbnails render at a consistent density
      nativeW = Math.min(w, THUMB_MAX_W)
      const h = Math.round(nativeW * (9 / 16))
      frame.style.width = `${nativeW}px`
      frame.style.height = `${h}px`
      scaler.style.width = `${nativeW}px`
      scaler.style.height = `${h}px`
      scaler.style.transform = `scale(${w / nativeW})`
      const baseUrl = getPreviewUrl(exploration)
      frame.src = baseUrl.includes('?') ? `${baseUrl}&preview` : `${baseUrl}?preview`
    } else {
      scaler.style.transform = `scale(${w / nativeW})`
    }
  })

  ro.observe(wrapper)

  frame.addEventListener('error', () => {
    ro.disconnect()
    scaler.remove()
    wrapper.classList.add('flex', 'items-center', 'justify-center')
    const label = document.createElement('span')
    label.className = 'text-[10px] uppercase tracking-[0.3em] text-[#c4c4c4]'
    label.textContent = 'Preview'
    wrapper.appendChild(label)
  })

  scaler.appendChild(frame)
  wrapper.appendChild(scaler)
  return wrapper
}

const buildCard = (exploration, mode) => {
  const href = `/explorations/${exploration.id}/`

  if (mode === 'list') {
    const link = document.createElement('a')
    link.href = href
    link.dataset.iterationId = exploration.id
    link.dataset.iterationCard = 'true'
    link.className =
      'group block bg-white border border-[#ededed] rounded-lg p-3 flex flex-col gap-4 text-[12px] text-neutral-900 shadow-none transition-shadow hover:shadow-none'

    const header = document.createElement('div')
    header.className = 'flex flex-col gap-1'

    const title = document.createElement('p')
    title.className = 'font-medium text-neutral-900'
    title.textContent = exploration.title || 'Untitled Exploration'

    header.append(title)

    const thumbnail = buildThumbnail(exploration)

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
    link.append(header, thumbnail, footer)
    return link
  }

  const card = document.createElement('article')
  card.dataset.iterationId = exploration.id
  card.dataset.iterationCard = 'true'
  card.className =
    'group bg-white border border-[#ededed] rounded-lg p-3 flex flex-col gap-4 text-[12px] text-neutral-900 shadow-none select-none'
  card.classList.add('absolute')
  card.style.width = '240px'

  const header = document.createElement('div')
  header.className = 'flex flex-col gap-1'

  const title = document.createElement('p')
  title.className = 'font-medium text-neutral-900'
  title.textContent = exploration.title || 'Untitled Exploration'

  header.append(title)

  const thumbnail = buildThumbnail(exploration)

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
  arrowLink.className = 'flex size-8 shrink-0 items-center justify-center cursor-pointer'

  const arrowIcon = document.createElement('img')
  arrowIcon.src = arrowIconUrl
  arrowIcon.alt = ''
  arrowIcon.className = 'size-8'
  arrowLink.appendChild(arrowIcon)

  footer.append(meta, arrowLink)
  card.append(header, thumbnail, footer)

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
    const storedPosition = normalizePosition(state.positions[exploration.id])
    const manifestPosition = normalizePosition(exploration.position)
    const fallbackPosition = {
      x: 24 + (index % 3) * 260,
      y: 24 + Math.floor(index / 3) * 180,
    }
    const position = storedPosition || manifestPosition || fallbackPosition
    state.positions[exploration.id] = position
    if (storedPosition && !manifestPosition) {
      persistPosition(exploration.id, storedPosition)
    }
    canvasCard.style.left = `${position.x}px`
    canvasCard.style.top = `${position.y}px`
    canvasFragment.appendChild(canvasCard)
  })

  listContainer.appendChild(listFragment)
  canvasStage.appendChild(canvasFragment)
  savePositions()
  syncSelectionStyles()
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
    closeModal()
    await fetchAndRender()
  } catch (error) {
    modalTitle.textContent = 'Something went wrong'
  } finally {
    modalSubmit.disabled = false
  }
}

const handleUpdateExploration = async () => {
  const title = modalInput.value.trim()
  if (!title) {
    modalInput.focus()
    return
  }
  if (!state.editingId) return

  const author = modalAuthorInput.value.trim()
  const previousId = state.editingId
  modalSubmit.disabled = true

  try {
    const response = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update',
        id: state.editingId,
        title,
        author: author || 'Anonymous',
      }),
    })

    if (!response.ok) throw new Error('Unable to update exploration.')
    let updatedId = null
    try {
      const payload = await response.json()
      updatedId = payload?.id || null
    } catch (error) {
      updatedId = null
    }
    if (updatedId && updatedId !== previousId) {
      if (state.positions[previousId]) {
        state.positions[updatedId] = state.positions[previousId]
        delete state.positions[previousId]
        savePositions()
      }
      if (state.selectedCardId === previousId) {
        state.selectedCardId = updatedId
      }
      if (state.selectedCardIds.has(previousId)) {
        state.selectedCardIds.delete(previousId)
        state.selectedCardIds.add(updatedId)
      }
    }
    closeModal()
    await fetchAndRender()
  } catch (error) {
    modalTitle.textContent = 'Something went wrong'
  } finally {
    modalSubmit.disabled = false
  }
}

const handleModalSubmit = () => {
  if (state.modalMode === 'edit') {
    handleUpdateExploration()
    return
  }
  handleCreateExploration()
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

const getCanvasFocus = (clientX, clientY) => {
  if (!canvasContainer) return { x: 0, y: 0 }
  const rect = canvasContainer.getBoundingClientRect()
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  }
}

const clampZoom = (value) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

const startZoomAnimation = () => {
  if (state.zoomRafId || !canvasContainer) return
  const step = () => {
    if (!canvasContainer) {
      state.zoomRafId = 0
      return
    }
    const oldZoom = state.zoom
    const diff = state.zoomTarget - state.zoom
    let nextZoom = state.zoom + diff * ZOOM_EASE
    nextZoom = clampZoom(nextZoom)

    if (oldZoom !== nextZoom) {
      const vx = state.zoomFocus.x
      const vy = state.zoomFocus.y
      state.pan.x = vx - ((vx - state.pan.x) * nextZoom) / oldZoom
      state.pan.y = vy - ((vy - state.pan.y) * nextZoom) / oldZoom
      state.zoom = nextZoom
      applyStageTransform()
    }

    if (Math.abs(state.zoomTarget - state.zoom) < 0.0005) {
      state.zoom = clampZoom(state.zoomTarget)
      state.zoomRafId = 0
      applyStageTransform()
      savePan()
      saveZoom()
      return
    }

    state.zoomRafId = requestAnimationFrame(step)
  }
  state.zoomRafId = requestAnimationFrame(step)
}

const setZoomTarget = (target, focus) => {
  state.zoomTarget = clampZoom(target)
  if (focus) state.zoomFocus = focus
  startZoomAnimation()
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
        position: normalizePosition(position),
      }),
    })
    if (!response.ok) throw new Error('Duplicate failed')
    if (position) state.positions[newId] = position
    return newId
  } catch (error) {
    return null
  }
}

const deleteExplorations = async (ids) => {
  const filtered = Array.isArray(ids) ? ids.filter(Boolean) : []
  if (!filtered.length) return false
  try {
    const response = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete',
        ids: filtered,
      }),
    })
    if (!response.ok) throw new Error('Delete failed')
    return true
  } catch (error) {
    return false
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

const handleKeyDelete = (event) => {
  if (event.key !== 'Backspace' && event.key !== 'Delete') return
  if (state.viewMode !== 'canvas') return
  if (isEditableTarget(event.target)) return
  if (!state.selectedCardIds.size) return
  event.preventDefault()
  if (state.deleteConfirmOpen) {
    confirmDeleteSelection()
    return
  }
  openDeleteModal(Array.from(state.selectedCardIds))
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
  if (!canvasContainer || !canvasStage || !canvasPan) return

  let active = null
  let panStart = null
  let selection = null

  const selectionBox = document.createElement('div')
  selectionBox.className = 'canvas-selection-box'
  selectionBox.style.display = 'none'
  canvasStage.appendChild(selectionBox)

  const handlePanMove = (event) => {
    if (!panStart) return
    state.lastPointer = { x: event.clientX, y: event.clientY }
    state.pan.x = panStart.x + (event.clientX - panStart.clientX)
    state.pan.y = panStart.y + (event.clientY - panStart.clientY)
    applyStageTransform()
  }

  const handlePanUp = () => {
    if (!panStart) return
    panStart = null
    state.isPanning = false
    savePan()
    window.removeEventListener('mousemove', handlePanMove)
    window.removeEventListener('mouseup', handlePanUp)
  }

  const handleCardMove = (event) => {
    if (!active) return
    state.lastPointer = { x: event.clientX, y: event.clientY }
    const pt = getStagePoint(event.clientX, event.clientY)
    if (active.type === 'ghost') {
      const x = pt.x - active.offsetX
      const y = pt.y - active.offsetY
      active.ghost.style.left = `${x}px`
      active.ghost.style.top = `${y}px`
      return
    }
    if (active.type === 'move') {
      const dx = pt.x - active.start.x
      const dy = pt.y - active.start.y
      active.items.forEach((item) => {
        const x = item.startX + dx
        const y = item.startY + dy
        item.card.style.left = `${x}px`
        item.card.style.top = `${y}px`
        state.positions[item.id] = { x, y }
      })
    }
  }

  const handleCardUp = async (event) => {
    if (!active) return
    if (active.type === 'ghost') {
      const pt = getStagePoint(event.clientX, event.clientY)
      const dropPosition = {
        x: pt.x - active.offsetX,
        y: pt.y - active.offsetY,
      }
      active.ghost.remove()
      const newId = await duplicateExploration(active.sourceExploration, dropPosition)
      if (newId) await fetchAndRender()
    } else if (active.type === 'move') {
      savePositions()
      const updates = active.items.map((item) => persistPosition(item.id, state.positions[item.id]))
      await Promise.allSettled(updates)
    }
    active = null
    state.isDragging = false
    window.removeEventListener('mousemove', handleCardMove)
    window.removeEventListener('mouseup', handleCardUp)
  }

  const getCardBounds = (card) => {
    if (!canvasContainer) return null
    const rect = card.getBoundingClientRect()
    const containerRect = canvasContainer.getBoundingClientRect()
    return {
      left: (rect.left - containerRect.left - state.pan.x) / state.zoom,
      top: (rect.top - containerRect.top - state.pan.y) / state.zoom,
      right: (rect.right - containerRect.left - state.pan.x) / state.zoom,
      bottom: (rect.bottom - containerRect.top - state.pan.y) / state.zoom,
    }
  }

  const rectsIntersect = (a, b) => {
    return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top
  }

  const updateSelectionBox = (start, current) => {
    const left = Math.min(start.x, current.x)
    const top = Math.min(start.y, current.y)
    const right = Math.max(start.x, current.x)
    const bottom = Math.max(start.y, current.y)
    if (!selectionBox.isConnected) canvasStage.appendChild(selectionBox)
    selectionBox.style.display = 'block'
    selectionBox.style.left = `${left}px`
    selectionBox.style.top = `${top}px`
    selectionBox.style.width = `${right - left}px`
    selectionBox.style.height = `${bottom - top}px`
  }

  const handleSelectionMove = (event) => {
    if (!selection) return
    const pt = getStagePoint(event.clientX, event.clientY)
    const dx = Math.abs(pt.x - selection.start.x)
    const dy = Math.abs(pt.y - selection.start.y)
    if (!selection.moved && (dx > 2 || dy > 2)) selection.moved = true
    selection.current = pt
    updateSelectionBox(selection.start, selection.current)
    const selectionRect = {
      left: Math.min(selection.start.x, selection.current.x),
      top: Math.min(selection.start.y, selection.current.y),
      right: Math.max(selection.start.x, selection.current.x),
      bottom: Math.max(selection.start.y, selection.current.y),
    }
    if (!selection.additive) clearSelection()
    const cards = canvasStage.querySelectorAll('[data-iteration-card="true"]')
    cards.forEach((card) => {
      const bounds = getCardBounds(card)
      if (!bounds) return
      if (rectsIntersect(selectionRect, bounds)) {
        if (!state.selectedCardIds.has(card.dataset.iterationId)) addCardSelection(card)
      }
    })
  }

  const handleSelectionUp = () => {
    if (!selection) return
    selectionBox.style.display = 'none'
    if (!selection.moved && !selection.additive) clearSelection()
    selection = null
    window.removeEventListener('mousemove', handleSelectionMove)
    window.removeEventListener('mouseup', handleSelectionUp)
  }

  canvasContainer.addEventListener('mousedown', (event) => {
    if (state.viewMode !== 'canvas') return
    if (event.button !== 0) return
    state.lastPointer = { x: event.clientX, y: event.clientY }
    const card = event.target.closest('[data-iteration-card="true"]')
    const isOpenControl = event.target.closest('[data-action="open"]')

    if (card && !isOpenControl) {
      event.preventDefault()
      const additive = event.shiftKey
      if (additive) {
        addCardSelection(card)
      } else {
        selectSingleCard(card)
      }
      const exploration = state.explorations?.find((e) => e.id === card.dataset.iterationId)
      const stagePt = getStagePoint(event.clientX, event.clientY)

      if (event.altKey) {
        const ghost = card.cloneNode(true)
        ghost.classList.add('z-50', 'opacity-90')
        ghost.style.pointerEvents = 'none'
        const cardX = state.positions[card.dataset.iterationId]?.x ?? 0
        const cardY = state.positions[card.dataset.iterationId]?.y ?? 0
        const offsetX = stagePt.x - cardX
        const offsetY = stagePt.y - cardY
        ghost.style.left = `${cardX}px`
        ghost.style.top = `${cardY}px`
        canvasStage.appendChild(ghost)
        active = {
          type: 'ghost',
          ghost,
          offsetX,
          offsetY,
          sourceExploration: exploration || { id: card.dataset.iterationId, title: '', authors: [] },
        }
      } else {
        const items = Array.from(state.selectedCardIds).map((id) => {
          const itemCard = getCardElement(id)
          const pos = state.positions[id] || { x: 0, y: 0 }
          return itemCard ? { id, card: itemCard, startX: pos.x, startY: pos.y } : null
        })
        const filtered = items.filter(Boolean)
        active = {
          type: 'move',
          start: stagePt,
          items: filtered.length
            ? filtered
            : [
                {
                  id: card.dataset.iterationId,
                  card,
                  startX: state.positions[card.dataset.iterationId]?.x ?? 0,
                  startY: state.positions[card.dataset.iterationId]?.y ?? 0,
                },
              ],
        }
      }
      state.isDragging = true
      window.addEventListener('mousemove', handleCardMove)
      window.addEventListener('mouseup', handleCardUp, { once: true })
      return
    }

    if (!card) {
      if (state.isSpacePanning) {
        event.preventDefault()
        state.isPanning = true
        panStart = {
          x: state.pan.x,
          y: state.pan.y,
          clientX: event.clientX,
          clientY: event.clientY,
        }
        window.addEventListener('mousemove', handlePanMove)
        window.addEventListener('mouseup', handlePanUp)
        return
      }
      event.preventDefault()
      selection = {
        start: getStagePoint(event.clientX, event.clientY),
        current: getStagePoint(event.clientX, event.clientY),
        moved: false,
        additive: event.shiftKey,
      }
      updateSelectionBox(selection.start, selection.current)
      window.addEventListener('mousemove', handleSelectionMove)
      window.addEventListener('mouseup', handleSelectionUp)
    }
  })

  const handleWheel = (event) => {
    if (state.viewMode !== 'canvas') return
    state.lastPointer = { x: event.clientX, y: event.clientY }
    event.preventDefault()
    const zoomGesture = event.ctrlKey || event.metaKey
    if (zoomGesture) {
      const focusPoint =
        state.isPanning || state.isDragging
          ? state.lastPointer
          : { x: event.clientX, y: event.clientY }
      const focus = getCanvasFocus(focusPoint.x, focusPoint.y)
      let delta = event.deltaY
      if (event.deltaMode === 1) delta *= 40
      if (event.deltaMode === 2) delta *= canvasContainer.clientHeight
      const factor = Math.exp(-delta * ZOOM_SENSITIVITY)
      const proposed = state.zoomTarget * factor
      const newZoom = clampZoom(proposed)
      if (Math.abs(newZoom - state.zoomTarget) < ZOOM_MIN_STEP) return
      setZoomTarget(newZoom, focus)
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
  const newZoom = clampZoom(state.zoomTarget + ZOOM_STEP)
  if (newZoom === state.zoomTarget) return
  setZoomTarget(newZoom, { x: vx, y: vy })
}

const zoomOut = () => {
  if (!canvasContainer) return
  const rect = canvasContainer.getBoundingClientRect()
  const vx = rect.width / 2
  const vy = rect.height / 2
  const newZoom = clampZoom(state.zoomTarget - ZOOM_STEP)
  if (newZoom === state.zoomTarget) return
  setZoomTarget(newZoom, { x: vx, y: vy })
}

const zoomReset = () => {
  if (!canvasContainer) return
  const rect = canvasContainer.getBoundingClientRect()
  const vx = rect.width / 2
  const vy = rect.height / 2
  setZoomTarget(1, { x: vx, y: vy })
}

const init = async () => {
  state.positions = parsePositions()
  state.pan = parsePan()
  state.zoom = parseZoom()
  state.zoomTarget = state.zoom
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
  modalSubmit?.addEventListener('click', handleModalSubmit)
  modal?.addEventListener('click', (event) => {
    if (event.target !== modal) return
    closeModal()
  })
  deleteModal?.addEventListener('click', (event) => {
    if (event.target !== deleteModal) return
    closeDeleteModal()
  })
  deleteModalCancel?.addEventListener('click', (event) => {
    event.preventDefault()
    closeDeleteModal()
  })
  deleteModalConfirm?.addEventListener('click', (event) => {
    event.preventDefault()
    confirmDeleteSelection()
  })
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    if (state.deleteConfirmOpen) {
      closeDeleteModal()
      return
    }
    if (modal?.classList.contains('pointer-events-none')) return
    closeModal()
  })

  const handleSpacePanDown = (event) => {
    if (event.code !== 'Space') return
    if (state.viewMode !== 'canvas') return
    if (isEditableTarget(event.target)) return
    event.preventDefault()
    state.isSpacePanning = true
    canvasContainer?.classList.add('canvas-space-pan')
  }

  const handleSpacePanUp = (event) => {
    if (event.code !== 'Space') return
    state.isSpacePanning = false
    canvasContainer?.classList.remove('canvas-space-pan')
  }

  window.addEventListener('keydown', handleSpacePanDown)
  window.addEventListener('keyup', handleSpacePanUp)

  window.addEventListener('keydown', handleKeyDuplicate)
  window.addEventListener('keydown', handleKeyDelete)

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

  const handleGlobalZoomBlock = (event) => {
    if (state.viewMode !== 'canvas') return
    const zoomGesture = event.ctrlKey || event.metaKey
    if (!zoomGesture) return
    if (canvasContainer && canvasContainer.contains(event.target)) return
    event.preventDefault()
  }
  window.addEventListener('wheel', handleGlobalZoomBlock, { passive: false })

  setupCanvasInteraction()

  listContainer?.addEventListener('click', (event) => {
    const card = event.target.closest('[data-iteration-card="true"]')
    if (!card) return
    if (event.detail > 1) {
      event.preventDefault()
      return
    }
    event.preventDefault()
    if (listClickTimer) window.clearTimeout(listClickTimer)
    const href = card.getAttribute('href')
    if (!href) return
    listClickTimer = window.setTimeout(() => {
      window.location.href = href
      listClickTimer = 0
    }, 220)
  })

  listContainer?.addEventListener('dblclick', (event) => {
    const card = event.target.closest('[data-iteration-card="true"]')
    if (!card) return
    event.preventDefault()
    event.stopPropagation()
    if (listClickTimer) window.clearTimeout(listClickTimer)
    const exploration = state.explorations?.find((e) => e.id === card.dataset.iterationId)
    if (!exploration) return
    openModal({ mode: 'edit', exploration })
  })

  canvasContainer?.addEventListener('dblclick', (event) => {
    const card = event.target.closest('[data-iteration-card="true"]')
    const isOpenControl = event.target.closest('[data-action="open"]')
    if (!card || isOpenControl) return
    event.preventDefault()
    const exploration = state.explorations?.find((e) => e.id === card.dataset.iterationId)
    if (!exploration) return
    openModal({ mode: 'edit', exploration })
  })

  const raw = await fetchExplorations()
  state.explorations = sortByRecentlyEdited(raw)
  renderExplorations(state.explorations)
}

init()
