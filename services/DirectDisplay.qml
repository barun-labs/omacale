pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io
import ".."
import "DirectDisplays.js" as Model

// Settings › Display without hyprmoncfg: resolution, refresh rate, scale,
// arrangement and presentation layouts, straight through `hyprctl eval`
// (services/DirectDisplays.js, from the lun.displays plugin). No Caelestia
// original, and Omarchy has no command for modes or arrangement.
//
// Every change rolls itself back after `keepSeconds` unless it is kept
// (scripts/display-apply.sh, detached so it outlives a shell reload), so a
// mode the screen can't show undoes itself. A change lasts until the next
// Hyprland config reload; "Remember" pins a display's mode, scale and
// position by EDID description in ~/.config/hypr/displays.lua, which the
// user loads from monitors.lua. State and pins files are lun.displays's own,
// so its SUPER+CTRL+ALT+M rescue and its panel keep working beside this.
QtObject {
  id: root

  readonly property int keepSeconds: 15
  readonly property string scripts: Qt.resolvedUrl("../scripts/").toString().replace(/^file:\/\//, "")
  readonly property string stateFile: Quickshell.env("XDG_RUNTIME_DIR") + "/lun.displays.restore"

  property var monitors: []
  property var pins: ({})
  readonly property string layout: Model.currentLayout(monitors)

  // A change waiting for Keep: seconds left, and the pins to save if kept.
  property int pendingSeconds: 0
  property var pendingPins: []
  readonly property bool pending: pendingSeconds > 0

  function refresh() {
    if (!listProc.running) listProc.running = true
    if (!pinsReadProc.running) pinsReadProc.running = true
  }

  // Apply with rollback. The first change in a chain snapshots the current
  // (confirmed) layout; follow-ups restart the timer but keep that snapshot.
  function apply(luaLines, pins) {
    const code = luaLines.filter(l => l !== "").join("\n")
    if (code === "") return
    const restore = root.pending ? "" : Model.restoreCommands(root.monitors)
    if (!root.pending && restore === "") return
    Quickshell.execDetached(["sh", root.scripts + "display-apply.sh", root.stateFile,
      String(root.keepSeconds), String(Date.now()), code, restore])
    root.pendingPins = (root.pending ? root.pendingPins : []).concat(pins || [])
    root.pendingSeconds = root.keepSeconds
    settle.restart()
  }
  // The pins are saved only if the rollback was still pending, i.e. the
  // change really went live and hasn't already been undone.
  function keep() {
    keepProc.pins = root.pendingPins
    keepProc.running = true
    root.pendingPins = []
    root.pendingSeconds = 0
  }
  function revert() {
    revertProc.running = true
    root.pendingPins = []
    root.pendingSeconds = 0
  }

  function savePins(next) {
    root.pins = next
    pinsWriteProc.command = ["sh", "-c",
      'f="$HOME/.config/hypr/displays.lua"; printf "%s" "$1" > "$f.tmp" && mv "$f.tmp" "$f"',
      "sh", Model.pinsText(next)]
    pinsWriteProc.running = true
  }
  // A pinned position, so a mode or scale change doesn't put one display on
  // "auto" next to explicit ones (Hyprland then moves it).
  function pinnedPosition(m) {
    const p = root.pins[m.description]
    return !m.mirrorOf && p && p.position ? p.position : "auto"
  }
  function isPinned(m) { return !!root.pins[m.description] }

  function setMode(m, mode) {
    apply([Model.monitorLua(m.name, { mode: mode, scale: m.scale, mirror: m.mirrorOf, position: pinnedPosition(m) })],
      isPinned(m) ? [{ description: m.description, mode: mode, scale: m.scale }] : null)
  }
  function setScale(m, scale) {
    apply([Model.monitorLua(m.name, { mode: m.mode, scale: scale, mirror: m.mirrorOf, position: pinnedPosition(m) })],
      isPinned(m) ? [{ description: m.description, mode: m.mode, scale: scale }] : null)
  }
  function turnOn(m) { apply([Model.monitorLua(m.name, { mode: "preferred", scale: m.scale })], null) }
  function setLayout(layout) { apply(Model.layoutCommands(root.monitors, layout), null) }
  // A tile dropped at logical (x, y). Kept, every arranged display is pinned
  // with its position: one explicit position beside "auto" ones wouldn't
  // hold after a config reload.
  function moveDisplay(name, x, y, snap) {
    const r = Model.arrangeCommands(root.monitors, name, x, y, snap)
    if (r) apply(r.lines, r.pins)
    else settle.restart()
  }
  function setPinned(m, on) {
    const next = Object.assign({}, root.pins)
    if (on && m.mode) next[m.description] = { mode: m.mode, scale: m.scale, position: pinnedPosition(m) }
    else delete next[m.description]
    savePins(next)
  }

  property Timer tick: Timer {
    interval: 1000
    repeat: true
    running: root.pendingSeconds > 0
    onTriggered: {
      root.pendingSeconds--
      // Not kept in time: display-apply.sh has put the old layout back.
      if (root.pendingSeconds === 0) { root.pendingPins = []; root.settle.restart() }
    }
  }
  // Monitor changes settle asynchronously; re-read once they have.
  property Timer settle: Timer { interval: 700; onTriggered: root.refresh() }

  property Process listProc: Process {
    command: ["hyprctl", "monitors", "all", "-j"]
    stdout: StdioCollector { waitForEnd: true; onStreamFinished: root.monitors = Model.parseMonitors(text) }
  }
  property Process pinsReadProc: Process {
    command: ["sh", "-c", 'cat "$HOME/.config/hypr/displays.lua" 2>/dev/null']
    stdout: StdioCollector { waitForEnd: true; onStreamFinished: root.pins = Model.parsePins(text) }
  }
  property Process keepProc: Process {
    property var pins: []
    command: ["sh", "-c", '[ -f "$1.token" ] && rm -f "$1" "$1.token" && echo kept', "sh", root.stateFile]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        if (text.trim() === "kept" && root.keepProc.pins.length) {
          // Merge, so a mode change keeps a pinned position and vice versa.
          const next = Object.assign({}, root.pins)
          root.keepProc.pins.forEach(p => {
            const cur = Object.assign({}, next[p.description] || {}, { mode: p.mode, scale: p.scale })
            if (p.position) cur.position = p.position
            next[p.description] = cur
          })
          root.savePins(next)
        }
        root.keepProc.pins = []
        root.settle.restart()
      }
    }
  }
  property Process revertProc: Process {
    command: ["sh", root.scripts + "display-revert.sh", root.stateFile]
    onExited: root.settle.restart()
  }
  property Process pinsWriteProc: Process {}
}
