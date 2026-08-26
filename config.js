// WarpStrand-Web client configuration.
//
// The web client speaks the same WebSocket JSON protocol as the Textual TUI:
//   client -> server:  {"line": "command"}
//   server -> client:  {"ch": "hello"|"room"|"stats"|"line"|"mail"|..., ...}
//
// Point WS_URL at a running WarpStrand-Server game socket.
//   - ws://127.0.0.1:4000          (local dev, TLS off in server.yaml)
//   - wss://play.warpstrand.example (prod, behind a TLS-terminating proxy)
//
// Tip for multi-user testing: open this page in several browser tabs / private
// windows, each logs in as a different account, and you can see other players'
// "arrives"/"leaves" lines and shared rooms live -- a quick harness without
// spinning up N TUI instances.
window.WARPSTRAND_CONFIG = {
  WS_URL: "ws://127.0.0.1:4000",
  TITLE: "WarpStrand",
  // We send a periodic app-level ping so the server's idle watchdog (120s)
  // doesn't cut an idle-but-open tab.
  PING_INTERVAL_MS: 30000,
};
