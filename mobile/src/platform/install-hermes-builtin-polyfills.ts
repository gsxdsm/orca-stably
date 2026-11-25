// Side-effect entry: index.js imports this first, since import hoisting would run any later call after other modules load.
import { installHermesBuiltinPolyfills } from './hermes-builtin-polyfills'

installHermesBuiltinPolyfills()
