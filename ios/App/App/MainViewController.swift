import UIKit
import Capacitor

/// Subclass of CAPBridgeViewController that enables the native iOS left-edge
/// swipe-back gesture on the WKWebView.  Next.js uses client-side history
/// (history.pushState) so the WKWebView back/forward list is populated on every
/// page navigation — swipe-back triggers history.back() with the native slide
/// animation operators expect from every other iPhone app.
class MainViewController: CAPBridgeViewController {
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        webView?.allowsBackForwardNavigationGestures = true
    }
}
