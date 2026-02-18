import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { readdirSync, existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'fs'
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

export default defineConfig({
  plugins: [
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

            const { action, id, sourceId, title } = req.body
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
                manifest.unshift({
                  id,
                  title: title || 'Untitled Exploration',
                  description: 'A new experiment.',
                  date: new Date().toISOString().split('T')[0],
                  authors: req.body.author ? [req.body.author] : ['Anonymous']
                })
                writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

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
