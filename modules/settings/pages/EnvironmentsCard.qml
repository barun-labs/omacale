import QtQuick
import QtQuick.Layouts
import "../../.."

// Settings › Taskbar › Environments: named bar layouts to switch between,
// as Island's environments (core/Environments.js, PluginService). The bar
// above is always the active environment's: arrange it there. No Caelestia
// original; Nexus rows, as Display › Profiles.
ColumnLayout {
  id: root
  property var row
  property var settings
  property bool first
  property bool last
  spacing: Tk.spacing.extraSmall / 2

  property int confirmDelete: -1     // the environment whose Delete waits for a second click
  property int renaming: -1
  readonly property bool full: PluginService.environments.length >= PluginService.maxEnvironments

  Repeater {
    model: PluginService.environments
    ConnectedRect {
      id: er
      required property string modelData
      required property int index
      readonly property bool active: index === PluginService.environment
      readonly property bool asking: root.confirmDelete === index
      readonly property bool editing: root.renaming === index
      Layout.fillWidth: true
      first: index === 0
      implicitHeight: erl.implicitHeight + Tk.padding.medium * 2
      RowLayout {
        id: erl
        anchors.left: parent.left; anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
        anchors.leftMargin: Tk.padding.largeIncreased; anchors.rightMargin: Tk.padding.medium
        spacing: Tk.spacing.medium
        MIcon {
          text: er.active ? "check_circle" : "dashboard_customize"
          size: Tk.iconSize.medium
          fill: er.active ? 1 : 0
          color: er.active ? Colours.m3primary : Colours.m3onSurfaceVariant
        }
        RowLabel {
          Layout.fillWidth: true
          visible: !er.editing
          text: er.asking ? "Delete " + er.modelData + "?" : er.modelData
          subtext: er.asking ? "Its bar layout is forgotten" : er.active ? "On the bar now" : ""
        }
        Rectangle {
          Layout.fillWidth: true
          visible: er.editing
          implicitHeight: Tk.px(36)
          radius: height / 2
          color: Colours.m3surfaceContainerHighest
          border.width: renameField.activeFocus ? 2 : 0
          border.color: Colours.m3primary
          MTextField {
            id: renameField
            anchors.left: parent.left; anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
            anchors.leftMargin: Tk.padding.large; anchors.rightMargin: Tk.padding.large
            font.pointSize: Tk.body.small
            clip: true
            onVisibleChanged: if (visible) { text = er.modelData; forceActiveFocus(); selectAll() }
            onAccepted: { PluginService.renameEnvironment(er.index, text); root.renaming = -1 }
            Keys.onEscapePressed: root.renaming = -1
          }
        }
        IconTextButton {
          visible: !er.asking && !er.editing && !er.active
          type: "tonal"; isRound: true; icon: "play_arrow"; text: "Switch"
          fontSize: Tk.body.small
          onClicked: PluginService.switchEnvironment(String(er.index))
        }
        IconButton {
          visible: !er.asking
          type: "text"; icon: er.editing ? "check" : "edit"
          onClicked: {
            if (er.editing) { PluginService.renameEnvironment(er.index, renameField.text); root.renaming = -1 }
            else { root.confirmDelete = -1; root.renaming = er.index }
          }
        }
        IconButton {
          visible: !er.asking && !er.editing && PluginService.environments.length > 1
          type: "text"; icon: "delete"
          onClicked: root.confirmDelete = er.index
        }
        IconTextButton {
          visible: er.asking
          type: "text"; isRound: true; text: "Cancel"
          fontSize: Tk.body.small
          onClicked: root.confirmDelete = -1
        }
        IconTextButton {
          visible: er.asking
          type: "filled"; isRound: true; icon: "delete"; text: "Delete"
          fontSize: Tk.body.small
          onClicked: { PluginService.removeEnvironment(er.index); root.confirmDelete = -1 }
        }
      }
    }
  }

  // A new environment: a copy of the bar as it is, or a focus bar (logo,
  // workspaces, clock and power only).
  ConnectedRect {
    Layout.fillWidth: true
    last: true
    implicitHeight: al.implicitHeight + Tk.padding.medium * 2
    RowLayout {
      id: al
      anchors.left: parent.left; anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
      anchors.leftMargin: Tk.padding.largeIncreased; anchors.rightMargin: Tk.padding.medium
      spacing: Tk.spacing.medium
      MIcon { text: "add"; size: Tk.iconSize.medium; color: Colours.m3onSurfaceVariant }
      Rectangle {
        Layout.fillWidth: true
        implicitHeight: Tk.px(36)
        radius: height / 2
        color: Colours.m3surfaceContainerHighest
        border.width: nameField.activeFocus ? 2 : 0
        border.color: Colours.m3primary
        MTextField {
          id: nameField
          anchors.left: parent.left; anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
          anchors.leftMargin: Tk.padding.large; anchors.rightMargin: Tk.padding.large
          font.pointSize: Tk.body.small
          clip: true
          enabled: !root.full
          onAccepted: copyBtn.clicked()
          MText {
            anchors.verticalCenter: parent.verticalCenter
            visible: !nameField.text
            text: root.full ? "At most " + PluginService.maxEnvironments + " environments" : "New environment…"
            color: Colours.m3outline
          }
        }
      }
      IconTextButton {
        id: copyBtn
        type: "filled"; isRound: true; icon: "content_copy"; text: "Copy bar"
        fontSize: Tk.body.small
        disabled: root.full || !nameField.text.trim()
        onClicked: { if (disabled) return; PluginService.addEnvironment(nameField.text, false); nameField.text = "" }
      }
      IconTextButton {
        type: "tonal"; isRound: true; icon: "center_focus_strong"; text: "Focus bar"
        fontSize: Tk.body.small
        disabled: root.full
        onClicked: { if (disabled) return; PluginService.addEnvironment(nameField.text.trim() || "Focus", true); nameField.text = "" }
      }
    }
  }
}
