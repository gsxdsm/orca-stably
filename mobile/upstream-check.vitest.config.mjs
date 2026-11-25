import { mergeConfig } from 'vitest/config'
import original from './vitest.config.ts'
export default mergeConfig(original, { cacheDir: process.env.ORCA_MOBILE_CI_CACHE_DIR })
