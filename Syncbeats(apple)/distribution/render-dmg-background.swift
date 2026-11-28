import AppKit

// Finder uses a 720 x 440 point canvas; retain sharp type on Retina displays.
let size = NSSize(width: 720, height: 440)
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1440, pixelsHigh: 880,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
bitmap.size = size
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
let context = NSGraphicsContext.current!.cgContext
// NSGraphicsContext already applies the bitmap's 2x scale from its point size.
let cream = NSColor(red: 247/255, green: 245/255, blue: 239/255, alpha: 1)
let ink = NSColor(red: 39/255, green: 44/255, blue: 40/255, alpha: 1)
let brown = NSColor(red: 133/255, green: 102/255, blue: 53/255, alpha: 1)
cream.setFill()
NSBezierPath(rect: NSRect(origin: .zero, size: size)).fill()

func centeredText(_ text: String, y: CGFloat, font: NSFont, color: NSColor) {
    let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
    let string = text as NSString
    let width = string.size(withAttributes: attributes).width
    string.draw(at: NSPoint(x: (size.width - width) / 2, y: y), withAttributes: attributes)
}
centeredText("Install SyncBeats", y: 364, font: .systemFont(ofSize: 26, weight: .medium), color: ink)
centeredText("Drag SyncBeats into Applications", y: 72, font: .systemFont(ofSize: 17, weight: .medium), color: brown)

// The real app and Applications icons are positioned by Finder at (180, 200)
// and (540, 200). Only the connecting arrow belongs to the background.
let arrow = NSBezierPath()
arrow.move(to: NSPoint(x: 341, y: 240))
arrow.line(to: NSPoint(x: 379, y: 240))
arrow.move(to: NSPoint(x: 370, y: 249))
arrow.line(to: NSPoint(x: 379, y: 240))
arrow.line(to: NSPoint(x: 370, y: 231))
arrow.lineWidth = 2
arrow.lineCapStyle = .round
arrow.lineJoinStyle = .round
brown.withAlphaComponent(0.55).setStroke()
arrow.stroke()
NSGraphicsContext.restoreGraphicsState()
let output = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "dmg-background.png"
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: output))
