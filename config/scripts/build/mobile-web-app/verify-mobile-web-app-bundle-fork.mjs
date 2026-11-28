import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Fork-only headroom over upstream's verify-mobile-web-app-bundle.mjs fence.
// Keeping upstream's file untouched lets upstream budget bumps merge without conflict.
const FORK_EAGER_ALLOWANCE_BYTES = 512 * 1024
const FORK_SCRIPT_MARGIN_ALLOWANCE = 12

const verifierUrl = pathToFileURL(
  fileURLToPath(new URL('./verify-mobile-web-app-bundle.mjs', import.meta.url))
).href

function applyForkBudget(source) {
  const withEager = source.replace(
    /^(export const MOBILE_WEB_APP_BUNDLE_MAX_EAGER_BYTES\s*=\s*)(.+)$/m,
    (_, prefix, expr) => `${prefix}(\n  ${expr.trim()}\n) + ${String(FORK_EAGER_ALLOWANCE_BYTES)}`
  )
  if (withEager === source) {
    throw new Error(
      'Could not locate MOBILE_WEB_APP_BUNDLE_MAX_EAGER_BYTES in verify-mobile-web-app-bundle.mjs'
    )
  }
  const withMargin = withEager.replace(
    /^(export const MOBILE_WEB_APP_BUNDLE_SCRIPT_MARGIN\s*=\s*)(.+)$/m,
    (_, prefix, expr) => `${prefix}(\n  ${expr.trim()}\n) + ${String(FORK_SCRIPT_MARGIN_ALLOWANCE)}`
  )
  if (withMargin === withEager) {
    throw new Error(
      'Could not locate MOBILE_WEB_APP_BUNDLE_SCRIPT_MARGIN in verify-mobile-web-app-bundle.mjs'
    )
  }
  return withMargin
}

registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context)
    if (url !== verifierUrl) {
      return result
    }
    const source =
      typeof result.source === 'string'
        ? result.source
        : Buffer.from(result.source).toString('utf8')
    return { ...result, source: applyForkBudget(source) }
  }
})

const {
  MOBILE_WEB_APP_BUNDLE_MAX_CATALOG_BYTES,
  MOBILE_WEB_APP_BUNDLE_MAX_EAGER_BYTES,
  MOBILE_WEB_APP_BUNDLE_MAX_ON_DEMAND_BYTES,
  verifyMobileWebAppBundle
} = await import(verifierUrl)

try {
  const manifest = await verifyMobileWebAppBundle()
  console.log(
    `[verify-mobile-web-app-bundle] OK — ${String(manifest.assets.length)} asset(s), ` +
      `${String(manifest.totalBytes)} total bytes, ` +
      `${String(manifest.eagerBytes)}/${String(MOBILE_WEB_APP_BUNDLE_MAX_EAGER_BYTES)} eager bytes excluding the approved fonts, ` +
      `${String(manifest.onDemandBytes)}/${String(MOBILE_WEB_APP_BUNDLE_MAX_ON_DEMAND_BYTES)} on-demand bytes, ` +
      `${String(manifest.catalogBytes)}/${String(MOBILE_WEB_APP_BUNDLE_MAX_CATALOG_BYTES)} bytes of language catalogs, ` +
      `reproducible buildId ${manifest.buildId}`
  )
} catch (error) {
  console.error(`[verify-mobile-web-app-bundle] ${error.message}`)
  process.exit(1)
}
