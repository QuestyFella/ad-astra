package expo.modules.adastrasolver

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

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
      annotateSolveResponse(nativeSolveSources(sourcesJson, width, height))
    }

    AsyncFunction("cancelSolve") {
      nativeCancelSolve()
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

  private external fun nativePing(): String
  private external fun nativeLoadDatabase(path: String): String
  private external fun nativeSolveSources(sourcesJson: String, width: Int, height: Int): String
  private external fun nativeCancelSolve(): String
  private external fun nativeUnloadDatabase(): String
}

private fun isFfiErrorEnvelope(obj: JSONObject): Boolean {
  return obj.has("error") &&
    !obj.has("log") &&
    !obj.has("detected_stars") &&
    !obj.has("matched_stars") &&
    !obj.has("solve_time_ms")
}

private fun annotateSolveResponse(raw: String): String {
  return try {
    val obj = JSONObject(raw)
    if (isFfiErrorEnvelope(obj)) {
      JSONObject().apply {
        put("envelope", "ffi_error")
        put("success", false)
        put("error", obj.optString("error", "Unknown native error"))
      }.toString()
    } else {
      obj.apply { put("envelope", "solve_result") }.toString()
    }
  } catch (_: Exception) {
    JSONObject().apply {
      put("envelope", "ffi_error")
      put("success", false)
      put("error", "Invalid JSON from native solver")
    }.toString()
  }
}
