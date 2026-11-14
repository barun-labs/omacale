.pragma library

// Bar environments (bar.environments, Settings › Taskbar › Environments):
// named bar layouts to switch between, as Island's environments are. No
// Caelestia original. An environment is a whole bar layout (BarLayout's
// lists plus the hidden ones); switching saves the bar as it is into the
// environment being left and puts the other one's on the bar, so each
// keeps whatever was last arranged in it.
//
// State is { active, names, layouts }: layouts[i] is names[i]'s layout as
// JSON (settings.json holds lists of strings). No names at all is the
// state before the feature is used: one implicit "Default".
// Plain JS with no Qt, so tests/test-environments.js runs it under node.

var KEYS = ["start", "center", "end", "removed", "drawer", "hidden"]
var MAX = 6          // Island's limit; the bar's dots stay readable
var DEFAULT = "Default"

function snapshot(layout) {
  var out = {}
  KEYS.forEach(function(k) {
    var v = layout && layout[k]
    out[k] = Array.isArray(v) || (v && typeof v.length === "number" && typeof v !== "string")
      ? Array.prototype.filter.call(v, function(x) { return typeof x === "string" }) : []
  })
  return out
}

function parse(text) {
  try { return snapshot(JSON.parse(text)) } catch (e) { return snapshot(null) }
}

// The state with the implicit Default written out and `active` in range.
function normal(state) {
  var names = Array.prototype.slice.call((state && state.names) || []).map(String)
  var layouts = Array.prototype.slice.call((state && state.layouts) || []).map(String)
  if (!names.length) { names = [DEFAULT]; layouts = [] }
  names = names.slice(0, MAX)
  while (layouts.length < names.length) layouts.push("")
  var active = Number(state && state.active) | 0
  return { active: active >= 0 && active < names.length ? active : 0, names: names, layouts: layouts.slice(0, names.length) }
}

function names(state) { return normal(state).names }

// "next" | "prev" | an index ("0".."5") | a name (any case) -> index, or -1.
function indexOf(state, arg) {
  var s = normal(state), n = s.names.length, a = String(arg === undefined || arg === null ? "" : arg).trim()
  if (a === "next") return (s.active + 1) % n
  if (a === "prev" || a === "previous") return (s.active + n - 1) % n
  if (/^\d+$/.test(a)) return Number(a) < n ? Number(a) : -1
  for (var i = 0; i < n; i++) if (s.names[i].toLowerCase() === a.toLowerCase()) return i
  return -1
}

function stored(s, current) {
  s.layouts[s.active] = JSON.stringify(snapshot(current))
  return s
}

// Each returns { state, layout }: the state to save and, when the bar has
// to change, the layout to put on it (else null). null = nothing to do.

function switchTo(state, current, to) {
  var s = normal(state)
  if (to < 0 || to >= s.names.length || to === s.active) return null
  stored(s, current)
  s.active = to
  // An environment never arranged starts as the bar's default (empty lists).
  return { state: s, layout: parse(s.layouts[to]) }
}

function uniqueName(s, name) {
  var base = String(name || "").trim() || "Environment", n = base, i = 2
  var taken = function(x) { return s.names.some(function(y) { return y.toLowerCase() === x.toLowerCase() }) }
  while (taken(n)) n = base + " " + i++
  return n
}

// A new environment, made active. `layout` is what it starts with; without
// one it starts as a copy of the bar as it is.
function add(state, current, name, layout) {
  var s = normal(state)
  if (s.names.length >= MAX) return null
  stored(s, current)
  s.names.push(uniqueName(s, name))
  s.layouts.push(JSON.stringify(snapshot(layout || current)))
  s.active = s.names.length - 1
  return { state: s, layout: layout ? snapshot(layout) : null }
}

// The last one can't go. Removing the active one lands on its neighbour.
function remove(state, index) {
  var s = normal(state)
  if (s.names.length < 2 || index < 0 || index >= s.names.length) return null
  var wasActive = index === s.active
  s.names.splice(index, 1)
  s.layouts.splice(index, 1)
  if (index < s.active) s.active--
  else if (wasActive) s.active = Math.min(index, s.names.length - 1)
  return { state: s, layout: wasActive ? parse(s.layouts[s.active]) : null }
}

function rename(state, index, name) {
  var s = normal(state), n = String(name || "").trim()
  if (index < 0 || index >= s.names.length || !n || n === s.names[index]) return null
  var others = { names: s.names.filter(function(_, i) { return i !== index }) }
  s.names[index] = uniqueName(others, n)
  return { state: s, layout: null }
}

// A bar with only `keep` on it (in their current sections), everything else
// "Not shown": the layout a focus environment starts with.
function minimal(current, all, keep) {
  var c = snapshot(current), out = snapshot(null)
  var kept = function(id) { return keep.indexOf(id) >= 0 }
  ;["start", "center", "end"].forEach(function(k) { out[k] = c[k].filter(kept) })
  var placed = out.start.concat(out.center, out.end)
  keep.forEach(function(id) { if (placed.indexOf(id) < 0) out.end.push(id) })
  out.removed = all.filter(function(id, i) { return !kept(id) && all.indexOf(id) === i })
  return out
}
