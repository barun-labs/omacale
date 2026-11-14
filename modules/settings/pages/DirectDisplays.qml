import QtQuick
import QtQuick.Layouts
import "../../.."
import "../../../services/DirectDisplays.js" as Model

// Settings › Display while hyprmoncfg isn't managing the displays: drag to
// arrange, presentation layout, and each display's resolution, refresh rate,
// scale and "Remember" (services/DirectDisplay.qml). Every change waits for
// Keep and goes back by itself otherwise. No Caelestia original; Nexus rows.
ColumnLayout {
  id: root
  property var settings
  spacing: Tk.spacing.extraSmall / 2
  Component.onCompleted: DirectDisplay.refresh()

  readonly property var arranged: Model.arranged(DirectDisplay.monitors)

  // ---- keep or go back
  ConnectedRect {
    Layout.fillWidth: true
    Layout.bottomMargin: Tk.spacing.small
    first: true
    last: true
    visible: DirectDisplay.pending
    color: Colours.m3primaryContainer
    implicitHeight: kl.implicitHeight + Tk.padding.medium * 2
    RowLayout {
      id: kl
      anchors.left: parent.left; anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
      anchors.leftMargin: Tk.padding.largeIncreased; anchors.rightMargin: Tk.padding.medium
      spacing: Tk.spacing.medium
      MIcon { text: "timer"; size: Tk.iconSize.medium; color: Colours.m3onPrimaryContainer }
      RowLabel {
        Layout.fillWidth: true
        text: "Keep these display settings?"
        subtext: "Going back in " + DirectDisplay.pendingSeconds + (DirectDisplay.pendingSeconds === 1 ? " second" : " seconds")
      }
      IconTextButton {
        type: "text"; isRound: true; icon: "undo"; text: "Go back"
        fontSize: Tk.body.small
        onClicked: DirectDisplay.revert()
      }
      IconTextButton {
        type: "filled"; isRound: true; icon: "check"; text: "Keep"
        fontSize: Tk.body.small
        onClicked: DirectDisplay.keep()
      }
    }
  }

  // ---- drag to arrange
  SectionHeader { row: ({ text: "Arrange" }); first: true; visible: root.arranged.length > 1 }
  ConnectedRect {
    Layout.fillWidth: true
    first: true
    last: true
    visible: root.arranged.length > 1
    implicitHeight: Tk.px(220)
    Item {
      id: canvas
      anchors.fill: parent
      anchors.margins: Tk.padding.large
      readonly property var displays: root.arranged
      readonly property var bounds: Model.boundsOf(displays)
      // The layout takes 70% of the card, leaving room to drag around it.
      readonly property real fit: bounds.w > 0 && bounds.h > 0 ? Math.min(width * 0.7 / bounds.w, height * 0.7 / bounds.h) : 1
      readonly property real originX: (width - bounds.w * fit) / 2 - bounds.x * fit
      readonly property real originY: (height - bounds.h * fit) / 2 - bounds.y * fit
      readonly property real alignSnap: 14 / fit
      property var snapPreview: null

      // Where the dragged display will land.
      Rectangle {
        visible: !!canvas.snapPreview
        x: visible ? canvas.originX + canvas.snapPreview.x * canvas.fit : 0
        y: visible ? canvas.originY + canvas.snapPreview.y * canvas.fit : 0
        width: visible ? canvas.snapPreview.w * canvas.fit : 0
        height: visible ? canvas.snapPreview.h * canvas.fit : 0
        radius: Tk.rounding.small
        color: "transparent"
        border.width: 2
        border.color: Colours.m3primary
      }

      Repeater {
        model: canvas.displays
        Rectangle {
          id: tile
          required property var modelData
          property real dragX: 0
          property real dragY: 0
          property bool held: false
          x: canvas.originX + modelData.x * canvas.fit + dragX
          y: canvas.originY + modelData.y * canvas.fit + dragY
          z: held ? 2 : 0
          width: modelData.w * canvas.fit
          height: modelData.h * canvas.fit
          radius: Tk.rounding.small
          color: held ? Colours.m3primaryContainer : Colours.m3surfaceContainerHighest
          border.width: held ? 2 : 1
          border.color: held ? Colours.m3primary : Colours.m3outlineVariant

          ColumnLayout {
            anchors.centerIn: parent
            width: parent.width - Tk.padding.small * 2
            spacing: 0
            MText {
              Layout.fillWidth: true
              horizontalAlignment: Text.AlignHCenter
              text: tile.modelData.name
              weight: Font.Medium
              elide: Text.ElideRight
              color: tile.held ? Colours.m3onPrimaryContainer : Colours.m3onSurface
            }
            MText {
              Layout.fillWidth: true
              horizontalAlignment: Text.AlignHCenter
              text: Model.modeLabel(tile.modelData.mode).split(" · ")[0]
              font.pointSize: Tk.body.small
              elide: Text.ElideRight
              color: tile.held ? Colours.m3onPrimaryContainer : Colours.m3outline
            }
          }

          MouseArea {
            anchors.fill: parent
            preventStealing: true
            cursorShape: tile.held ? Qt.ClosedHandCursor : Qt.OpenHandCursor
            property point grab
            function drop() {
              return { x: tile.modelData.x + Math.round(tile.dragX / canvas.fit),
                       y: tile.modelData.y + Math.round(tile.dragY / canvas.fit),
                       w: tile.modelData.w, h: tile.modelData.h }
            }
            function release() { tile.held = false; tile.dragX = 0; tile.dragY = 0; canvas.snapPreview = null }
            onPressed: mouse => { grab = mapToItem(canvas, mouse.x, mouse.y) }
            onPositionChanged: mouse => {
              const pt = mapToItem(canvas, mouse.x, mouse.y)
              const dx = pt.x - grab.x, dy = pt.y - grab.y
              if (!tile.held && Math.hypot(dx, dy) < 4) return
              tile.held = true
              const homeX = canvas.originX + tile.modelData.x * canvas.fit
              const homeY = canvas.originY + tile.modelData.y * canvas.fit
              tile.dragX = Math.max(-homeX, Math.min(canvas.width - tile.width - homeX, dx))
              tile.dragY = Math.max(-homeY, Math.min(canvas.height - tile.height - homeY, dy))
              const d = drop()
              const spot = Model.snapPosition(d, canvas.displays.filter(o => o.name !== tile.modelData.name), canvas.alignSnap)
              canvas.snapPreview = { x: spot.x, y: spot.y, w: d.w, h: d.h }
            }
            onReleased: {
              if (!tile.held) return
              const d = drop(), name = tile.modelData.name
              release()
              DirectDisplay.moveDisplay(name, d.x, d.y, canvas.alignSnap)
            }
            onCanceled: release()
          }
        }
      }
    }
  }

  // ---- laptop + external displays
  RowSelect {
    Layout.fillWidth: true
    Layout.topMargin: Tk.spacing.small
    first: true
    last: true
    visible: DirectDisplay.layout !== ""
    settings: root.settings
    row: ({ label: "Layout", icon: "cast", subtext: "How the laptop screen and the external displays share the desktop", options: [
      { value: "extend", label: "Extend", icon: "splitscreen_right" },
      { value: "mirror", label: "Mirror", icon: "content_copy" },
      { value: "laptop", label: "Laptop only", icon: "laptop_chromebook" },
      { value: "external", label: "External only", icon: "desktop_windows" }
    ] })
    value: DirectDisplay.layout
    onPicked: v => { if (v !== DirectDisplay.layout) DirectDisplay.setLayout(v) }
  }

  // ---- each display
  Repeater {
    model: DirectDisplay.monitors
    ColumnLayout {
      id: mon
      required property var modelData
      readonly property var m: modelData
      Layout.fillWidth: true
      spacing: Tk.spacing.extraSmall / 2

      SectionHeader { row: ({ text: mon.m.name + (mon.m.description ? "  ·  " + mon.m.description : "") }) }

      ConnectedRect {
        Layout.fillWidth: true
        first: true
        last: true
        visible: mon.m.disabled
        implicitHeight: ol.implicitHeight + Tk.padding.medium * 2
        RowLayout {
          id: ol
          anchors.left: parent.left; anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
          anchors.leftMargin: Tk.padding.largeIncreased; anchors.rightMargin: Tk.padding.medium
          spacing: Tk.spacing.medium
          MIcon { text: "desktop_access_disabled"; size: Tk.iconSize.medium; color: Colours.m3onSurfaceVariant }
          RowLabel { Layout.fillWidth: true; text: "Off"; subtext: "This display is connected but not in use" }
          IconTextButton {
            type: "tonal"; isRound: true; icon: "power_settings_new"; text: "Turn on"
            fontSize: Tk.body.small
            onClicked: DirectDisplay.turnOn(mon.m)
          }
        }
      }

      RowSelect {
        Layout.fillWidth: true
        first: true
        visible: !mon.m.disabled
        settings: root.settings
        row: ({ label: "Resolution", icon: "aspect_ratio", subtext: "Size and refresh rate",
          options: mon.m.modes.map(mode => ({ value: mode, label: Model.modeLabel(mode) })) })
        value: mon.m.mode
        onPicked: v => { if (v !== mon.m.mode) DirectDisplay.setMode(mon.m, v) }
      }
      RowSelect {
        Layout.fillWidth: true
        visible: !mon.m.disabled
        settings: root.settings
        row: ({ label: "Scale", icon: "zoom_in", subtext: "Bigger makes everything on this display larger",
          options: Model.scaleOptions(mon.m.mode, mon.m.scale) })
        value: Model.scaleText(mon.m.scale)
        onPicked: v => { if (!Model.sameScale(Number(v), mon.m.scale)) DirectDisplay.setScale(mon.m, Number(v)) }
      }
      RowToggle {
        Layout.fillWidth: true
        last: true
        visible: !mon.m.disabled
        text: "Remember"
        subtext: !Model.canPin(mon.m.description) ? "This display doesn't report a name to remember it by"
          : "Use this resolution, scale and position whenever this display is connected"
        checked: DirectDisplay.isPinned(mon.m)
        disabled: !Model.canPin(mon.m.description) || !mon.m.mode
        onToggled: c => DirectDisplay.setPinned(mon.m, c)
      }
    }
  }
}
