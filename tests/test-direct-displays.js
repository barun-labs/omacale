// node tests/test-direct-displays.js -- unit tests for services/DirectDisplays.js.
const fs = require("fs"), vm = require("vm"), assert = require("assert")
const M = {}
vm.runInNewContext(fs.readFileSync(__dirname + "/../services/DirectDisplays.js", "utf8").replace(/^\.pragma.*$/m, ""), M)

const raw = [
  { name: "eDP-1", description: "LG Display", disabled: true, mirrorOf: "none", width: 1920, height: 1200, refreshRate: 60.001,
    availableModes: ["1920x1200@60.00Hz", "1920x1200@40.00Hz"] },
  { name: "DP-1", description: "CMT GA271 CMI240200508", disabled: false, mirrorOf: "none", width: 2560, height: 1440, refreshRate: 99.946, scale: 1.25,
    availableModes: ["2560x1440@59.95Hz", "2560x1440@99.95Hz", "1920x1080@60.00Hz", "1920x1080@60.00Hz", "1280x720@120.00Hz", "evil\"})os.exit()--"] },
]
const mons = M.parseMonitors(JSON.stringify(raw))

assert.deepStrictEqual(Array.from(mons[1].modes), ["2560x1440@99.95", "2560x1440@59.95", "1920x1080@60.00", "1280x720@120.00"])
assert.strictEqual(mons[1].mode, "2560x1440@99.95")
assert.strictEqual(mons[0].mode, "")                       // disabled -> no current mode
assert.strictEqual(M.currentLayout(mons), "external")
assert.strictEqual(M.modeLabel("2560x1440@99.95"), "2560×1440 · 100 Hz")

// mirror: laptop on (preferred, it has no current mode) first, external mirrors it
assert.deepStrictEqual(Array.from(M.layoutCommands(mons, "mirror")), [
  'hl.monitor({ output = "eDP-1", mode = "preferred", position = "auto", scale = 1 })',
  'hl.monitor({ output = "DP-1", mode = "2560x1440@99.95", position = "auto", scale = 1.25, mirror = "eDP-1" })',
])
// laptop only: enable before disable
const lap = M.layoutCommands(mons, "laptop")
assert.ok(lap[0].includes('"eDP-1"') && lap[1].includes("disabled = true"))
assert.deepStrictEqual(Array.from(M.layoutCommands(mons, "bogus")), [])
assert.deepStrictEqual(Array.from(M.layoutCommands([mons[1]], "mirror")), [])  // no laptop panel

// rollback snapshot: enabled displays first, disabled last
assert.strictEqual(M.restoreCommands(mons), [
  'hl.monitor({ output = "DP-1", mode = "2560x1440@99.95", position = "0x0", scale = 1.25 })',
  'hl.monitor({ output = "eDP-1", disabled = true })',
].join("\n"))

// injection guards
assert.strictEqual(M.monitorLua('DP-1"})', { mode: "preferred" }), "")
assert.strictEqual(M.monitorLua("DP-1", { mode: '1x1@1"})' }), "")
assert.strictEqual(M.canPin('x" }) os.exit() --'), false)

// pins round-trip with scale, bad lines dropped
const pins = M.parsePins(M.pinsText({ "Epson Projector": { mode: "1920x1080@60.00", scale: 1.333333 }, 'bad"': { mode: "1x1@1", scale: 1 } })
  + 'hl.monitor({ output = "desc:x", mode = "nope", position = "auto", scale = 1 })\n')
assert.deepStrictEqual(JSON.parse(JSON.stringify(pins)), { "Epson Projector": { mode: "1920x1080@60.00", scale: 1.333333, position: "auto" } })

// scales: only ones that divide the resolution cleanly, plus the current one
const labels = M.scaleOptions("2560x1440@99.95", 1).map(o => o.value)
assert.deepStrictEqual(Array.from(labels), ["1", "1.25", "1.333333", "1.6", "1.666667", "2", "2.5"])
assert.strictEqual(M.scaleOptions("1920x1080@60", 1).find(o => o.value === "1.5").label, "150% · 1280×720")
assert.ok(M.scaleOptions("2560x1440@99.95", 1.5).some(o => o.value === "1.5"))   // odd current scale kept
assert.strictEqual(M.monitorLua("DP-1", { mode: "preferred", scale: 99 }), "")    // out-of-range scale rejected
assert.strictEqual(M.monitorLua("DP-1", { mode: "preferred", scale: NaN }), "")

// arrangement: laptop 1920x1200 at 0x0, monitor 2560x1440 to its right
const two = M.parseMonitors(JSON.stringify([
  { name: "eDP-1", description: "LG Display", x: 0, y: 0, width: 1920, height: 1200, refreshRate: 60, scale: 1, availableModes: ["1920x1200@60.00Hz"] },
  { name: "DP-1", description: "CMT GA271", x: 1920, y: 0, width: 2560, height: 1440, refreshRate: 100, scale: 1, availableModes: ["2560x1440@100.00Hz"] },
]))
assert.deepStrictEqual([two[1].w, two[1].h], [2560, 1440])
assert.strictEqual(M.arranged(two).length, 2)
// drop DP-1 roughly left of the laptop, a bit low: snaps flush left, tops aligned, shifted to 0x0
const a = M.arrangeCommands(two, "DP-1", -2500, 40)
assert.deepStrictEqual(Array.from(a.lines), [
  'hl.monitor({ output = "eDP-1", mode = "1920x1200@60.00", position = "2560x0", scale = 1 })',
  'hl.monitor({ output = "DP-1", mode = "2560x1440@100.00", position = "0x0", scale = 1 })',
])
assert.strictEqual(a.pins[1].position, "0x0")
// drop on top of the laptop: pushed to the nearest free edge, never overlapping
const b = M.arrangeCommands(two, "DP-1", 100, 100)
assert.ok(b && b.lines.every(l => !l.includes("100x100")))
assert.strictEqual(M.arrangeCommands(two, "DP-1", 1925, 5), null)     // snaps back to where it was
// strong alignment: DP-1 dropped above the laptop, 70px off centre -> centred
// (laptop 1920 wide, DP-1 2560: centred x = -320, then shifted to 0x0)
const c = M.arrangeCommands(two, "DP-1", -250, -1500, 450)
assert.deepStrictEqual(Array.from(c.lines), [
  'hl.monitor({ output = "eDP-1", mode = "1920x1200@60.00", position = "320x1440", scale = 1 })',
  'hl.monitor({ output = "DP-1", mode = "2560x1440@100.00", position = "0x0", scale = 1 })',
])
// without the bigger pull it stays where dropped
assert.ok(M.arrangeCommands(two, "DP-1", -150, -1500).lines[0].includes('"150x1440"'))   // 150 from start, 170 from centre

// pins keep position; a pin file with bad position is dropped
const pp = M.parsePins(M.pinsText({ "CMT GA271": { mode: "2560x1440@100.00", scale: 1, position: "-2560x0" } }))
assert.strictEqual(pp["CMT GA271"].position, "-2560x0")
assert.deepStrictEqual(Object.keys(M.parsePins('hl.monitor({ output = "desc:x", mode = "1x1@1", position = "0x0;os", scale = 1 })')), [])
assert.strictEqual(M.monitorLua("DP-1", { mode: "preferred", position: '0x0", x = "' }), "")

// text size
assert.strictEqual(M.parseTextSize("text size: 14 px\ngtk text-scaling-factor: 1.1"), 14)
assert.strictEqual(M.parseTextSize("text size: 99 px"), 0)

console.log("ok")
