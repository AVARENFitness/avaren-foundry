/**
 * Mobile AVA reproduction script — run against dev server:
 * node scripts/ava-mobile-repro.mjs
 */
import { chromium, devices } from 'playwright'

const BASE = process.env.AVA_TEST_URL ?? 'http://127.0.0.1:5173'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'en-US',
  })
  const page = await context.newPage()

  const logs = []
  page.on('console', (msg) => {
    const text = msg.text()
    if (text.includes('[AVA')) logs.push(text)
  })

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 })

  const before = await page.evaluate(() => ({
    bodyOverflow: document.body.style.overflow,
    bodyPosition: document.body.style.position,
    rootPosition: document.getElementById('root')?.style.position ?? '',
    backdrop: Boolean(document.querySelector('[data-app-ui-backdrop="open"]')),
    dialog: Boolean(document.querySelector('[role="dialog"][aria-labelledby]')),
  }))

  const askAva = page.getByRole('button', { name: 'Ask AVA' }).first()
  const askVisible = await askAva.isVisible().catch(() => false)

  if (!askVisible) {
    console.log(JSON.stringify({ error: 'Ask AVA button not visible', before }, null, 2))
    await browser.close()
    return
  }

  await askAva.tap()

  await page.waitForTimeout(600)

  const after = await page.evaluate(() => {
    const backdrop = document.querySelector('[data-app-ui-backdrop="open"]')
    const dialog = document.querySelector('[role="dialog"]')
    const backdropRect = backdrop?.getBoundingClientRect?.()
    const dialogRect = dialog?.getBoundingClientRect?.()
    const backdropStyle = backdrop ? getComputedStyle(backdrop) : null
    const dialogStyle = dialog ? getComputedStyle(dialog) : null

    return {
      bodyOverflow: document.body.style.overflow,
      bodyPosition: document.body.style.position,
      bodyTop: document.body.style.top,
      rootPosition: document.getElementById('root')?.style.position ?? '',
      rootTop: document.getElementById('root')?.style.top ?? '',
      htmlOverflow: document.documentElement.style.overflow,
      backdropMounted: Boolean(backdrop),
      dialogMounted: Boolean(dialog),
      activeElement: document.activeElement?.tagName ?? null,
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      viewportOffsetTop: window.visualViewport?.offsetTop ?? 0,
      backdropRect: backdropRect
        ? {
            top: backdropRect.top,
            bottom: backdropRect.bottom,
            height: backdropRect.height,
            width: backdropRect.width,
          }
        : null,
      dialogRect: dialogRect
        ? {
            top: dialogRect.top,
            bottom: dialogRect.bottom,
            height: dialogRect.height,
            width: dialogRect.width,
          }
        : null,
      backdropZIndex: backdropStyle?.zIndex ?? null,
      backdropOpacity: backdropStyle?.opacity ?? null,
      backdropDisplay: backdropStyle?.display ?? null,
      backdropPointerEvents: backdropStyle?.pointerEvents ?? null,
      dialogZIndex: dialogStyle?.zIndex ?? null,
      dialogOpacity: dialogStyle?.opacity ?? null,
      dialogVisibility: dialogStyle?.visibility ?? null,
      dialogTransform: dialogStyle?.transform ?? null,
    }
  })

  console.log(
    JSON.stringify(
      {
        device: 'iPhone 13',
        askVisible,
        before,
        after,
        avaLogs: logs,
      },
      null,
      2,
    ),
  )

  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
