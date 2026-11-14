.pragma library

// Displays without hyprmoncfg (Settings › Display, services/DirectDisplay.qml):
// modes, scale, arrangement and presentation layouts as Lua for `hyprctl eval`,
// and the pins file ~/.config/hypr/displays.lua. From the lun.displays plugin,
// whose pins file and rollback state it shares. Plain JS with no Qt, so
// tests/test-direct-displays.js runs it under node.

// Only connector names, mode strings, bounded numbers and sanitized EDID
// descriptions ever reach `hyprctl eval` or the pins file, so a hostile EDID
// can't inject Lua.
var NAME_RE = /^[A-Za-z0-9-]{1,32}$/
var MODE_RE = /^\d{2,5}x\d{2,5}@\d{1,3}(\.\d{1,3})?$/
var DESC_RE = /^[A-Za-z0-9 ._()\/+-]{1,96}$/
var POS_RE = /^(auto|-?\d{1,5}x-?\d{1,5})$/

// Scales offered when they divide the resolution into whole logical pixels;
// Hyprland rejects (and nudges) any that don't.
var SCALES = [1, 1.2, 1.25, 1.333333, 1.5, 1.6, 1.666667, 1.75, 2, 2.4, 2.5, 3]

var TEXT_SIZES = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]

function isInternal(name) { return /^(eDP|LVDS|DSI)-/.test(name) }

function parseMode(mode) {
  var m = /^(\d+)x(\d+)@([\d.]+)/.exec(mode)
  return m ? { w: +m[1], h: +m[2], rr: +m[3] } : null
}

function modeLabel(mode) {
  var p = parseMode(mode)
  return p ? p.w + "×" + p.h + " · " + Math.round(p.rr) + " Hz" : mode
}

function validScale(s) { return typeof s === "number" && isFinite(s) && s >= 0.5 && s <= 4 }

// "1.333333" style: what Hyprland reports, short enough for Lua and the pins file.
function scaleText(s) { return String(Math.round(s * 1e6) / 1e6) }

function sameScale(a, b) { return Math.abs(a - b) < 0.01 }

// Scale choices for a mode, each with the desktop size it leaves you; the
// current scale is always included so the dropdown can show it.
function scaleOptions(mode, current) {
  var p = parseMode(mode)
  if (!p) return []
  var list = SCALES.filter(function(s) {
    var w = p.w / s, h = p.h / s
    return Math.abs(w - Math.round(w)) < 0.01 && Math.abs(h - Math.round(h)) < 0.01
  })
  if (validScale(current) && !list.some(function(s) { return sameScale(s, current) })) list.push(current)
  list.sort(function(a, b) { return a - b })
  return list.map(function(s) {
    return { value: scaleText(s), label: Math.round(s * 100) + "% · " + Math.round(p.w / s) + "×" + Math.round(p.h / s) }
  })
}

// `hyprctl monitors all -j` -> [{ name, description, disabled, mirrorOf, mode, scale, modes }]
// modes are deduped and sorted biggest resolution first, then fastest refresh.
function parseMonitors(text) {
  var raw
  try { raw = JSON.parse(text) } catch (e) { return [] }
  if (!Array.isArray(raw)) return []
  var out = []
  for (var i = 0; i < raw.length && out.length < 16; i++) {
    var m = raw[i]
    if (!m || !NAME_RE.test(m.name)) continue
    var seen = {}, modes = []
    var avail = Array.isArray(m.availableModes) ? m.availableModes.slice(0, 128) : []
    for (var j = 0; j < avail.length; j++) {
      var mode = String(avail[j]).replace(/Hz$/, "")
      if (!MODE_RE.test(mode) || seen[mode]) continue
      seen[mode] = true
      modes.push(mode)
    }
    modes.sort(function(a, b) {
      var x = parseMode(a), y = parseMode(b)
      return (y.w * y.h - x.w * x.h) || (y.rr - x.rr)
    })
    var current = ""
    for (var k = 0; k < modes.length && !m.disabled; k++) {
      var p = parseMode(modes[k])
      if (p.w === m.width && p.h === m.height && Math.abs(p.rr - m.refreshRate) < 0.05) { current = modes[k]; break }
    }
    var scale = validScale(m.scale) ? m.scale : 1
    var lw = Math.round((+m.width || 0) / scale), lh = Math.round((+m.height || 0) / scale)
    var rotated = +m.transform % 2 === 1
    out.push({
      name: m.name,
      x: Math.round(+m.x || 0), y: Math.round(+m.y || 0),
      w: rotated ? lh : lw, h: rotated ? lw : lh,
      description: String(m.description || "").slice(0, 96),
      disabled: !!m.disabled,
      mirrorOf: NAME_RE.test(m.mirrorOf) && m.mirrorOf !== "none" ? m.mirrorOf : "",
      mode: current,
      scale: scale,
      modes: modes
    })
  }
  return out
}

// One hl.monitor() call. opts: { mode, scale, disabled, mirror, position }
function monitorLua(name, opts) {
  if (!NAME_RE.test(name)) return ""
  if (opts.disabled) return 'hl.monitor({ output = "' + name + '", disabled = true })'
  var mode = opts.mode || "preferred"
  if (mode !== "preferred" && !MODE_RE.test(mode)) return ""
  var scale = opts.scale === undefined ? 1 : opts.scale
  if (!validScale(scale)) return ""
  var position = opts.position || "auto"
  if (!POS_RE.test(position)) return ""
  var mirror = opts.mirror && NAME_RE.test(opts.mirror) ? ', mirror = "' + opts.mirror + '"' : ""
  return 'hl.monitor({ output = "' + name + '", mode = "' + mode + '", position = "' + position + '", scale = ' + scaleText(scale) + mirror + ' })'
}

function split(monitors) {
  var internal = null, externals = []
  for (var i = 0; i < monitors.length; i++) {
    if (isInternal(monitors[i].name)) { if (!internal) internal = monitors[i] }
    else externals.push(monitors[i])
  }
  return { internal: internal, externals: externals }
}

function currentLayout(monitors) {
  var s = split(monitors)
  if (!s.internal || s.externals.length === 0) return ""
  var extOn = s.externals.some(function(m) { return !m.disabled })
  if (s.internal.disabled) return extOn ? "external" : ""
  if (!extOn) return "laptop"
  return s.externals.some(function(m) { return m.mirrorOf === s.internal.name }) ? "mirror" : "extend"
}

// Lua calls for a presentation layout. Enables come before disables so there
// is never a moment with every display off.
function layoutCommands(monitors, layout) {
  var s = split(monitors)
  if (!s.internal || s.externals.length === 0) return []
  var on = [], off = []
  var lap = s.internal, lapOn = monitorLua(lap.name, { mode: lap.mode, scale: lap.scale })
  s.externals.forEach(function(m) {
    var ext = monitorLua(m.name, { mode: m.mode, scale: m.scale })
    if (layout === "extend") on.push(ext)
    else if (layout === "mirror") on.push(monitorLua(m.name, { mode: m.mode, scale: m.scale, mirror: lap.name }))
    else if (layout === "external") on.push(ext)
    else if (layout === "laptop") off.push(monitorLua(m.name, { disabled: true }))
  })
  if (layout === "external") off.push(monitorLua(lap.name, { disabled: true }))
  else if (layout === "extend" || layout === "mirror" || layout === "laptop") on.unshift(lapOn)
  else return []
  return on.concat(off)
}

// Lua that puts every display back the way `monitors` describes it: the
// rollback a change falls back to if it isn't kept. Enables before disables.
function restoreCommands(monitors) {
  var on = [], off = []
  monitors.forEach(function(m) {
    if (m.disabled) off.push(monitorLua(m.name, { disabled: true }))
    else on.push(monitorLua(m.name, { mode: m.mode, scale: m.scale, mirror: m.mirrorOf,
      position: m.mirrorOf ? "auto" : m.x + "x" + m.y }))
  })
  return on.concat(off).filter(function(l) { return l !== "" }).join("\n")
}

// Pins file: one hl.monitor() line per remembered display, keyed by EDID
// description so mode and scale follow the display to any port.
// pins = { description: { mode, scale, position } }; position defaults to "auto".
var PIN_RE = /^hl\.monitor\(\{ output = "desc:([^"]*)", mode = "([^"]*)", position = "([^"]*)", scale = ([\d.]+) \}\)/

function parsePins(text) {
  var pins = {}
  String(text || "").split("\n").forEach(function(line) {
    var m = PIN_RE.exec(line)
    if (m && DESC_RE.test(m[1]) && MODE_RE.test(m[2]) && POS_RE.test(m[3]) && validScale(+m[4]))
      pins[m[1]] = { mode: m[2], scale: +m[4], position: m[3] }
  })
  return pins
}

function canPin(description) { return DESC_RE.test(description) }

function pinsText(pins) {
  var lines = ["-- Generated by the display settings (lun.displays, Omacale): displays pinned to a mode and", "-- scale by EDID description. Edit from the display settings, or by hand."]
  Object.keys(pins).sort().forEach(function(desc) {
    var p = pins[desc]
    var pos = p && p.position || "auto"
    if (DESC_RE.test(desc) && p && MODE_RE.test(p.mode) && POS_RE.test(pos) && validScale(p.scale))
      lines.push('hl.monitor({ output = "desc:' + desc + '", mode = "' + p.mode + '", position = "' + pos + '", scale = ' + scaleText(p.scale) + ' })')
  })
  return lines.join("\n") + "\n"
}

// ---- Arrangement (snapping adapted from corico.monitor, MIT) ----
// Rects are logical pixels, as Hyprland positions them.
var SHARED_EDGE = 200   // least shared edge, so the pointer can always cross
var ALIGN_SNAP = 80     // how close an edge or centre must be to line up (minimum;
                        // the panel passes a bigger one matching ~14 canvas px)

// Displays that take part in the arrangement: on, with a mode, not mirroring.
function arranged(monitors) {
  return monitors.filter(function(m) { return !m.disabled && !m.mirrorOf && m.mode && m.w > 0 && m.h > 0 })
}

function boundsOf(rects) {
  if (!rects.length) return { x: 0, y: 0, w: 0, h: 0 }
  var l = Infinity, t = Infinity, r = -Infinity, b = -Infinity
  rects.forEach(function(q) { l = Math.min(l, q.x); t = Math.min(t, q.y); r = Math.max(r, q.x + q.w); b = Math.max(b, q.y + q.h) })
  return { x: l, y: t, w: r - l, h: b - t }
}

function overlaps(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h }

// Where along a neighbour's side to sit: keep enough shared edge, and line up
// with the neighbour's ends or centre when close.
function alongSide(value, own, start, size, snap) {
  var shared = Math.min(SHARED_EDGE, own, size)
  var best = Math.max(start - own + shared, Math.min(start + size - shared, value)), bestD = Math.max(ALIGN_SNAP, snap || 0)
  ;[start, start + size - own, start + (size - own) / 2].forEach(function(stop) {
    var d = Math.abs(stop - value)
    if (d < bestD) { best = stop; bestD = d }
  })
  return Math.round(best)
}

// Nearest spot touching another display without covering any: a gap would
// strand the pointer, an overlap would hide part of a screen.
function snapPosition(rect, others, snap) {
  var best = { x: rect.x, y: rect.y }, bestD = Infinity
  function consider(x, y) {
    var c = { x: x, y: y, w: rect.w, h: rect.h }
    if (others.some(function(o) { return overlaps(c, o) })) return
    var d = Math.hypot(x - rect.x, y - rect.y)
    if (d < bestD) { best = { x: x, y: y }; bestD = d }
  }
  others.forEach(function(o) {
    var ay = alongSide(rect.y, rect.h, o.y, o.h, snap), ax = alongSide(rect.x, rect.w, o.x, o.w, snap)
    consider(o.x - rect.w, ay); consider(o.x + o.w, ay)
    consider(ax, o.y - rect.h); consider(ax, o.y + o.h)
  })
  return best
}

// Move display `name` towards (x, y), snap it, shift everything to start at
// 0x0. -> { lines: Lua calls, pins: [{ description, mode, scale, position }] },
// or null if nothing moves.
function arrangeCommands(monitors, name, x, y, snap) {
  var list = arranged(monitors).map(function(m) { return Object.assign({}, m) })
  var me = list.filter(function(m) { return m.name === name })[0]
  if (!me || list.length < 2) return null
  var spot = snapPosition({ x: x, y: y, w: me.w, h: me.h }, list.filter(function(m) { return m !== me }), snap)
  me.x = spot.x; me.y = spot.y
  var b = boundsOf(list)
  list.forEach(function(m) { m.x -= b.x; m.y -= b.y })
  var orig = {}
  monitors.forEach(function(m) { orig[m.name] = m })
  if (list.every(function(m) { return orig[m.name].x === m.x && orig[m.name].y === m.y })) return null
  return {
    lines: list.map(function(m) { return monitorLua(m.name, { mode: m.mode, scale: m.scale, position: m.x + "x" + m.y }) }),
    pins: list.filter(function(m) { return canPin(m.description) })
      .map(function(m) { return { description: m.description, mode: m.mode, scale: m.scale, position: m.x + "x" + m.y } })
  }
}

// `omarchy-display-text-size` output -> px, or 0 if unreadable.
function parseTextSize(text) {
  var m = /text size:\s*(\d+)\s*px/.exec(String(text || ""))
  var n = m ? +m[1] : 0
  return n >= 9 && n <= 20 ? n : 0
}
