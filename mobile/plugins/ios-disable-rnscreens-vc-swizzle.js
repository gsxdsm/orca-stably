const fs = require('node:fs')
const path = require('node:path')
const { withDangerousMod, withPodfile } = require('expo/config-plugins')

// Diagnostic only. Do not merge. react-native-screens exchanges five UIViewController
// methods in +load. The status-bar plist key does not stop the orientation and
// home-indicator exchanges, and those still run inside the Duo keyboard split.
const MARKER = 'orca-diag: skip RNScreens UIViewController swizzle'
const SCREENS_FILE = [
  'node_modules',
  'react-native-screens',
  'ios',
  'UIViewController+RNScreens.mm'
]
const LOAD = '+ (void)load\n{\n'
const PATCHED_LOAD = `+ (void)load\n{\n  // ${MARKER}\n  return;\n`

function patchScreensSwizzle(projectRoot) {
  const file = path.join(projectRoot, ...SCREENS_FILE)
  if (!fs.existsSync(file)) {
    throw new Error(`ios-disable-rnscreens-vc-swizzle: missing ${file}`)
  }
  const contents = fs.readFileSync(file, 'utf8')
  if (contents.includes(MARKER)) {
    return
  }
  if (!contents.includes(LOAD)) {
    throw new Error(
      'ios-disable-rnscreens-vc-swizzle: UIViewController+RNScreens +load changed; update the plugin'
    )
  }
  fs.writeFileSync(file, contents.replace(LOAD, PATCHED_LOAD))
}

// Pod install can run after a clean node_modules, so the Podfile repeats the same edit.
const POST_INSTALL = 'post_install do |installer|'
const RUBY = `
    # ${MARKER}
    screens = File.expand_path('../node_modules/react-native-screens/ios/UIViewController+RNScreens.mm', __dir__)
    if File.exist?(screens)
      contents = File.read(screens)
      unless contents.include?('${MARKER}')
        patched = contents.sub(${JSON.stringify(LOAD)}, ${JSON.stringify(PATCHED_LOAD)})
        raise 'ios-disable-rnscreens-vc-swizzle: UIViewController+RNScreens +load changed' if patched == contents
        File.write(screens, patched)
      end
    end`

module.exports = function withDisabledRNScreensViewControllerSwizzle(config) {
  config = withDangerousMod(config, [
    'ios',
    (cfg) => {
      patchScreensSwizzle(cfg.modRequest.projectRoot)
      return cfg
    }
  ])
  return withPodfile(config, (cfg) => {
    const podfile = cfg.modResults.contents
    if (podfile.includes(MARKER)) {
      return cfg
    }
    if (!podfile.includes(POST_INSTALL)) {
      throw new Error('ios-disable-rnscreens-vc-swizzle: Podfile has no post_install hook')
    }
    cfg.modResults.contents = podfile.replace(POST_INSTALL, `${POST_INSTALL}${RUBY}`)
    return cfg
  })
}
