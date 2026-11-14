import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import "../../.."
import "../../../services/AudioRoutes.js" as Routes

// Settings › Audio › App volumes. Port of Caelestia's nexus
// pages/audio/AppVolumes.qml. One addition with no Caelestia original: under
// each app, the output it plays on, and a button that moves it to the next
// one (services/AudioRoutes.js; WirePlumber remembers the choice per app).
ColumnLayout {
  id: root
  property var row
  property var settings
  property bool first
  property bool last

  spacing: Tk.spacing.extraSmall / 2
  Component.onCompleted: AudioService.users++
  Component.onDestruction: AudioService.users--

  // Where each app plays (services/AudioRoutes.js), read when the page
  // opens, when the streams change and after a move.
  property var graph: ({ sinks: [], routes: ({}) })
  function move(id, serial) {
    Quickshell.execDetached(["pw-metadata", String(id), "target.object", serial, "Spa:Id"])
    settle.restart()
  }
  Connections { target: AudioService; function onStreamsChanged() { settle.restart() } }
  Timer { id: settle; interval: 300; running: true; onTriggered: if (!dump.running) dump.running = true }
  Process {
    id: dump
    command: ["pw-dump"]
    stdout: StdioCollector { waitForEnd: true; onStreamFinished: root.graph = Routes.parse(text) }
  }

  MText {
    Layout.fillWidth: true
    Layout.leftMargin: Tk.padding.small
    Layout.bottomMargin: Tk.spacing.medium
    text: "Adjust the volume of individual apps currently playing audio."
    color: Colours.m3outline
    wrapMode: Text.WordWrap
  }

  ItemList {
    id: streamList
    first: true
    last: true
    showList: true
    placeholderIcon: "music_off"
    placeholderText: "No apps playing audio"
    color: list.count === 0 ? Colours.m3surfaceContainer : "transparent"
    list.spacing: Tk.spacing.extraSmall / 2
    model: ScriptModel { values: AudioService.streams }

    delegate: ColumnLayout {
      id: stream
      required property var modelData
      required property int index
      readonly property string device: root.graph.routes[modelData ? modelData.id : -1] || ""
      width: ListView.view ? ListView.view.width : 0
      spacing: Tk.spacing.extraSmall / 2
      AudioSlider {
        first: stream.index === 0
        icon: AudioService.volumeIcon(value, muted)
        label: AudioService.streamName(stream.modelData)
        value: stream.modelData && stream.modelData.audio ? stream.modelData.audio.volume : 0
        muted: !!(stream.modelData && stream.modelData.audio && stream.modelData.audio.muted)
        onMoved: v => AudioService.setStreamVolume(stream.modelData, v)
      }
      ConnectedRect {
        Layout.fillWidth: true
        last: stream.index === streamList.list.count - 1
        implicitHeight: dl.implicitHeight + Tk.padding.medium * 2
        RowLayout {
          id: dl
          anchors.left: parent.left; anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
          anchors.leftMargin: Tk.padding.largeIncreased; anchors.rightMargin: Tk.padding.medium
          spacing: Tk.spacing.medium
          MIcon { text: "speaker"; size: Tk.iconSize.medium; color: Colours.m3onSurfaceVariant }
          RowLabel {
            Layout.fillWidth: true
            text: AudioService.friendly(Routes.labelOf(root.graph, stream.device)) || "Default output"
            subtext: "Plays on"
          }
          IconTextButton {
            visible: root.graph.sinks.length > 1
            type: "tonal"; isRound: true; icon: "swap_horiz"; text: "Next output"
            fontSize: Tk.body.small
            onClicked: root.move(stream.modelData.id, Routes.next(root.graph, stream.device))
          }
        }
      }
    }
  }
}
