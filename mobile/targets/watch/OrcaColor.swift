import SwiftUI

extension Color {
  init(rgb: UInt32) {
    self.init(
      red: Double((rgb >> 16) & 0xFF) / 255,
      green: Double((rgb >> 8) & 0xFF) / 255,
      blue: Double(rgb & 0xFF) / 255
    )
  }
}

struct OrcaPalette {
  var background: Color
  var foreground: Color
  var card: Color
  var muted: Color
  var mutedForeground: Color
  var primary: Color
  var primaryForeground: Color
  var destructive: Color
  var destructiveForeground: Color
  var warning: Color
  var success: Color

  static let dark = OrcaPalette(
    background: Color(rgb: 0x0A0A0A),
    foreground: Color(rgb: 0xF0F0F0),
    card: Color(rgb: 0x171717),
    muted: Color(rgb: 0x262626),
    mutedForeground: Color(rgb: 0xACACAC),
    primary: Color(rgb: 0xE5E5E5),
    primaryForeground: Color(rgb: 0x171717),
    destructive: Color(rgb: 0xFF6568),
    destructiveForeground: Color(rgb: 0x450A0A),
    warning: Color(rgb: 0xEAB308),
    success: Color(rgb: 0x86EFAC)
  )

  static let light = OrcaPalette(
    background: Color(rgb: 0xFFFFFF),
    foreground: Color(rgb: 0x0A0A0A),
    card: Color(rgb: 0xFFFFFF),
    muted: Color(rgb: 0xF5F5F5),
    mutedForeground: Color(rgb: 0x696969),
    primary: Color(rgb: 0x171717),
    primaryForeground: Color(rgb: 0xFAFAFA),
    destructive: Color(rgb: 0xE40014),
    destructiveForeground: Color(rgb: 0xFFFFFF),
    warning: Color(rgb: 0xCA8A04),
    success: Color(rgb: 0x147638)
  )

  static func current(_ scheme: ColorScheme) -> OrcaPalette {
    scheme == .dark ? dark : light
  }

  func status(_ status: WatchSessionStatus) -> Color {
    switch status {
    case .needsInput:
      return warning
    case .working:
      return success
    case .done, .idle:
      return mutedForeground
    }
  }
}

private struct OrcaPaletteKey: EnvironmentKey {
  static let defaultValue = OrcaPalette.dark
}

extension EnvironmentValues {
  var orcaPalette: OrcaPalette {
    get { self[OrcaPaletteKey.self] }
    set { self[OrcaPaletteKey.self] = newValue }
  }
}

struct OrcaWideButtonStyle: ButtonStyle {
  var fill: Color
  var ink: Color
  var minHeight: CGFloat = 44

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.headline)
      .lineLimit(1)
      .minimumScaleFactor(0.8)
      .frame(maxWidth: .infinity, minHeight: minHeight)
      .foregroundStyle(ink)
      .background(fill, in: RoundedRectangle(cornerRadius: 12))
      .opacity(configuration.isPressed ? 0.72 : 1)
  }
}
