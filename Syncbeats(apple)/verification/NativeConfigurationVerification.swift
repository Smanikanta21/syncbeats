import Foundation

@main struct NativeConfigurationVerification {
    static func main() {
        let production = URL(string: "https://api.syncbeats.in")!
        precondition(AppConfiguration.defaultAPI == production)
        precondition(CommandLine.arguments.count == 2)
        precondition(AppConfiguration.apiURL.absoluteString == CommandLine.arguments[1])
        print("PASS: HTTPS production default and expected backend selection")
    }
}
