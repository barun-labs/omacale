.pragma library

// Which output each app is playing on, and the outputs it could move to,
// from `pw-dump` (Settings › Audio › App volumes). Quickshell's Pipewire
// service doesn't say which sink a stream is linked to, and Omarchy has no
// command for it. Plain JS with no Qt, so tests/test-audio-routes.js runs it.
//   sinks:  [{ serial, label }]   (unplugged ports left out)
//   routes: { <stream node id>: <serial of the sink it is linked to> }
// Moving a stream is `pw-metadata <id> target.object <serial>`: the serial,
// not the id, is what WirePlumber remembers for the app; "-1" clears it, and
// the app follows the default output again.
function parse(text) {
  var objs, out = { sinks: [], routes: {} }
  try { objs = JSON.parse(text) } catch (e) { return out }
  if (!Array.isArray(objs)) return out
  var nodes = {}, links = [], ports = {}
  objs.forEach(function(o) {
    if (!o || !o.info) return
    if (o.type === "PipeWire:Interface:Node") nodes[o.id] = o.info.props || {}
    else if (o.type === "PipeWire:Interface:Link") links.push(o.info)
    else if (o.type === "PipeWire:Interface:Device") ports[o.id] = (o.info.params || {}).EnumRoute || []
  })
  Object.keys(nodes).forEach(function(id) {
    var p = nodes[id]
    if (p["media.class"] !== "Audio/Sink") return
    var mine = (ports[p["device.id"]] || []).filter(function(r) { return (r.devices || []).indexOf(p["card.profile.device"]) >= 0 })
    if (mine.length && mine.every(function(r) { return r.available === "no" })) return
    out.sinks.push({ serial: String(p["object.serial"]), label: String(p["node.description"] || p["node.nick"] || p["node.name"] || id) })
  })
  out.sinks.sort(function(a, b) { return a.label.localeCompare(b.label) })
  links.forEach(function(l) {
    var from = nodes[l["output-node-id"]], to = nodes[l["input-node-id"]]
    if (from && to && from["media.class"] === "Stream/Output/Audio" && to["media.class"] === "Audio/Sink")
      out.routes[l["output-node-id"]] = String(to["object.serial"])
  })
  return out
}

function labelOf(graph, serial) {
  for (var i = 0; i < graph.sinks.length; i++) if (graph.sinks[i].serial === serial) return graph.sinks[i].label
  return ""
}

// The target after `serial` when cycling: each sink in turn, then "-1"
// (follow the default output), then round again.
function next(graph, serial) {
  var order = graph.sinks.map(function(s) { return s.serial }).concat(["-1"])
  return order[(order.indexOf(serial) + 1) % order.length]
}
