package expo.modules.adastrasolver

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AdAstraSolverModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("AdAstraSolver")

    AsyncFunction("ping") {
      nativePing()
    }

    AsyncFunction("loadDatabase") { path: String ->
      nativeLoadDatabase(path)
    }

    AsyncFunction("solveSources") { sourcesJson: String, width: Int, height: Int ->
      nativeSolveSources(sourcesJson, width, height)
    }

    AsyncFunction("unloadDatabase") {
      nativeUnloadDatabase()
    }
  }

  companion object {
    init {
      System.loadLibrary("ad_astra_solver_ffi")
    }
  }
}

private external fun nativePing(): String
private external fun nativeLoadDatabase(path: String): String
private external fun nativeSolveSources(sourcesJson: String, width: Int, height: Int): String
private external fun nativeUnloadDatabase(): String
