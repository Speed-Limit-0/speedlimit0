/**
 * Interactive particle field with mouse attraction and inter-particle connections.
 */
export function createParticleField(canvas) {
    const ctx = canvas.getContext('2d')

    function resize() {
        canvas.width = window.innerWidth
        canvas.height = window.innerHeight
    }
    window.addEventListener('resize', resize)
    resize()

    const COUNT = 120
    const particles = Array.from({ length: COUNT }, () => ({
        x: Math.random() * innerWidth,
        y: Math.random() * innerHeight,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2 + 1,
    }))

    const mouse = { x: innerWidth / 2, y: innerHeight / 2 }
    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX
        mouse.y = e.clientY
    })

    function frame() {
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        for (const p of particles) {
            p.x += p.vx
            p.y += p.vy

            // Bounce off edges
            if (p.x < 0 || p.x > canvas.width) p.vx *= -1
            if (p.y < 0 || p.y > canvas.height) p.vy *= -1

            // Mouse attraction
            const dx = mouse.x - p.x
            const dy = mouse.y - p.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < 150) {
                p.vx += dx * 0.00003
                p.vy += dy * 0.00003
            }

            // Draw particle
            ctx.beginPath()
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(0, 0, 0, ${0.15 + Math.max(0, (1 - dist / 300)) * 0.15})`
            ctx.fill()
        }

        // Draw connections
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const a = particles[i]
                const b = particles[j]
                const d = Math.hypot(a.x - b.x, a.y - b.y)
                if (d < 100) {
                    ctx.beginPath()
                    ctx.moveTo(a.x, a.y)
                    ctx.lineTo(b.x, b.y)
                    ctx.strokeStyle = `rgba(0, 0, 0, ${0.04 * (1 - d / 100)})`
                    ctx.stroke()
                }
            }
        }

        requestAnimationFrame(frame)
    }

    frame()
}
