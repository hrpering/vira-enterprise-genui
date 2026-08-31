if (/^\/live\/[^/]+$/.test(window.location.pathname)) {
  await import("./live-data-app.js");
} else {
  await import("./main.js");
}
