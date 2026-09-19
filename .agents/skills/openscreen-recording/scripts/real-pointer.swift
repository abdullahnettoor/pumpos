import ApplicationServices
import Foundation

enum Action: String {
  case move
  case click
}

guard CommandLine.arguments.count >= 4,
      let action = Action(rawValue: CommandLine.arguments[1]),
      let targetX = Double(CommandLine.arguments[2]),
      let targetY = Double(CommandLine.arguments[3]) else {
  fputs("usage: real-pointer <move|click> <x> <y> [duration-ms]\n", stderr)
  exit(2)
}

let durationMs = CommandLine.arguments.count > 4 ? Double(CommandLine.arguments[4]) ?? 420 : 420
let start = CGEvent(source: nil)?.location ?? CGPoint(x: targetX, y: targetY)
let target = CGPoint(x: targetX, y: targetY)
let steps = max(12, Int(durationMs / 12))

for step in 1...steps {
  let progress = Double(step) / Double(steps)
  let eased = progress * progress * (3 - 2 * progress)
  let point = CGPoint(
    x: start.x + (target.x - start.x) * eased,
    y: start.y + (target.y - start.y) * eased
  )
  CGEvent(
    mouseEventSource: nil,
    mouseType: .mouseMoved,
    mouseCursorPosition: point,
    mouseButton: .left
  )?.post(tap: .cghidEventTap)
  usleep(UInt32(max(1, durationMs * 1_000 / Double(steps))))
}

if action == .click {
  CGEvent(
    mouseEventSource: nil,
    mouseType: .leftMouseDown,
    mouseCursorPosition: target,
    mouseButton: .left
  )?.post(tap: .cghidEventTap)
  usleep(90_000)
  CGEvent(
    mouseEventSource: nil,
    mouseType: .leftMouseUp,
    mouseCursorPosition: target,
    mouseButton: .left
  )?.post(tap: .cghidEventTap)
}
