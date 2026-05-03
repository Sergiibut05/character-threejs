/**
 * Scheduler — runs heavy work spread across event-loop ticks so the main
 * thread keeps yielding to the browser (no "Page Unresponsive" warning).
 *
 * Two strategies available:
 *
 * 1. `chunkedAcrossFrames(items, chunkSize, perItem)` — runs in rAF ticks.
 *    Good for work that must be interleaved with rendering (e.g. building
 *    Three.js geometry that references live textures).
 *
 * 2. `chunkedInBackground(items, budgetMs, perItem)` — runs in setTimeout(0)
 *    ticks with a time budget per tick. Does NOT compete with the rAF render
 *    loop, so it's ideal for pure-JS/WASM work like Rapier trimesh creation.
 *    Budget: how many ms to spend per tick (default 4 ms). A lower value
 *    means shorter tasks but more scheduling overhead.
 */
export function chunkedAcrossFrames(items, chunkSize, perItem) {
    return new Promise((resolve) => {
        let i = 0
        const total = items.length
        if (total === 0) { resolve(); return }
        const step = () => {
            const end = Math.min(i + chunkSize, total)
            for (; i < end; i++) {
                try { perItem(items[i], i) } catch (e) {
                    console.warn('Scheduler: item failed', e)
                }
            }
            if (i < total) requestAnimationFrame(step)
            else resolve()
        }
        requestAnimationFrame(step)
    })
}

/**
 * Same idea but for index ranges. Useful for tight numeric loops where
 * we'd rather avoid building an array of indices.
 */
export function rangeAcrossFrames(total, chunkSize, perIndex) {
    return new Promise((resolve) => {
        let i = 0
        if (total === 0) { resolve(); return }
        const step = () => {
            const end = Math.min(i + chunkSize, total)
            for (; i < end; i++) perIndex(i)
            if (i < total) requestAnimationFrame(step)
            else resolve()
        }
        requestAnimationFrame(step)
    })
}

/** Yield to the event loop (one frame). */
export function yieldFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve))
}

/**
 * Time-budgeted background scheduler using setTimeout(0).
 *
 * Unlike chunkedAcrossFrames, this does NOT use requestAnimationFrame,
 * so it does NOT steal the browser's single rAF slot from the render
 * loop. Heavy WASM work (Rapier trimesh) can run between paint ticks
 * without delaying frames.
 *
 * Each setTimeout callback processes as many items as fit within
 * `budgetMs` milliseconds, then yields back to the browser.
 *
 * @param {Array}    items     — array of items to process
 * @param {number}   budgetMs  — max ms to spend per tick (default 4)
 * @param {Function} perItem   — callback(item, index)
 * @returns {Promise<void>}    resolves when all items are processed
 */
export function chunkedInBackground(items, budgetMs = 4, perItem) {
    return new Promise((resolve) => {
        let i = 0
        const total = items.length
        if (total === 0) { resolve(); return }

        const step = () => {
            const deadline = performance.now() + budgetMs
            while (i < total && performance.now() < deadline) {
                try { perItem(items[i], i) } catch (e) {
                    console.warn('Scheduler[bg]: item failed', e)
                }
                i++
            }
            if (i < total) setTimeout(step, 0)
            else resolve()
        }

        // First tick via setTimeout so we yield immediately before starting.
        setTimeout(step, 0)
    })
}

/** Yield to the event loop via setTimeout (doesn't block rAF slot). */
export function yieldIdle() {
    return new Promise((resolve) => setTimeout(resolve, 0))
}
