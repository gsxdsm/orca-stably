const { writeInfoPlist } = require('../../plugins/watch-target-plist')

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => {
  const bundleId = config.ios?.bundleIdentifier
  if (!bundleId) {
    throw new Error('watch widget requires ios.bundleIdentifier')
  }
  const teamId = config.ios?.appleTeamId
  writeInfoPlist(__dirname, [
    ['OrcaAppGroup', `group.${bundleId}`],
    [
      'NSExtension',
      {
        NSExtensionPointIdentifier: 'com.apple.widgetkit-extension'
      }
    ]
  ])
  return {
    type: 'watch-widget',
    name: 'OrcaNeedsInput',
    displayName: 'Needs input',
    deploymentTarget: '10.0',
    bundleIdentifier: '.watchkitapp.needsinput',
    ...(teamId ? { appleTeamId: teamId } : {}),
    entitlements: {
      'com.apple.security.application-groups': [`group.${bundleId}`]
    },
    colors: {
      $accent: { light: '#ca8a04', dark: '#eab308' }
    }
  }
}
