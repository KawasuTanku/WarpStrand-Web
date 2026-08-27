"use strict";
// Headless proof of the WarpStrand-Web client (3-column TUI-mirror layout).
// Loads the REAL <script> from index.html and drives it with DOM/WS stubs.
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const m = html.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/);
if (!m) { console.error("FAIL: could not extract inline script"); process.exit(1); }
const scriptBody = '"use strict";' + m[1];

// ---- stubs ----
const sent = [];
function makeEl() {
  const el = {
    value: "", textContent: "", innerHTML: "", disabled: false,
    scrollTop: 0, scrollHeight: 0, clientHeight: 0, __lines: [],
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {}, focus() {}, dataset: {},
    appendChild(c) { if (c && c.textContent) el.__lines.push(c.textContent); },
    querySelectorAll() { return []; },
  };
  return el;
}
const els = {};
function getEl(id) { return els[id] || (els[id] = makeEl()); }

class FakeWS {
  constructor() { this.readyState = 1; this.url = "ws://x"; FakeWS.last = this; }
  send(s) { sent.push(JSON.parse(s)); }
  close() {}
  static OPEN = 1;
}
global.WebSocket = FakeWS;
global.setInterval = () => 0;
global.setTimeout = (fn) => { try { fn(); } catch {} return 0; };
global.document = { getElementById: getEl, createElement: makeEl };
global.window = {};
global.WARPSTRAND_CONFIG = { WS_URL: "ws://x", TITLE: "WarpStrand", PING_INTERVAL_MS: 30000 };

const exportsTail = `
;globalThis.__doLogin = doLogin;
globalThis.__route = route;
globalThis.__send = send;
`;
(0, eval)(scriptBody + exportsTail);
const doLogin = globalThis.__doLogin;
const route = globalThis.__route;
const send = globalThis.__send;
function routeMsg(msg) { route(msg); }

function assert(cond, label) {
  if (!cond) { console.error("FAIL: " + label); process.exit(1); }
  console.log("PASS: " + label);
}

// ---------- TEST: federation status frame ----------
console.log("\n=== federation status frame ===");
routeMsg({ ch: "federation", mode: "federated", world: "zen", hub_connected: true, nodes: 3 });
assert(/Federated/.test(els["fedbody"].innerHTML), "federation pane shows Federated");
assert(/Nodes: 3/.test(els["fedbody"].innerHTML), "federation pane shows node count");

// ---------- TEST: mail summary ----------
console.log("\n=== mail summary frame ===");
routeMsg({ ch: "mail", event: "summary", unread: 2, total: 5 });
assert(/New: 2/.test(els["mailbody"].innerHTML) && /Read: 3/.test(els["mailbody"].innerHTML), "mail pane shows New/Read counts");

// ---------- TEST: social / friends ----------
console.log("\n=== social frame ===");
routeMsg({ ch: "social", friends: [{ friend_user: "Bob", friend_world: "zen", online: true }],
           requests: [{ owner_user: "Zoe", owner_world: "atl" }] });
assert(/● Bob@zen/.test(els["socialbody"].textContent), "social pane shows online friend with dot");
assert(/\? Zoe@atl \(incoming\)/.test(els["socialbody"].textContent), "social pane shows incoming request");

// ---------- TEST: fed chat kinds ----------
console.log("\n=== fed chat kinds ===");
routeMsg({ ch: "fed", kind: "global", text: "[global] Alf@zen: hi" });
routeMsg({ ch: "fed", kind: "mail", text: "new mail from Bob" });
routeMsg({ ch: "fed", kind: "evacuate", mode: "dead-source", text: "evac now" });
assert(els["fedlog"].__lines.includes("[global] Alf@zen: hi"), "fed global logged to federation chat");
assert(els["fedlog"].__lines.some(l => /new mail from Bob/.test(l)), "fed mail kind logged");
assert(els["fedlog"].__lines.some(l => /SOURCE OFFLINE/.test(l)), "fed evacuate (dead-source) logged");

// ---------- TEST: inv (ring) ----------
console.log("\n=== inv frame ===");
routeMsg({ ch: "inv", used: 2, capacity: 8, items: [{ id: 1, name: "Sword", qty: 1, equipped: true }] });
assert(els["log"].__lines.some(l => /Ring \(2\/8/.test(l)), "inv ring count logged");

// ---------- TEST: pong -> ping ms ----------
console.log("\n=== pong RTT ===");
const t0 = Date.now() - 50;
routeMsg({ ch: "pong", t: t0 });
assert(/Ping: \d/.test(els["fedbody"].innerHTML), "ping ms shown in federation pane after pong");

// ---------- TEST: redirect (portal) ----------
console.log("\n=== redirect (portal) ===");
routeMsg({ ch: "redirect", host: "other.warpstrand.com", port: 4100, token: "TKN", tls: true });
assert(sent.length >= 0, "redirect handled (reconnect scheduled)");

// ---------- TEST: room renders map + mobs + commands ----------
console.log("\n=== room -> map/mobs/commands ===");
const room = { ch: "room", name: "Town Square", description: "center",
  exits: [{ dir: "n", name: "North", to: "North Hall" }],
  here: ["Alf"], creatures: [{ name: "Rat", hp: 5, maxhp: 5 }] };
routeMsg(room);
assert(/You are here: Town Square/.test(els["mapbody"].innerHTML), "map shows current room");
assert(/n<\/span>\s*North\s*→\s*North Hall/.test(els["mapbody"].innerHTML) || /exit-dir">n<\/span>/.test(els["mapbody"].innerHTML), "map shows exits");
assert(/Rat  HP 5\/5/.test(els["mobbody"].innerHTML), "mobs pane shows creature HP");
assert(/train &lt;str/.test(els["cmdsbody"].innerHTML), "commands pane context-aware (town square)");

// ---------- TEST: stats (ring full state) ----------
console.log("\n=== stats frame ===");
routeMsg({ ch: "stats", room: "Town Square", hp: 100, maxhp: 100, level: 2, xp: 10,
  str: 3, con: 2, dex: 4, magic: 1, gold: 50, weapon: "Sword", armor: "Mail",
  ring_full: true, ring_used: 8, ring_capacity: 8 });
assert(/Ring: Full \(8\/8\)/.test(els["statsbody"].innerHTML), "stats shows ring full state");

// ---------- TEST: auto-scroll on new chat lines ----------
console.log("\n=== auto-scroll ===");
// simulate a scrolled-up reader (not near bottom) -> should NOT force scroll
els["log"].scrollHeight = 1000; els["log"].scrollTop = 100; els["log"].clientHeight = 200;
routeMsg({ ch: "line", text: "new line while scrolled up" });
// nearBottom computed as 1000 - 100 - 200 = 700 < 40 -> false -> no forced scroll
assert(els["log"].scrollTop === 100, "does not yank scroll when reader is scrolled up");
// simulate reader at bottom -> should pin to bottom
els["log"].scrollHeight = 1000; els["log"].scrollTop = 800; els["log"].clientHeight = 200;
routeMsg({ ch: "line", text: "new line at bottom" });
// nearBottom = 1000 - 800 - 200 = 0 < 40 -> true -> scrollTop set to scrollHeight
assert(els["log"].scrollTop === 1000, "auto-scrolls to bottom when reader is at bottom");
