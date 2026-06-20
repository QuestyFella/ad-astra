use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::Path;
use std::sync::{LazyLock, Mutex};

use jni::objects::{JClass, JString};
use jni::sys::{jint, jstring};
use jni::JNIEnv;

use ad_astra_solver::db::AdbDatabase;

static DB: LazyLock<Mutex<Option<AdbDatabase>>> = LazyLock::new(|| Mutex::new(None));

// ── Helpers ─────────────────────────────────────────────────────────────────

fn to_java_string(env: &mut JNIEnv, s: &str) -> jstring {
    env.new_string(s)
        .expect("JNI string creation failed")
        .into_raw()
}

fn json_error(msg: &str) -> String {
    serde_json::json!({"success": false, "error": msg}).to_string()
}

fn string_from_env(env: &mut JNIEnv, input: &JString) -> Result<String, String> {
    env.get_string(input)
        .map(|s| s.into())
        .map_err(|e| format!("Failed to read JNI string: {:?}", e))
}

fn safe_catch<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce() -> R,
{
    catch_unwind(AssertUnwindSafe(f))
        .map_err(|_| "Rust panic caught at FFI boundary".to_string())
}

// ── Ping ────────────────────────────────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_expo_modules_adastrasolver_AdAstraSolverModule_nativePing(
    mut env: JNIEnv,
    _class: JClass,
) -> jstring {
    let result = safe_catch(|| -> String {
        format!(
            "ad_astra_native_ok; version={}",
            env!("CARGO_PKG_VERSION")
        )
    });

    match result {
        Ok(msg) => to_java_string(&mut env, &msg),
        Err(e) => to_java_string(&mut env, &format!("ad_astra_native_error: {}", e)),
    }
}

// ── Load database ───────────────────────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_expo_modules_adastrasolver_AdAstraSolverModule_nativeLoadDatabase(
    mut env: JNIEnv,
    _class: JClass,
    path: JString,
) -> jstring {
    let result = safe_catch(|| -> Result<String, String> {
        let p = string_from_env(&mut env, &path)?;
        let db = ad_astra_solver::db::load_database(Path::new(&p))
            .map_err(|e| format!("Failed to load database: {}", e))?;
        let summary = serde_json::json!({
            "success": true,
            "stars": db.header.n_stars,
            "patterns": db.header.n_patterns
        });
        let mut guard = DB.lock().map_err(|e| format!("Mutex error: {}", e))?;
        if guard.is_some() {
            return Err("Database already loaded. Call nativeUnloadDatabase first.".to_string());
        }
        *guard = Some(db);
        Ok(summary.to_string())
    });

    match result {
        Ok(Ok(msg)) => to_java_string(&mut env, &msg),
        Ok(Err(e)) => to_java_string(&mut env, &json_error(&e)),
        Err(e) => to_java_string(&mut env, &json_error(&e)),
    }
}

// ── Solve ───────────────────────────────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_expo_modules_adastrasolver_AdAstraSolverModule_nativeSolveSources(
    mut env: JNIEnv,
    _class: JClass,
    sources_json: JString,
    width: jint,
    height: jint,
) -> jstring {
    let result = safe_catch(|| -> Result<String, String> {
        let json_str = string_from_env(&mut env, &sources_json)?;
        let sources: Vec<ad_astra_solver::types::ImageSource> =
            serde_json::from_str(&json_str)
                .map_err(|e| format!("Failed to parse sources JSON: {}", e))?;

        let db = {
            let guard = DB.lock().map_err(|e| format!("Mutex error: {}", e))?;
            guard
                .as_ref()
                .ok_or_else(|| {
                    "Database not loaded. Call nativeLoadDatabase first.".to_string()
                })?
                .clone()
        };

        let request = ad_astra_solver::types::SolveSourcesRequest {
            sources,
            image_width_px: width as u32,
            image_height_px: height as u32,
            fov_estimate_deg: None,
            fov_max_error_deg: None,
            database_path: String::new(),
            solve_timeout_ms: None,
        };

        let result = ad_astra_solver::solve::solve_sources_with_db(&request, db, "adb");
        serde_json::to_string(&result)
            .map_err(|e| format!("Failed to serialize solve result: {}", e))
    });

    match result {
        Ok(Ok(msg)) => to_java_string(&mut env, &msg),
        Ok(Err(e)) => to_java_string(&mut env, &json_error(&e)),
        Err(e) => to_java_string(&mut env, &json_error(&e)),
    }
}

// ── Unload database ─────────────────────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_expo_modules_adastrasolver_AdAstraSolverModule_nativeUnloadDatabase(
    mut env: JNIEnv,
    _class: JClass,
) -> jstring {
    let result = safe_catch(|| -> String {
        let mut guard = match DB.lock() {
            Ok(g) => g,
            Err(e) => {
                return json_error(&format!("Mutex error: {}", e));
            }
        };
        if guard.is_some() {
            *guard = None;
            serde_json::json!({"success": true}).to_string()
        } else {
            json_error("No database loaded")
        }
    });

    match result {
        Ok(msg) => to_java_string(&mut env, &msg),
        Err(e) => to_java_string(&mut env, &json_error(&e)),
    }
}
