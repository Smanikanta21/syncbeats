/**
 * Frontend Logger Utility: Automatically streams user interactions, page navigation,
 * auth events, audio room actions, and uncaught JS exceptions directly to the 
 * SyncBeats DB Visualizer console.
 */

const DB_VISUALIZER_INGEST_URL = process.env.NEXT_PUBLIC_DB_VISUALIZER_URL 
  ? `${process.env.NEXT_PUBLIC_DB_VISUALIZER_URL}/api/dashboard/logs/ingest`
  : "http://localhost:3001/api/dashboard/logs/ingest";

export async function sendLog(
  action: string,
  details: string | object,
  level: "SUCCESS" | "ERROR" | "WARN" | "INFO" | "SECURITY" = "INFO",
  source: "FRONTEND" | "BACKEND" | "DATABASE" = "FRONTEND"
) {
  try {
    const payload = {
      action,
      details: typeof details === "object" ? JSON.stringify(details) : details,
      level,
      source,
    };

    // Non-blocking fire-and-forget
    void fetch(DB_VISUALIZER_INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch (e) {
    // Silent catch
  }
}

export const logger = {
  info: (action: string, details: string | object) => sendLog(action, details, "INFO", "FRONTEND"),
  success: (action: string, details: string | object) => sendLog(action, details, "SUCCESS", "FRONTEND"),
  warn: (action: string, details: string | object) => sendLog(action, details, "WARN", "FRONTEND"),
  error: (action: string, details: string | object) => sendLog(action, details, "ERROR", "FRONTEND"),
  security: (action: string, details: string | object) => sendLog(action, details, "SECURITY", "FRONTEND"),
  db: (action: string, details: string | object) => sendLog(action, details, "INFO", "DATABASE"),
};

// Automatic Global window.fetch Interceptor
if (typeof window !== "undefined" && !(window as any).__FETCH_LOG_PATCHED__) {
  (window as any).__FETCH_LOG_PATCHED__ = true;
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const resource = args[0];
    const config = args[1];

    let urlString = "";
    if (typeof resource === "string") {
      urlString = resource;
    } else if (resource instanceof URL) {
      urlString = resource.toString();
    } else if (resource && typeof resource === "object" && "url" in resource) {
      urlString = (resource as any).url;
    }

    // Skip self logging loop to avoid infinite recursion on logger ingest URL
    if (urlString.includes("/api/dashboard/logs/ingest")) {
      return originalFetch.apply(this, args);
    }

    const method = (config?.method || "GET").toUpperCase();
    const startTime = performance.now();

    try {
      const response = await originalFetch.apply(this, args);
      const duration = Math.round(performance.now() - startTime);
      const status = response.status;
      const ok = response.ok;

      if (!ok) {
        sendLog(
          `FETCH_${status}`,
          `${method} ${urlString} failed with status ${status} (${duration}ms)`,
          status >= 500 ? "ERROR" : "WARN",
          "FRONTEND"
        );
      } else {
        sendLog(
          `FETCH_${status}`,
          `${method} ${urlString} (${duration}ms)`,
          "SUCCESS",
          "FRONTEND"
        );
      }

      return response;
    } catch (err: any) {
      const duration = Math.round(performance.now() - startTime);
      sendLog(
        "FETCH_NETWORK_ERROR",
        `${method} ${urlString} failed: ${err.message || String(err)} (${duration}ms)`,
        "ERROR",
        "FRONTEND"
      );
      throw err;
    }
  };

  // Global Uncaught Exception Listener
  window.addEventListener("error", (event) => {
    logger.error("UNCAUGHT_JS_EXCEPTION", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    logger.error("UNHANDLED_PROMISE_REJECTION", {
      reason: String(event.reason?.message || event.reason),
    });
  });
}
