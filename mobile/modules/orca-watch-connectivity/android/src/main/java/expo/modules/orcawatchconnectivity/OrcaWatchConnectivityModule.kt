package expo.modules.orcawatchconnectivity

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OrcaWatchConnectivityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OrcaWatchConnectivity")

    Events("onCommand")

    Function("start") { }

    Function("sendReply") { _: String, _: Map<String, Any> -> }

    Function("updateContext") { _: Map<String, Any> -> }
  }
}
