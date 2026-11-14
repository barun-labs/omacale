// node tests/test-audio-routes.js -- unit tests for services/AudioRoutes.js.
const fs = require("fs"), vm = require("vm"), path = require("path"), assert = require("assert")
const src = fs.readFileSync(path.join(__dirname, "../services/AudioRoutes.js"), "utf8").replace(/^\.pragma.*$/m, "")
const ctx = {}
vm.runInNewContext(src + "\nthis.R = { parse, labelOf, next }", ctx)
const R = ctx.R, plain = v => JSON.parse(JSON.stringify(v))
const node = (id, props) => ({ id, type: "PipeWire:Interface:Node", info: { props } })
const link = (o, i) => ({ type: "PipeWire:Interface:Link", info: { "output-node-id": o, "input-node-id": i } })
const g = R.parse(JSON.stringify([
  { id: 53, type: "PipeWire:Interface:Device", info: { params: { EnumRoute: [{ available: "no", devices: [0] }, { available: "yes", devices: [6] }] } } },
  node(67, { "media.class": "Audio/Sink", "object.serial": 73, "node.description": "HDMI", "device.id": 53, "card.profile.device": 0 }),
  node(70, { "media.class": "Audio/Sink", "object.serial": 76, "node.description": "Headphones", "device.id": 53, "card.profile.device": 6 }),
  node(95, { "media.class": "Audio/Sink", "object.serial": 900, "node.description": "SoundCore 2" }),
  node(37, { "media.class": "Audio/Source", "object.serial": 37 }),
  node(108, { "media.class": "Stream/Output/Audio" }), node(110, { "media.class": "Stream/Input/Audio" }),
  link(108, 95), link(108, 95), link(37, 110)
]))
assert.deepStrictEqual(plain(g.sinks), [{ serial: "76", label: "Headphones" }, { serial: "900", label: "SoundCore 2" }])
assert.deepStrictEqual(plain(g.routes), { 108: "900" })
assert.strictEqual(R.labelOf(g, "900"), "SoundCore 2")
assert.strictEqual(R.labelOf(g, "1"), "")
assert.strictEqual(R.next(g, "76"), "900")
assert.strictEqual(R.next(g, "900"), "-1")
assert.strictEqual(R.next(g, "-1"), "76")
assert.strictEqual(R.next(g, undefined), "76")
assert.deepStrictEqual(plain(R.parse("junk")), { sinks: [], routes: {} })
console.log("all passed")
