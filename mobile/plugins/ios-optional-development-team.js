const fs = require('node:fs')
const path = require('node:path')
const { withDangerousMod } = require('expo/config-plugins')

const appleTargetsRoot = path.dirname(require.resolve('@bacons/apple-targets/package.json'))
const glob = require(require.resolve('glob', { paths: [appleTargetsRoot] }))
const originalGlobSync = glob.globSync
if (!originalGlobSync.orcaWatchOrder) {
  const orderedGlobSync = (pattern, options) => {
    const results = originalGlobSync(pattern, options)
    if (!String(pattern).includes('expo-target.config')) {
      return results
    }
    // The watch app has to be registered last so its Xcode mod runs before the widget mod.
    return [...results].sort((left, right) => rankTarget(left) - rankTarget(right))
  }
  orderedGlobSync.orcaWatchOrder = true
  glob.globSync = orderedGlobSync
}

function rankTarget(file) {
  return String(file).includes(`${path.sep}watch${path.sep}expo-target.config`) ? 1 : 0
}

const { withXcodeProjectBeta } = require('@bacons/apple-targets/build/with-bacons-xcode')

const WATCH_TARGET_NAMES = new Set(['OrcaWatch', 'OrcaNeedsInput'])

function xcodeModule() {
  const appleTargets = path.dirname(require.resolve('@bacons/apple-targets/package.json'))
  return {
    XcodeProject: require(require.resolve('@bacons/xcode', { paths: [appleTargets] })).XcodeProject,
    build: require(require.resolve('@bacons/xcode/json', { paths: [appleTargets] })).build
  }
}

// apple-targets crashes when it updates an existing watch target, so drop those targets and let it create them.
function removeGeneratedWatchTargets(projectPath) {
  if (!fs.existsSync(projectPath)) {
    return
  }
  const { XcodeProject, build } = xcodeModule()
  const project = XcodeProject.open(projectPath)
  const removing = (project.rootObject.props.targets ?? []).filter((target) =>
    WATCH_TARGET_NAMES.has(target.props.name)
  )
  const attributes = project.rootObject.props.attributes?.TargetAttributes
  for (const target of removing) {
    project.rootObject.props.targets = project.rootObject.props.targets.filter(
      (item) => item !== target
    )
    if (attributes) {
      delete attributes[target.uuid]
    }
    target.removeFromProject()
  }
  let removedEmptyEmbed = false
  for (const target of project.rootObject.props.targets ?? []) {
    const phases = target.props.buildPhases ?? []
    const emptyEmbeds = phases.filter((phase) => {
      const files = phase.props?.files ?? []
      return phase.props?.name === 'Embed Foundation Extensions' && files.length === 0
    })
    for (const phase of emptyEmbeds) {
      target.props.buildPhases = target.props.buildPhases.filter((item) => item !== phase)
      phase.removeFromProject()
      removedEmptyEmbed = true
    }
  }
  if (removing.length === 0 && !removedEmptyEmbed) {
    return
  }
  fs.writeFileSync(projectPath, build(project.toJSON()))
}

// apple-targets writes DevelopmentTeam = undefined when APPLE_TEAM_ID is unset, which is not a team id.
// Register this plugin before @bacons/apple-targets so the cleanup runs after that write and before the project is saved.
module.exports = function withOptionalDevelopmentTeam(config) {
  config = withDangerousMod(config, [
    'ios',
    (cfg) => {
      removeGeneratedWatchTargets(
        path.join(cfg.modRequest.platformProjectRoot, 'Orca.xcodeproj', 'project.pbxproj')
      )
      return cfg
    }
  ])
  if (process.env.APPLE_TEAM_ID?.trim()) {
    return config
  }
  return withXcodeProjectBeta(config, (cfg) => {
    const attributes = cfg.modResults?.rootObject?.props?.attributes?.TargetAttributes
    if (!attributes) {
      return cfg
    }
    for (const entry of Object.values(attributes)) {
      if (entry && (entry.DevelopmentTeam == null || entry.DevelopmentTeam === 'undefined')) {
        delete entry.DevelopmentTeam
      }
    }
    return cfg
  })
}
