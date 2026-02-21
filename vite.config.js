import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {
  readdirSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  rmSync,
  renameSync,
} from 'fs'
import { resolve, join } from 'path'
import bodyParser from 'body-parser'

// Auto-discover all exploration folders that contain an index.html
function getExplorationEntries() {
  const explorationsDir = resolve(__dirname, 'explorations')
  if (!existsSync(explorationsDir)) return {}

  const entries = {}
  for (const name of readdirSync(explorationsDir, { withFileTypes: true })) {
    if (name.isDirectory() && name.name !== '_template') {
      const htmlPath = resolve(explorationsDir, name.name, 'index.html')
      if (existsSync(htmlPath)) {
        entries[`explorations/${name.name}`] = htmlPath
      }
    }
  }
  return entries
}

const slugify = (value) => {
  if (!value) return ''
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default defineConfig({
  server: {
    watch: {
      ignored: ['**/explorations.json'],
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'exploration-api',
      configureServer(server) {
        server.middlewares.use(bodyParser.json())
        server.middlewares.use(async (req, res, next) => {
          if (req.url.startsWith('/api/action')) {
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.end('Method Not Allowed')
              return
            }

            const { action, id, sourceId, title, position, ids } = req.body
            const explorationsDir = resolve(__dirname, 'explorations')
            const manifestPath = resolve(__dirname, 'explorations.json')

            try {
              const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

              if (action === 'new' || action === 'duplicate') {
                const newPath = join(explorationsDir, id)
                if (existsSync(newPath)) throw new Error('ID already exists')
                mkdirSync(newPath, { recursive: true })

                const sourceDir = action === 'duplicate'
                  ? join(explorationsDir, sourceId)
                  : join(explorationsDir, '_template')

                // Simple copy of key files
                const filesToCopy = ['index.html', 'main.js', 'particles.js', 'style.css']
                filesToCopy.forEach(file => {
                  const src = join(sourceDir, file)
                  if (existsSync(src)) copyFileSync(src, join(newPath, file))
                })

                // Update manifest
                const entry = {
                  id,
                  title: title || 'Untitled Exploration',
                  description: '',
                  date: new Date().toISOString(),
                  authors: req.body.author ? [req.body.author] : ['Anonymous']
                }
                if (position && Number.isFinite(Number(position.x)) && Number.isFinite(Number(position.y))) {
                  entry.position = { x: Number(position.x), y: Number(position.y) }
                }
                manifest.unshift(entry)
                writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

                res.statusCode = 200
                res.end(JSON.stringify({ success: true }))
                return
              }

              if (action === 'position') {
                const entry = manifest.find(item => item.id === id)
                if (!entry) throw new Error('Unknown exploration')
                if (position && Number.isFinite(Number(position.x)) && Number.isFinite(Number(position.y))) {
                  entry.position = { x: Number(position.x), y: Number(position.y) }
                } else {
                  throw new Error('Invalid position')
                }
                writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
                res.statusCode = 200
                res.end(JSON.stringify({ success: true }))
                return
              }

              if (action === 'update') {
                const entry = manifest.find(item => item.id === id)
                if (!entry) throw new Error('Unknown exploration')
                const nextTitle = typeof title === 'string' ? title.trim() : ''
                if (nextTitle) {
                  entry.title = nextTitle
                }
                const baseSlug = slugify(entry.title) || 'exploration'
                const hasSuffix = entry.id.includes('-')
                let suffix = hasSuffix ? entry.id.split('-').pop() : ''
                if (!suffix || suffix.length < 4) {
                  suffix = Date.now().toString(36)
                }
                let nextId = entry.id
                if (hasSuffix) {
                  nextId = `${baseSlug}-${suffix}`
                } else if (baseSlug !== entry.id) {
                  nextId = `${baseSlug}-${suffix}`
                }
                if (nextId !== entry.id) {
                  const existing = manifest.find(item => item.id === nextId)
                  if (existing) throw new Error('ID already exists')
                  const currentPath = join(explorationsDir, entry.id)
                  const nextPath = join(explorationsDir, nextId)
                  if (!existsSync(currentPath)) throw new Error('Exploration folder missing')
                  if (existsSync(nextPath)) throw new Error('Folder already exists')
                  renameSync(currentPath, nextPath)
                  entry.id = nextId
                }
                const authorValue = typeof req.body.author === 'string' ? req.body.author.trim() : ''
                entry.authors = [authorValue || 'Anonymous']
                entry.updated = new Date().toISOString()
                writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
                res.statusCode = 200
                res.end(JSON.stringify({ success: true, id: entry.id }))
                return
              }

              if (action === 'delete') {
                const idsToDelete = Array.isArray(ids) ? ids.filter(Boolean) : []
                if (!idsToDelete.length) throw new Error('No ids provided')

                const remaining = manifest.filter(item => !idsToDelete.includes(item.id))
                if (remaining.length === manifest.length) {
                  throw new Error('No matching explorations')
                }

                idsToDelete.forEach((entryId) => {
                  const entryPath = join(explorationsDir, entryId)
                  if (existsSync(entryPath)) {
                    rmSync(entryPath, { recursive: true, force: true })
                  }
                })

                writeFileSync(manifestPath, JSON.stringify(remaining, null, 2))
                res.statusCode = 200
                res.end(JSON.stringify({ success: true }))
                return
              }
            } catch (err) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: err.message }))
              return
            }
          }
          next()
        })
      }
    }
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        ...getExplorationEntries(),
      },
    },
  },
})
