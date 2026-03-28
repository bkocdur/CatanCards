/* Set window.__CATAN_WS__ before this file (e.g. in index.html) for production, e.g. wss://your-ws-host
   If unset, localhost uses the dev server on port 3210; other hosts use offline-only mode. */
(function () {
  if (typeof window.__CATAN_WS__ !== "string") {
    var h = location.hostname;
    if (h === "localhost" || h === "127.0.0.1") {
      window.__CATAN_WS__ = "ws://127.0.0.1:3210";
    } else {
      window.__CATAN_WS__ = "";
    }
  }
})();
