import { generationDirectoryPath } from '../src/mobile-web-shell/generation-store-file-system'

// QA only. The launchd server keeps the main page cached. This shell reads the
// integrate worktree bundle from a local static server and still uses the paired host for session data.
const BUNDLE_ORIGIN = 'http://127.0.0.1:8090'

const NO_CONNECTION = { reason: 'no-connection', hostCode: null }
const CACHE_WRITE_FAILED = { reason: 'cache-write-failed', hostCode: null }

async function loadManifest() {
  const response = await fetch(`${BUNDLE_ORIGIN}/manifest.json`)
  if (!response.ok) {
    throw new Error(`local bundle manifest ${response.status}`)
  }
  return response.json()
}

function manifestFacts(manifest) {
  return {
    buildId: manifest.buildId,
    schemaVersion: manifest.schemaVersion,
    runtimeProtocolVersion: manifest.runtimeProtocolVersion,
    minCompatibleRuntimeProtocolVersion: manifest.minCompatibleRuntimeProtocolVersion,
    pageVersion: manifest.pageVersion,
    totalBytes: manifest.totalBytes,
    totalAssets: manifest.assets.length,
    routes: manifest.routes
  }
}

export async function openCache(store, hostKey) {
  try {
    await store.sweepStagedGenerations()
    const active = await store.readActiveGeneration(hostKey)
    return active === null
      ? null
      : {
          buildId: active.buildId,
          directory: generationDirectoryPath(active.directory),
          totalBytes: active.manifest.totalBytes,
          routes: active.manifest.routes,
          compat: {
            schemaVersion: active.manifest.schemaVersion,
            runtimeProtocolVersion: active.manifest.runtimeProtocolVersion,
            minCompatibleRuntimeProtocolVersion:
              active.manifest.minCompatibleRuntimeProtocolVersion,
            pageVersion: active.manifest.pageVersion
          }
        }
  } catch {
    return null
  }
}

export async function readManifest(_client, flow, send) {
  try {
    const manifest = await loadManifest()
    send({ type: 'manifest-read', flow, manifest: manifestFacts(manifest) })
  } catch {
    send({ type: 'download-failed', flow, cause: NO_CONNECTION })
  }
}

async function fetchLocalBundle(onProgress) {
  const startedAt = Date.now()
  const manifest = await loadManifest()
  const assets = new Map()
  let receivedBytes = 0
  let completedAssets = 0
  const totalAssets = manifest.assets.length
  const report = () =>
    onProgress?.({
      completedAssets,
      totalAssets,
      receivedBytes,
      totalBytes: manifest.totalBytes
    })
  report()
  const queue = manifest.assets.slice()
  const workers = Array.from({ length: 4 }, async () => {
    for (;;) {
      const asset = queue.shift()
      if (!asset) {
        return
      }
      const response = await fetch(`${BUNDLE_ORIGIN}/${asset.path}`)
      if (!response.ok) {
        throw new Error(`local bundle asset ${asset.path} ${response.status}`)
      }
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.byteLength !== asset.byteLength) {
        throw new Error(`local bundle asset ${asset.path} length`)
      }
      assets.set(asset.path, bytes)
      receivedBytes += bytes.byteLength
      completedAssets += 1
      report()
    }
  })
  await Promise.all(workers)
  return {
    manifest,
    assets,
    reused: [],
    totalBytes: manifest.totalBytes,
    elapsedMs: Date.now() - startedAt
  }
}

export async function download(args) {
  const { store, hostKey, flow, runtime, send } = args
  const controller = new AbortController()
  args.downloads.add(controller)
  let fetchedWhole = false
  try {
    const fetched = await fetchLocalBundle((progress) =>
      send({ type: 'fetch-progress', flow, ...progress })
    )
    if (controller.signal.aborted) {
      return
    }
    fetchedWhole = true
    send({ type: 'download-staged', flow })
    const staged = await store.stageGeneration(hostKey, fetched, controller.signal)
    if (controller.signal.aborted) {
      await store.abortStagedGeneration(staged).catch(() => undefined)
      return
    }
    const committed = await store.commitGeneration(staged)
    send({
      type: 'activated',
      flow,
      generationDirectory: generationDirectoryPath(committed.directory),
      sessionId: runtime.mintSessionId(),
      buildId: committed.buildId,
      totalBytes: committed.manifest.totalBytes,
      elapsedMs: runtime.now() - args.startedAt
    })
  } catch {
    send({
      type: 'download-failed',
      flow,
      cause: fetchedWhole ? CACHE_WRITE_FAILED : NO_CONNECTION
    })
  } finally {
    args.downloads.delete(controller)
  }
}
