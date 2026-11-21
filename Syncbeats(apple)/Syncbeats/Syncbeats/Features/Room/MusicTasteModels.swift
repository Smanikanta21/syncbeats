import Foundation

struct MusicTaste: Codable, Equatable {
    var onboardingStatus = "NEW"
    var languages: [String] = []
    var genres: [String] = []
    var favoriteArtistIds: [String] = []
    var customArtists: [String] = []
    var useActivity = false
}
struct MusicArtist: Decodable, Identifiable {
    let id: String
    let name: String
    let languages: [String]
    let genres: [String]
}
struct MusicCatalog: Decodable {
    let languages: [String]
    let genres: [String]
    let artists: [MusicArtist]
}
struct MusicPick: Decodable, Identifiable {
    let id: String
    let name: String
    let query: String
    let reason: String
}
struct MusicFeed: Decodable {
    struct Section: Decodable, Identifiable {
        let id: String
        let title: String
        let picks: [MusicPick]
    }
    let modelVersion: String
    let profile: MusicTaste
    let sections: [Section]
}
