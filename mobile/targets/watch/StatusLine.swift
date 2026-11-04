import SwiftUI

struct StatusLine: View {
  var updated: String
  var reachability: String
  var phase: String?
  @Environment(\.orcaPalette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(updated)
      Text(phase ?? reachability)
        .foregroundStyle(phase == nil ? palette.mutedForeground : palette.warning)
    }
    .font(.caption2)
    .foregroundStyle(palette.mutedForeground)
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}
