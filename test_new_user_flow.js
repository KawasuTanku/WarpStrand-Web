// Headless proof of the WarpStrand-Web new-user + login flows.
// Loads the REAL <script> from index.html and drives it with DOM/WS stubs.
"use strict";
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const m = html.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/);
if (!m) { console.error("FAIL: could not extract inline script"); process.exit(1); }
const scriptBody = '"use strict";' + m[1];

// ---- stubs ----
const sent = [];
function makeEl() {
  return {
    value: "", textContent: "", disabled: false, scrollTop: 0, scrollHeight: 0,
    innerHTML: "",
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {}, focus() {}, dataset: {},
    appendChild() {}, querySelectorAll() { return []; },
  };
}
const els = {};
function getEl(id) { return els[id] || (els[id] = makeEl()); }

class FakeWS {
  constructor() { this.readyState = 1; FakeWS.last = this; }
  send(s) { sent.push(JSON.parse(s)); }
  static OPEN = 1;
}
global.WebSocket = FakeWS;
global.setInterval = () => 0;
global.document = { getElementById: getEl, createElement: makeEl };
const windowStub = {};
global.window = windowStub;
global.WARPSTRAND_CONFIG = { WS_URL: "ws://x", TITLE: "WarpStrand", PING_INTERVAL_MS: 30000 };

// Evaluate the real script body in this global scope.
// It ends with connect() which builds a FakeWS (readyState OPEN, so send works).
// Append exports of the local symbols we need to drive/inspect the flow.
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

// ---------- TEST 1: NEW USER flow ----------
console.log("\n=== TEST 1: NEW USER button flow ===");
els["li-name"].value = "Alice";
els["li-pass"].value = "s3cret";
sent.length = 0;
doLogin("create");
assert(sent.length === 1 && sent[0].line === "new", "sends 'new' as login choice");

// server prompts "New name:"
routeMsg({ ch: "prompt", field: "name", text: "New name: " });
assert(sent.length === 2 && sent[1].line === "Alice", "answers New name: with field value (Alice)");

// server prompts "New password:"
routeMsg({ ch: "prompt", field: "secret", text: "New password: " });
assert(sent.length === 3 && sent[2].line === "s3cret", "answers New password: with field value");

// server creates + sends room -> logged in
routeMsg({ ch: "room", name: "Town Square", exits: [] });
assert(els["li-msg"].textContent === "creating account…", "msg updated to creating account");
// loggedIn is a closure var; verify via behavior: a command should be allowed.
// We can't read `loggedIn` directly, but send() guards on it; test via send:
els["cmd"] && (els["cmd"].value = "look");
send("look");
assert(sent[sent.length - 1].line === "look", "after room frame, logged in (command sent, not blocked)");

// ---------- TEST 2: NEW USER name rejected (taken) ----------
console.log("\n=== TEST 2: NEW USER name already taken -> no infinite loop ===");
els["li-name"].value = "Taken";
els["li-pass"].value = "pw";
sent.length = 0;
doLogin("create");
assert(sent[0].line === "new", "create sends 'new'");
routeMsg({ ch: "prompt", field: "name", text: "New name: " });
assert(sent[1].line === "Taken", "first New name: answered with Taken");
// server says taken, re-asks New name:
const before = sent.length;
routeMsg({ ch: "prompt", field: "name", text: "New name: " });
assert(sent.length === before, "does NOT resend on rejection (no loop)");
assert(/rejected/i.test(els["li-msg"].textContent), "shows name-rejected message to user");

// ---------- TEST 3: LOGIN flow (existing user) ----------
console.log("\n=== TEST 3: ENTER login flow ===");
els["li-name"].value = "Bob";
els["li-pass"].value = "pw2";
sent.length = 0;
doLogin("login");
assert(sent.length === 1 && sent[0].line === "Bob", "login sends name (Bob)");
routeMsg({ ch: "prompt", field: "secret", text: "Password: " });
assert(sent.length === 2 && sent[1].line === "pw2", "login answers Password: with field value");
routeMsg({ ch: "room", name: "Town Square", exits: [] });
send("stats");
assert(sent[sent.length - 1].line === "stats", "login -> logged in (stats command accepted)");

// ---------- TEST 4: empty fields guarded ----------
console.log("\n=== TEST 4: empty name / password guarded ===");
els["li-name"].value = "";
els["li-pass"].value = "";
sent.length = 0;
doLogin("create");
assert(sent.length === 0 && /name/.test(els["li-msg"].textContent), "empty name blocked before send");
els["li-name"].value = "Zoe";
doLogin("create");
assert(sent.length === 0 && /password/.test(els["li-msg"].textContent), "empty password blocked before send");

console.log("\n=== TEST 5: federation chat (fed frame) renders readable ===");
// Capture appended log lines to prove the frame renders as a readable chat
// line, NOT the raw "[frame:fed] ..." JSON dump (the old catch-all branch).
const logLines = [];
function captureEl() {
  return {
    value: "", textContent: "", disabled: false, scrollTop: 0, scrollHeight: 0,
    innerHTML: "",
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {}, focus() {}, dataset: {},
    appendChild() {}, querySelectorAll() { return []; },
  };
}
// Override document.createElement to record textContent of appended lines.
const _origCreate = global.document.createElement;
global.document.createElement = function (tag) {
  const el = _origCreate(tag);
  const _set = Object.getOwnPropertyDescriptor(el, "textContent");
  Object.defineProperty(el, "textContent", {
    get() { return el.__t || ""; },
    set(v) { el.__t = v; logLines.push(v); },
  });
  return el;
};
routeMsg({ ch: "fed", kind: "global", text: "[global] Alice@zen: hello world" });
const rendered = logLines.filter((l) => String(l).includes("Alice@zen"));
assert(rendered.length === 1 && rendered[0] === "[global] Alice@zen: hello world",
       "fed global frame renders as readable chat line");
assert(!logLines.some((l) => String(l).startsWith("[frame:fed]")),
       "fed frame does NOT fall through to raw JSON dump");
// Non-global fed event handled gracefully too.
routeMsg({ ch: "fed", kind: "notify", text: "incoming mail" });
assert(logLines.some((l) => String(l) === "[fed] incoming mail"),
       "non-global fed event rendered via [fed] prefix");
console.log("\nALL TESTS PASSED");
