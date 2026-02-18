---
description: How to add a new exploration page to the Speed Limit 0 site
---

# Adding a New Exploration

This site uses **Vite + Tailwind v4**. Each exploration is a folder under `explorations/` with its own `index.html`, JS, CSS, and any components it needs. Vite auto-discovers all exploration folders.

## 1. Choose an ID

Pick a short, lowercase, hyphenated slug. Examples: `particle-swarm`, `audio-waveform`, `gravity-sim`.

## 2. Create the exploration folder

Create a new folder at `explorations/<id>/` with at least an `index.html`:

### `explorations/<id>/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TITLE — Speed Limit 0</title>
  <link rel="stylesheet" href="/src/styles.css" />
</head>
<body class="bg-white m-0 p-0 overflow-hidden w-screen h-screen">
  <!-- Your experiment takes over the full viewport -->
  <script type="module" src="./main.js"></script>
</body>
</html>
```

### `explorations/<id>/main.js`

```js
// Your entry point — import components, initialize your experiment
// You can import from other files in this folder, from /src/, or from npm packages
```

### Additional files

You can create any structure you need inside the folder:

```
explorations/<id>/
├── index.html        ← Entry point (required)
├── main.js           ← JS entry
├── style.css         ← Custom styles (import in main.js or index.html)
├── components/       ← Reusable components
├── shaders/          ← GLSL shaders
└── ...               ← Anything else
```

**What's available:**
- **Tailwind CSS** — all utility classes work via the `/src/styles.css` import
- **ES Modules** — use `import`/`export` freely between files
- **npm packages** — install with `pnpm add <package>` and import normally
- **CDN imports** — use `<script>` tags or dynamic imports from CDNs
- **Canvas, WebGL, Three.js, p5.js, Web Audio, DOM** — anything goes

## 3. Add an entry to `explorations.json`

Open `explorations.json` in the project root and append a new object to the array:

```json
{
  "id": "your-id",
  "title": "Your Title",
  "description": "A short one-line description.",
  "date": "YYYY-MM-DD",
  "authors": ["Name"]
}
```

**Fields:**
- `id` (required) — must match the folder name
- `title` (required) — display title on the homepage
- `description` (optional) — one-line summary shown on the homepage
- `date` (required) — ISO date string (newest first on homepage)
- `authors` (optional) — array of contributor names

## 4. Dev server

// turbo
Run `pnpm dev` to start the Vite dev server. All exploration folders are auto-discovered — no config changes needed.

That's it. The homepage automatically picks up the new entry.
