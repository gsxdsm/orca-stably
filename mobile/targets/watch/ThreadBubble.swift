import SwiftUI

struct ThreadBubble: View {
  let text: String
  let agent: String
  let user: Bool
  let date: Date?
  var shortened = false
  var delivery: WatchThreadReply.State?
  @Environment(\.orcaPalette) private var palette
  @Environment(\.isLuminanceReduced) private var dimmed
  @State private var expanded = false

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 4) {
        Image(systemName: user ? "person.fill" : "sparkle")
        Text(user ? "You" : agent).fontWeight(.semibold)
        Spacer(minLength: 0)
        if let date {
          Text(date, style: .time).monospacedDigit()
        }
      }
      .font(.caption2)
      .foregroundStyle(palette.mutedForeground)

      if !user && (shortened || text.count > 100 || text.contains("\n")) {
        Button { expanded.toggle() } label: {
          VStack(alignment: .leading, spacing: 4) {
            message.lineLimit(expanded ? nil : 3)
            Label(expanded ? "Show less" : "Read more",
                  systemImage: expanded ? "chevron.up" : "chevron.down")
              .font(.caption2.weight(.semibold))
              .foregroundStyle(palette.mutedForeground)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
      } else {
        message
      }
      if expanded && shortened {
        Text("Full message on iPhone")
          .font(.caption2)
          .foregroundStyle(palette.mutedForeground)
      }
      if let delivery {
        switch delivery {
        case .sending:
          Label("Sending…", systemImage: "clock").foregroundStyle(palette.mutedForeground)
        case .sent:
          Label("Sent", systemImage: "checkmark").foregroundStyle(palette.success)
        case .failed(let detail):
          Label(detail, systemImage: "exclamationmark.circle").foregroundStyle(palette.warning)
        }
      }
    }
    .font(.caption2)
    .padding(8)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(user ? palette.muted : palette.card, in: RoundedRectangle(cornerRadius: 14))
    .padding(.leading, user ? 17 : 0)
    .padding(.trailing, user ? 0 : 17)
    .privacySensitive()
    .opacity(dimmed ? 0.68 : 1)
    .accessibilityElement(children: .combine)
  }

  private var message: some View {
    Text(text)
      .font(.footnote)
      .foregroundStyle(palette.foreground)
  }
}
