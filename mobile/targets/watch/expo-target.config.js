/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => {
  const bundleId = config.ios?.bundleIdentifier
  if (!bundleId) {
    throw new Error('watch target requires ios.bundleIdentifier')
  }
  return {
    type: 'watch',
    name: 'OrcaWatch',
    displayName: 'Orca',
    deploymentTarget: '10.0',
    // Companion id is <phone>.watchkitapp. A leading dot appends to the phone bundle id.
    bundleIdentifier: '.watchkitapp',
    frameworks: ['SwiftUI'],
    entitlements: {
      'com.apple.security.application-groups': [`group.${bundleId}`]
    }
  }
}
