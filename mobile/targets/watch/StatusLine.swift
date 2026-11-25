import SwiftUI

struct StatusLine: View {
  var updated: String
  var reachability: String?
  var phase: String?
  @Environment(\.orcaPalette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(updated)
      if let line = phase ?? reachability {
        HStack(spacing: 4) {
          if phase == nil {
            Image(systemName: "iphone.slash")
              .accessibilityHidden(true)
          }
          Text(line)
        }
        .foregroundStyle(phase == nil ? palette.mutedForeground : palette.warning)
      }
    }
    .font(.caption2)
    .foregroundStyle(palette.mutedForeground)
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}
