const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const sharedRoot = path.resolve(projectRoot, '..', 'src', 'shared')

const config = getDefaultConfig(projectRoot)

// Watch repo root: mobile source-control uses desktop’s pure prompt builders, outside Metro’s default mobile-only scope.
config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), sharedRoot]))

// QA simulator only: ad-hoc signature cannot hold a keychain entitlement.
const secureStoreShim = path.resolve(projectRoot, 'qa-harness', 'expo-secure-store-shim.js')
const previousResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'expo-secure-store') {
    return { type: 'sourceFile', filePath: secureStoreShim }
  }
  if (previousResolveRequest) {
    return previousResolveRequest(context, moduleName, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
