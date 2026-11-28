import Foundation

@main struct NativeConfigurationVerification {
    static func main() {
        precondition(AppConfiguration.defaultAPI.absoluteString == "https://api.syncbeats.in")
        precondition(AppConfiguration.defaultWebsite.absoluteString == "https://syncbeats.in")
        precondition(CommandLine.arguments.count == 3)
        precondition(AppConfiguration.apiURL.absoluteString == CommandLine.arguments[1])
        precondition(AppConfiguration.website.absoluteString == CommandLine.arguments[2])
        print("PASS: expected API and website selection")
    }
}
