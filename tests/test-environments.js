// node tests/test-environments.js -- unit tests for core/Environments.js.
// Loaded as test-layout.js loads BarLayout.js: pragma stripped, in a vm.
const fs = require("fs"), vm = require("vm"), path = require("path"), assert = require("assert")
const src = fs.readFileSync(path.join(__dirname, "../core/Environments.js"), "utf8").replace(/^\.pragma.*$/m, "")
const ctx = {}
vm.runInNewContext(src + "\nthis.E = { KEYS, MAX, snapshot, parse, normal, names, indexOf, switchTo, add, remove, rename, minimal }", ctx)
const E = ctx.E
let failed = 0
function test(name, fn) {
  try { fn(); console.log("  PASS", name) } catch (e) { failed++; console.log("  FAIL", name, "\n   ", e.message) }
}
const plain = v => JSON.parse(JSON.stringify(v))
const eq = (a, b) => assert.deepStrictEqual(plain(a), plain(b))
const EMPTY = { start: [], center: [], end: [], removed: [], drawer: [], hidden: [] }
const bar = o => Object.assign({}, EMPTY, o)
const NONE = { active: 0, names: [], layouts: [] }
const A = bar({ start: ["logo", "workspaces"], end: ["clock", "power"] })
const B = bar({ start: ["workspaces"], removed: ["logo", "clock"] })

test("unused state is one implicit Default", () => {
  eq(E.names(NONE), ["Default"])
  eq(E.names(undefined), ["Default"])
  eq(E.normal({ active: 7, names: ["a", "b"], layouts: ["x"] }), { active: 0, names: ["a", "b"], layouts: ["x", ""] })
})
test("snapshot keeps only string lists", () => {
  eq(E.snapshot({ start: ["a", 3, null, "b"], center: "x", junk: 1 }), bar({ start: ["a", "b"] }))
  eq(E.parse("not json"), EMPTY)
})
test("indexOf: next, prev, index, name", () => {
  const s = { active: 2, names: ["Default", "Work", "Focus"], layouts: [] }
  assert.strictEqual(E.indexOf(s, "next"), 0)
  assert.strictEqual(E.indexOf(s, "prev"), 1)
  assert.strictEqual(E.indexOf(s, "1"), 1)
  assert.strictEqual(E.indexOf(s, "focus"), 2)
  assert.strictEqual(E.indexOf(s, "9"), -1)
  assert.strictEqual(E.indexOf(s, "nope"), -1)
  assert.strictEqual(E.indexOf(NONE, "next"), 0)
})
test("add copies the bar and becomes active", () => {
  const r = E.add(NONE, A, "Work")
  eq(r.state.names, ["Default", "Work"])
  assert.strictEqual(r.state.active, 1)
  assert.strictEqual(r.layout, null)
  eq(E.parse(r.state.layouts[0]), A)
  eq(E.parse(r.state.layouts[1]), A)
})
test("add with a layout puts it on the bar", () => {
  const r = E.add(NONE, A, "Focus", B)
  eq(r.layout, B)
  eq(E.parse(r.state.layouts[1]), B)
})
test("names are made unique, and there are at most MAX", () => {
  let s = NONE
  for (let i = 0; i < E.MAX - 1; i++) s = E.add(s, A, "Work").state
  eq(s.names, ["Default", "Work", "Work 2", "Work 3", "Work 4", "Work 5"])
  assert.strictEqual(E.add(s, A, "More"), null)
})
test("switching saves the bar left behind and returns the other", () => {
  const s = E.add(NONE, A, "Work").state        // active: Work, both A
  const r = E.switchTo(s, B, 0)                 // the bar was rearranged to B in Work
  assert.strictEqual(r.state.active, 0)
  eq(r.layout, A)
  eq(E.parse(r.state.layouts[1]), B)
  const back = E.switchTo(r.state, A, 1)
  eq(back.layout, B)
  assert.strictEqual(E.switchTo(s, A, 1), null)   // already there
  assert.strictEqual(E.switchTo(s, A, 5), null)
})
test("an environment never arranged starts as the default bar", () => {
  const r = E.switchTo({ active: 0, names: ["a", "b"], layouts: [] }, A, 1)
  eq(r.layout, EMPTY)
})
test("remove: not the last; the active one lands on its neighbour", () => {
  assert.strictEqual(E.remove(NONE, 0), null)
  let s = E.add(E.add(NONE, A, "Work").state, A, "Focus", B).state   // Default, Work, Focus*
  const r = E.remove(s, 2)
  eq(r.state.names, ["Default", "Work"])
  assert.strictEqual(r.state.active, 1)
  eq(r.layout, A)
  const r2 = E.remove(s, 0)
  eq(r2.state.names, ["Work", "Focus"])
  assert.strictEqual(r2.state.active, 1)
  assert.strictEqual(r2.layout, null)
})
test("rename trims, ignores empty, stays unique", () => {
  const s = { active: 0, names: ["Default", "Work"], layouts: ["", ""] }
  eq(E.rename(s, 1, "  Office ").state.names, ["Default", "Office"])
  assert.strictEqual(E.rename(s, 1, "  "), null)
  assert.strictEqual(E.rename(s, 1, "Work"), null)
  eq(E.rename(s, 1, "default").state.names, ["Default", "default 2"])
})
test("minimal keeps only the named items", () => {
  const all = ["logo", "workspaces", "activeWindow", "tray", "clock", "power", "x.widget"]
  const cur = bar({ start: ["logo", "workspaces"], center: ["activeWindow"], end: ["tray", "x.widget", "clock"] })
  eq(E.minimal(cur, all, ["workspaces", "clock", "power"]),
    bar({ start: ["workspaces"], end: ["clock", "power"], removed: ["logo", "activeWindow", "tray", "x.widget"] }))
})

console.log(failed ? failed + " failed" : "all passed")
process.exit(failed ? 1 : 0)
