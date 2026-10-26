const { withPodfile } = require('expo/config-plugins')

// Why: Xcode 27 rejects pod targets below iOS 15.0 (SDWebImage ships 9.0, RNSVG 12.4),
// so lift any older pod target to the app's own floor.
const POD_DEPLOYMENT_FLOOR = '15.1'
const MARKER = '# ios-pod-deployment-floor'

const SNIPPET = `    ${MARKER}
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        if c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < ${POD_DEPLOYMENT_FLOOR}
          c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${POD_DEPLOYMENT_FLOOR}'
        end
      end
    end
`

module.exports = function withIosPodDeploymentFloor(config) {
  return withPodfile(config, (cfg) => {
    const { contents } = cfg.modResults
    if (contents.includes(MARKER)) {
      return cfg
    }
    // Run last in post_install so react_native_post_install cannot reset the targets.
    const start = contents.indexOf('post_install do |installer|\n')
    const end = start === -1 ? -1 : contents.indexOf('\n  end\n', start)
    if (end === -1) {
      throw new Error('ios-pod-deployment-floor: Podfile has no post_install block')
    }
    cfg.modResults.contents = `${contents.slice(0, end + 1)}${SNIPPET}${contents.slice(end + 1)}`
    return cfg
  })
}
