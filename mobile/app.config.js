// Bare expo-notifications defaults to sandbox entitlements while non-dev push-token.ts reports production, silently losing TestFlight/App Store pushes.
// Derive APNs mode from release workflow env; Expo still supplies app.json, including Fastlane version/buildNumber rewrites, for everything else.
const APS_ENVIRONMENT =
  process.env.ORCA_IOS_APS_ENVIRONMENT === 'production' ? 'production' : 'development'

module.exports = ({ config }) => {
  const bundleId = config.ios?.bundleIdentifier
  const appGroup = bundleId ? `group.${bundleId}` : undefined
  return {
    ...config,
    // `expo run` installs a dev-client build cached for the current native fingerprint instead of
    // rebuilding; scripts/native-client.mjs populates the cache.
    buildCacheProvider: { plugin: './scripts/native-build-cache.cjs' },
    ios: {
      ...config.ios,
      entitlements: {
        ...config.ios?.entitlements,
        'aps-environment': APS_ENVIRONMENT,
        // Same group the watch target reads. Follows the bundle id Expo resolves at prebuild.
        ...(appGroup ? { 'com.apple.security.application-groups': [appGroup] } : {})
      }
    },
    plugins: (config.plugins ?? []).map((plugin) =>
      plugin === 'expo-notifications'
        ? [
            'expo-notifications',
            {
              enableBackgroundRemoteNotifications: true,
              mode: APS_ENVIRONMENT,
              icon: './assets/notification-icon.png'
            }
          ]
        : plugin
    )
  }
}
