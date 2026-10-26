import ExpoModulesCore
import UIKit

// Why: iPhone Duo divides the window at its hinge when partially folded and occludes part of it
// with its status column; neither shows in the safe area or React Native. Emits both in window
// points: the division (null when flat or closed) and the occluded rects.
public class OrcaWindowRegionsModule: Module {
  private var probe: UIView?
  private var keyWindowObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("OrcaWindowRegions")

    Events("onChange")

    OnStartObserving {
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        self.attachProbe()
        // A reconnected scene brings a new key window; the probe moves to it.
        self.keyWindowObserver = NotificationCenter.default.addObserver(
          forName: UIWindow.didBecomeKeyNotification, object: nil, queue: .main
        ) { [weak self] _ in
          self?.attachProbe()
        }
      }
    }

    OnStopObserving {
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        if let observer = self.keyWindowObserver {
          NotificationCenter.default.removeObserver(observer)
        }
        self.keyWindowObserver = nil
        self.probe?.removeFromSuperview()
        self.probe = nil
      }
    }
  }

  private func keyWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first(where: \.isKeyWindow)
  }

  private func attachProbe() {
    guard let window = keyWindow(), probe?.window !== window else {
      return
    }
    probe?.removeFromSuperview()
    probe = nil
    // UIKit 9127.0.85 ships with the iOS 27.1 SDK, the first with reserved regions.
    #if canImport(UIKit, _version: 9127.0.85)
      if #available(iOS 27.1, *) {
        let probe = WindowRegionsProbe(frame: window.bounds)
        probe.onChange = { [weak self] payload in
          self?.sendEvent("onChange", payload)
        }
        window.insertSubview(probe, at: 0)
        self.probe = probe
      }
    #endif
  }
}

#if canImport(UIKit, _version: 9127.0.85)
  /// Invisible full-window view: laid out on every resize, and again by its hinge interaction
  /// when the fold angle changes without resizing the window.
  @available(iOS 27.1, *)
  private final class WindowRegionsProbe: UIView {
    var onChange: (([String: Any]) -> Void)?
    private var reported: (division: CGRect?, occlusions: [CGRect])?

    override init(frame: CGRect) {
      super.init(frame: frame)
      autoresizingMask = [.flexibleWidth, .flexibleHeight]
      isUserInteractionEnabled = false
      isAccessibilityElement = false
      addInteraction(UIHingeInteraction { [weak self] _, _ in self?.setNeedsLayout() })
    }

    required init?(coder: NSCoder) {
      fatalError("init(coder:) is not supported")
    }

    // Occlusions can change without hinge motion or a resize (status column, camera); re-read on those.
    override func safeAreaInsetsDidChange() {
      super.safeAreaInsetsDidChange()
      setNeedsLayout()
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
      super.traitCollectionDidChange(previous)
      setNeedsLayout()
    }

    override func layoutSubviews() {
      super.layoutSubviews()
      guard let window else { return }
      let division = window.reservedRegions(kind: .division).first?.frame
      let occlusions = window.reservedRegions(kind: .occlusion).map(\.frame)
      // The first layout always reports, so a listener starts from the real state.
      if let reported, reported.division == division, reported.occlusions == occlusions { return }
      reported = (division, occlusions)
      onChange?([
        "division": division.map(Self.rectPayload) as Any,
        "occlusions": occlusions.map(Self.rectPayload),
      ])
    }

    private static func rectPayload(_ rect: CGRect) -> [String: Double] {
      ["x": Double(rect.minX), "y": Double(rect.minY), "width": Double(rect.width), "height": Double(rect.height)]
    }
  }
#endif
