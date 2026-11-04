// Bare expo-notifications defaults to sandbox entitlements while non-dev push-token.ts reports production, silently losing TestFlight/App Store pushes.
// Derive APNs mode from release workflow env; Expo still supplies app.json, including Fastlane version/buildNumber rewrites, for everything else.
const APS_ENVIRONMENT =
  process.env.ORCA_IOS_APS_ENVIRONMENT === 'production' ? 'production' : 'development'

const DEFAULT_BUNDLE_ID = 'com.stably.orca.mobile'

module.exports = ({ config }) => {
  // xcodebuild PRODUCT_BUNDLE_IDENTIFIER overrides do not rewrite the watch companion id or the app group.
  const bundleId =
    process.env.ORCA_IOS_BUNDLE_ID?.trim() || config.ios?.bundleIdentifier || DEFAULT_BUNDLE_ID
  const teamId = process.env.APPLE_TEAM_ID?.trim() || ''
  const appGroup = `group.${bundleId}`
  const { appleTeamId: _ignoredTeam, ...iosRest } = config.ios ?? {}
  return {
    ...config,
    // `expo run` installs a dev-client build cached for the current native fingerprint instead of
    // rebuilding; scripts/native-client.mjs populates the cache.
    buildCacheProvider: { plugin: './scripts/native-build-cache.cjs' },
    ios: {
      ...iosRest,
      bundleIdentifier: bundleId,
      ...(teamId ? { appleTeamId: teamId } : {}),
      entitlements: {
        ...config.ios?.entitlements,
        'aps-environment': APS_ENVIRONMENT,
        // Same group the watch target reads. Follows the bundle id Expo resolves at prebuild.
        'com.apple.security.application-groups': [appGroup]
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
