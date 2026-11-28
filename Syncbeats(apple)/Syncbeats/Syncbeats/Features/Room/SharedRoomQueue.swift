import SwiftUI

nonisolated enum QueueInsertion {
    static func destination(source: Int, target: Int, below: Bool, current: Int?, count: Int) -> Int? {
        let firstUpcoming = current.map { $0 + 1 } ?? 0
        guard source >= firstUpcoming, source < count, target >= firstUpcoming, target < count else { return nil }
        let insertion = target + (below ? 1 : 0)
        let destination = min(count - 1, max(firstUpcoming, insertion - (source < insertion ? 1 : 0)))
        return destination == source ? nil : destination
    }
}

struct SharedRoomQueue: View {
    @Bindable var room: RoomSession
    let palette: NativePalette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var positioned = false
    private var played: [RoomTrack] { Array(room.recentRoomTracks.filter { $0.id != room.currentTrack?.id }.reversed()) }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                content.padding(.vertical, 2)
            }
            .task(id: room.currentTrack?.id ?? room.upcoming.first?.id) {
                guard !positioned, room.currentTrack != nil || !room.upcoming.isEmpty else { return }
                await Task.yield()
                guard !Task.isCancelled else { return }
                proxy.scrollTo(room.currentTrack == nil ? "queue-up-next" : "queue-now-playing", anchor: .top)
                positioned = true
            }
            .onDisappear { positioned = false }
        }
    }

    private var content: some View {
        LazyVStack(alignment: .leading, spacing: 10) {
            if !played.isEmpty {
                section("History", count: played.count)
                ForEach(played) { track in
                    SharedQueueRow(track: track, room: room, palette: palette, kind: .history)
                }
                Rectangle().fill(palette.line).frame(height: 1).padding(.vertical, 12)
            }
            if let current = room.currentTrack {
                section("Now Playing").id("queue-now-playing")
                SharedQueueRow(track: current, room: room, palette: palette, kind: .current)
            }
            section("Up Next", count: room.upcoming.count).id("queue-up-next")
            if room.upcoming.isEmpty {
                Text("Choose a song from Home or your library to keep listening.")
                    .font(.system(size: 12)).foregroundStyle(palette.secondary)
                    .fixedSize(horizontal: false, vertical: true).padding(.vertical, 10)
            } else {
                ForEach(room.upcoming) { track in
                    SharedQueueRow(track: track, room: room, palette: palette, kind: .upcoming)
                }
                endTarget
            }
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.18), value: room.upcoming.map(\.id))
    }

    private func section(_ title: String, count: Int? = nil) -> some View {
        HStack {
            Text(title).font(.system(size: 13, weight: .semibold))
            if let count { Text("\(count)").font(.system(size: 12)).foregroundStyle(palette.quiet) }
            Spacer()
        }.foregroundStyle(palette.secondary).padding(.top, 16).padding(.bottom, 8)
    }

    private var endTarget: some View {
        Text("Drop here to play last")
            .font(.system(size: 11)).foregroundStyle(palette.quiet)
            .frame(maxWidth: .infinity, minHeight: 36)
            .background(palette.text.opacity(0.035), in: RoundedRectangle(cornerRadius: 8))
            .dropDestination(for: String.self, action: { ids, _ in
                guard room.canControl, !room.isReordering, let id = ids.first,
                      let track = room.upcoming.first(where: { $0.id == id }),
                      room.queue.last?.id != id else { return false }
                Task { await room.reorder(track, to: room.queue.count - 1) }
                return true
            })
            .accessibilityIdentifier("queue-drop-last")
    }
}

private struct SharedQueueRow: View {
    enum Kind { case current, upcoming, history }
    let track: RoomTrack
    @Bindable var room: RoomSession
    let palette: NativePalette
    let kind: Kind
    @State private var targeted = false
    @State private var height: CGFloat = 66
    private var canReorder: Bool { kind == .upcoming && room.canControl && !room.isReordering }

    var body: some View {
        Group {
            #if os(iOS)
            if canReorder { row.draggable(track.id) { preview } } else { row }
            #else
            row
            #endif
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
        .dropDestination(for: String.self) { ids, point in
            guard canReorder, let id = ids.first,
                  let source = room.queue.firstIndex(where: { $0.id == id }),
                  let target = room.queue.firstIndex(where: { $0.id == track.id }),
                  let destination = QueueInsertion.destination(source: source, target: target,
                      below: point.y > height / 2,
                      current: room.currentTrack.flatMap { current in room.queue.firstIndex { $0.id == current.id } },
                      count: room.queue.count) else { return false }
            let moved = room.queue[source]
            Task { await room.reorder(moved, to: destination) }
            return true
        } isTargeted: { targeted = $0 }
        .accessibilityActions {
            if canReorder {
                Button("Move up") { move(by: -1) }
                Button("Move down") { move(by: 1) }
            }
        }
        .accessibilityIdentifier("queue-track-\(track.id)")
    }

    private var row: some View {
        HStack(spacing: 10) {
            Button {
                if kind == .history && !room.queue.contains(where: { $0.id == track.id }) {
                    Task { await room.play(RoomSearchResult(url: track.trackUrl, title: track.title,
                        thumbnail: track.thumbnail, uploaderName: track.artist, duration: track.durationSec)) }
                } else { room.jump(to: track) }
            } label: {
                HStack(spacing: 10) {
                    RoomArtwork(request: track.artworkRequest, palette: palette)
                        .frame(width: 42, height: 42).clipShape(RoundedRectangle(cornerRadius: 7))
                    VStack(alignment: .leading, spacing: 4) {
                        Text(track.title).font(.system(size: 13, weight: .medium)).lineLimit(2)
                        Text(track.artistLabel).font(.system(size: 11)).foregroundStyle(palette.secondary).lineLimit(1)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                    if kind == .current {
                        Image(systemName: room.isPlaying ? "waveform" : "pause.fill").foregroundStyle(palette.gold)
                    } else if let duration = track.durationSec {
                        Text(playbackTime(duration)).font(.system(size: 11)).foregroundStyle(palette.quiet)
                    }
                }.contentShape(Rectangle())
            }.buttonStyle(.plain).disabled(!room.canControl)
                .accessibilityLabel(kind == .current ? "Now playing: \(track.title)" : "Play \(track.title)")
            if kind == .upcoming {
                #if os(macOS)
                if canReorder { handle.draggable(track.id) { preview } } else { handle.opacity(0.4) }
                #else
                handle
                #endif
                Button { room.remove(track) } label: {
                    Image(systemName: "xmark").font(.system(size: 10)).frame(width: 24, height: 36)
                }.buttonStyle(.plain).foregroundStyle(palette.quiet)
                    .disabled(!room.canControl || room.isReordering)
                    .accessibilityLabel("Remove \(track.title) from Up Next")
            }
        }
        .padding(10).foregroundStyle(palette.text)
        .background(targeted && canReorder ? palette.gold.opacity(0.14)
            : kind == .current ? palette.text.opacity(0.08) : .clear,
            in: RoundedRectangle(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).stroke(targeted && canReorder ? palette.gold.opacity(0.5) : .clear) }
    }

    private var handle: some View {
        Image(systemName: "line.3.horizontal").font(.system(size: 13))
            .foregroundStyle(palette.quiet).frame(width: 28, height: 36).contentShape(Rectangle())
            .accessibilityLabel("Drag \(track.title) to reorder")
            .accessibilityIdentifier("queue-drag-\(track.id)")
    }

    private var preview: some View {
        HStack(spacing: 10) {
            RoomArtwork(request: track.artworkRequest, palette: palette)
                .frame(width: 40, height: 40).clipShape(RoundedRectangle(cornerRadius: 7))
            Text(track.title).font(.system(size: 13, weight: .medium)).lineLimit(1)
        }.padding(12).frame(width: 240, alignment: .leading).foregroundStyle(palette.text)
            .background(palette.panel, in: RoundedRectangle(cornerRadius: 12))
            .shadow(color: .black.opacity(0.18), radius: 16, y: 8)
    }

    private func move(by delta: Int) {
        guard canReorder, let index = room.upcoming.firstIndex(where: { $0.id == track.id }),
              room.upcoming.indices.contains(index + delta) else { return }
        Task { await room.move(track, by: delta) }
    }
}
