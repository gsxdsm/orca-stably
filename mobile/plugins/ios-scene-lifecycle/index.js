const fs = require('fs')
const path = require('path')
const {
  IOSConfig,
  withAppDelegate,
  withInfoPlist,
  withXcodeProject
} = require('expo/config-plugins')

// Why: UIKit traps at launch for apps built with the iOS 27 SDK that have not
// adopted the scene lifecycle, so the window and React Native start moves from
// AppDelegate into SceneDelegate.swift.
const SCENE_DELEGATE_FILE = 'SceneDelegate.swift'

const APP_DELEGATE_WINDOW_START = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif`

function withSceneManifest(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate'
          }
        ]
      }
    }
    return cfg
  })
}

function withAppDelegateWithoutWindow(config) {
  return withAppDelegate(config, (cfg) => {
    const { contents, language } = cfg.modResults
    if (language !== 'swift') {
      throw new Error('ios-scene-lifecycle: expected a Swift AppDelegate')
    }
    if (contents.includes('SceneDelegate starts React Native')) {
      return cfg
    }
    if (!contents.includes(APP_DELEGATE_WINDOW_START)) {
      throw new Error(
        'ios-scene-lifecycle: AppDelegate template changed; update the window-start match'
      )
    }
    cfg.modResults.contents = contents.replace(
      APP_DELEGATE_WINDOW_START,
      '    // SceneDelegate starts React Native once UIKit connects the window scene.'
    )
    return cfg
  })
}

function withSceneDelegateSource(config) {
  return withXcodeProject(config, (cfg) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot)
    const target = path.join(cfg.modRequest.platformProjectRoot, projectName, SCENE_DELEGATE_FILE)
    fs.copyFileSync(path.join(__dirname, SCENE_DELEGATE_FILE), target)
    const filepath = `${projectName}/${SCENE_DELEGATE_FILE}`
    if (!cfg.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: projectName,
        project: cfg.modResults
      })
    }
    return cfg
  })
}

module.exports = function withIosSceneLifecycle(config) {
  return withSceneDelegateSource(withAppDelegateWithoutWindow(withSceneManifest(config)))
}
