import XCTest
@testable import OrcaWatchModel

final class WatchLaunchTests: XCTestCase {
  func testDefaultsToThePhone() {
    let launch = WatchLaunch.parse(["OrcaWatch"])
    XCTAssertEqual(launch.useMock, false)
    XCTAssertEqual(launch.screenshot, false)
    XCTAssertEqual(watchUsesPhoneTransport(launch, release: false), true)
    XCTAssertEqual(watchUsesPhoneTransport(launch, release: true), true)
  }

  func testMockFlagIsDebugOnly() {
    let launch = WatchLaunch.parse(["OrcaWatch", "-OrcaWatchMock"])
    XCTAssertEqual(launch.useMock, true)
    XCTAssertEqual(launch.screenshot, false)
    XCTAssertEqual(watchUsesPhoneTransport(launch, release: false), false)
    XCTAssertEqual(watchUsesPhoneTransport(launch, release: true), true)
  }

  func testScreenshotFlagsDoNotSelectTheMock() {
    let launch = WatchLaunch.parse([
      "OrcaWatch",
      "-OrcaWatchScreen", "sessions",
      "-OrcaWatchReachable", "false",
      "-OrcaWatchOutcome", "stale",
      "-OrcaWatchPhase", "waking"
    ])
    XCTAssertEqual(launch.screenshot, true)
    XCTAssertEqual(launch.screen, .sessions)
    XCTAssertEqual(launch.reachable, false)
    XCTAssertEqual(launch.useMock, false)
    XCTAssertEqual(watchUsesPhoneTransport(launch, release: false), true)
  }

  func testPhoneFlagClearsAnEarlierMock() {
    let mocked = WatchLaunch.parse(["OrcaWatch", "-OrcaWatchMock", "-OrcaWatchPhone"])
    XCTAssertEqual(mocked.useMock, false)
    XCTAssertEqual(watchUsesPhoneTransport(mocked, release: false), true)
    let phoned = WatchLaunch.parse(["OrcaWatch", "-OrcaWatchPhone", "-OrcaWatchMock"])
    XCTAssertEqual(phoned.useMock, true)
    XCTAssertEqual(watchUsesPhoneTransport(phoned, release: false), false)
    XCTAssertEqual(watchUsesPhoneTransport(phoned, release: true), true)
  }
}
