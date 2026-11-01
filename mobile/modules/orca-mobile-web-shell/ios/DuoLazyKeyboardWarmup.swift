import UIKit

@MainActor
final class DuoLazyKeyboardWarmup {
  private static var warmed = false
  private static var warming = false
  private static var waiters: [() -> Void] = []

  static func prepare(in window: UIWindow, completion: @escaping () -> Void) {
    if warmed {
      completion()
      return
    }
    if warming {
      waiters.append(completion)
      return
    }
    guard needsWarmup(window) else {
      completion()
      return
    }
    warming = true
    waiters.append(completion)
    let field = UITextField(frame: CGRect(x: -100, y: -100, width: 40, height: 30))
    field.accessibilityElementsHidden = true
    window.addSubview(field)
    let focused = field.becomeFirstResponder()
    NSLog("DuoA lazy native focus=%d", focused)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
      field.resignFirstResponder()
      field.removeFromSuperview()
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
        warmed = focused
        warming = false
        let callbacks = waiters
        waiters.removeAll()
        for callback in callbacks {
          callback()
        }
      }
    }
  }

  private static func needsWarmup(_ window: UIWindow) -> Bool {
    guard #available(iOS 27.1, *),
      window.traitCollection.userInterfaceIdiom == .phone,
      let scene = window.windowScene,
      scene.activationState == .foregroundActive
    else { return false }
    let screen = scene.screen
    let sceneRect = scene.effectiveGeometry.coordinateSpace.convert(
      scene.effectiveGeometry.coordinateSpace.bounds, to: screen.coordinateSpace)
    let display = screen.coordinateSpace.bounds
    let partial = sceneRect.width < display.width * 0.9
    // Diagnostic inner-display heuristic; size class alone also matches the cover screen.
    let innerDisplay = min(display.width, display.height) >= 600
    NSLog(
      "DuoA lazy geometry scene=%@ display=%@ partial=%d inner=%d sizeClass=%ld",
      String(describing: sceneRect), String(describing: display), partial, innerDisplay,
      window.traitCollection.horizontalSizeClass.rawValue)
    return partial && innerDisplay
  }
}
