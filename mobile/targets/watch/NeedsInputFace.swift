import SwiftUI

struct NeedsInputFace: View {
  var count: Int
  @Environment(\.orcaPalette) private var palette

  var body: some View {
    VStack(spacing: 6) {
      ZStack {
        Circle().fill(palette.warning)
        Text("\(count)")
          .font(.title2.weight(.semibold))
          .foregroundStyle(Color(rgb: 0x171717))
      }
      .frame(width: 52, height: 52)
      Text("Needs input")
        .font(.caption2)
        .foregroundStyle(palette.mutedForeground)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(palette.background)
  }
}
