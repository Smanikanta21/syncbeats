import Foundation

class LocalCacheManager {
    static let shared = LocalCacheManager()
    
    private let fileManager = FileManager.default
    
    // Use the Application Support directory to securely store files away from user visibility
    private var cacheDirectory: URL {
        let urls = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)
        let appSupportDir = urls[0]
        
        // Ensure the directory exists
        if !fileManager.fileExists(atPath: appSupportDir.path) {
            try? fileManager.createDirectory(at: appSupportDir, withIntermediateDirectories: true, attributes: nil)
        }
        
        let tracksDir = appSupportDir.appendingPathComponent("DownloadedTracks")
        if !fileManager.fileExists(atPath: tracksDir.path) {
            try? fileManager.createDirectory(at: tracksDir, withIntermediateDirectories: true, attributes: nil)
        }
        
        return tracksDir
    }
    
    private init() {}
    
    /// Returns the local file URL if the track is downloaded, otherwise nil
    func getLocalURL(for trackId: String) -> URL? {
        let fileURL = cacheDirectory.appendingPathComponent("\(trackId).m4a")
        if fileManager.fileExists(atPath: fileURL.path) {
            return fileURL
        }
        return nil
    }
    
    /// Downloads a track from the remote URL and saves it to the sandbox
    func downloadTrack(id: String, remoteURL: URL, completion: @escaping (Result<URL, Error>) -> Void) {
        if let existing = getLocalURL(for: id) {
            completion(.success(existing))
            return
        }
        
        let destinationURL = cacheDirectory.appendingPathComponent("\(id).m4a")
        
        let task = URLSession.shared.downloadTask(with: remoteURL) { tempURL, response, error in
            if let error = error {
                DispatchQueue.main.async {
                    completion(.failure(error))
                }
                return
            }
            
            guard let tempURL = tempURL else {
                DispatchQueue.main.async {
                    completion(.failure(NSError(domain: "LocalCacheManager", code: -1, userInfo: [NSLocalizedDescriptionKey: "No file downloaded"])))
                }
                return
            }
            
            do {
                // Move from temp location to our sandbox cache
                if self.fileManager.fileExists(atPath: destinationURL.path) {
                    try self.fileManager.removeItem(at: destinationURL)
                }
                try self.fileManager.moveItem(at: tempURL, to: destinationURL)
                
                DispatchQueue.main.async {
                    completion(.success(destinationURL))
                }
            } catch {
                DispatchQueue.main.async {
                    completion(.failure(error))
                }
            }
        }
        task.resume()
    }
}
