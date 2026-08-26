# WarpStrand-Web

A no-build web client for [WarpStrand-Server](https://github.com/KawasuTanku/WarpStrand-Server).
It speaks the same WebSocket + JSON protocol as the Textual TUI, so it needs
**zero** server changes to connect — just point it at a running game socket.

It also doubles as a lightweight **multi-user test harness**: open it in several
browser tabs / private windows, log in as different accounts, and watch shared
rooms, "arrives"/"leaves", and live stats update across sessions without spinning
up N TUI instances.

## Protocol (what the client sends/receives)

```
client → server:  {"line": "north"}
server → client:
   {"ch":"hello", "world_name":..., "federated":bool, "lines":[...]}
   {"ch":"room",  "name":..., "description":..., "exits":[...], "here":[...], "creatures":[...]}
   {"ch":"stats", "hp":..., "maxhp":..., "room":..., "level":..., ...}
   {"ch":"line",  "text": "..."}
   {"ch":"mail",  "event": "summary", ...}
```

Login is line-interactive over the same socket: connect → send name → server
prompts `Password:` → send password → a `room` frame means you're in.

## Run it locally

1. Start a WarpStrand-Server (default game port `4000`, standalone is fine):
   ```bash
   cd WarpStrand-Server
   WARPSTRAND_CONFIG=warpstrand_server/seed_config.yaml .venv-srv/bin/python -m warpstrand_server
   ```
2. Serve these static files (any static server works). From this repo:
   ```bash
   python3 -m http.server 8080
   ```
3. Open <http://localhost:8080/> and log in (or `new` to create an account).

By default `config.js` points `WS_URL` at `ws://127.0.0.1:4000`. Edit it to
point at a `wss://` endpoint when hosting behind a TLS-terminating reverse proxy
(Caddy/Nginx), which is also where you'd expose the game socket as a path like
`/game` if you want proxy routing.

## Files

- `index.html` — the whole client (inline CSS + JS, no dependencies, no build).
- `config.js` — `WS_URL`, display title, ping interval.

## Notes / open items

- **Origin allow-list (recommended before public hosting):** the server does not
  yet validate the WebSocket `Origin` header. Add a check in
  `_ws_handler` (server.py) so a rogue site can't embed the game and harvest
  passwords via a hidden socket. Until then, only serve over trusted networks.
- The admin TUI uses a separate admin socket — never expose that to the web.
- The wire protocol is the contract between this client and the server. If you
  add a new `ch` type on the server, surface/handle it here (unknown frames are
  printed to the Log pane so drift is visible rather than silent).
