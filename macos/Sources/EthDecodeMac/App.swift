import AppKit
import SwiftUI

@main
struct EthDecodeMacApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var settings = AppSettings()
    @StateObject private var history = HistoryStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(settings)
                .environmentObject(history)
                .frame(minWidth: 940, minHeight: 640)
                .tint(Theme.accent)
        }
        .defaultSize(width: 1240, height: 820)
        .commands {
            ActionCommands()
        }

        Settings {
            SettingsForm()
                .environmentObject(settings)
                .frame(width: 480)
        }
    }
}

/// Groups the tool-facing menu commands backed by @FocusedValue plumbing.
private struct ActionCommands: Commands {
    @FocusedValue(\.decodeCommand) private var decodeCommand
    @FocusedValue(\.clearResultsCommand) private var clearResultsCommand

    var body: some Commands {
        CommandMenu("Tool") {
            Button("Decode Now") { decodeCommand?() }
                .keyboardShortcut("r", modifiers: .command)
                .disabled(decodeCommand == nil)
            Button("Clear Results") { clearResultsCommand?() }
                .keyboardShortcut("k", modifiers: [.shift, .command])
                .disabled(clearResultsCommand == nil)
        }
    }
}

// MARK: - Focused command plumbing

struct DecodeCommandKey: FocusedValueKey {
    typealias Value = () -> Void
}

struct ClearResultsCommandKey: FocusedValueKey {
    typealias Value = () -> Void
}

extension FocusedValues {
    var decodeCommand: (() -> Void)? {
        get { self[DecodeCommandKey.self] }
        set { self[DecodeCommandKey.self] = newValue }
    }

    var clearResultsCommand: (() -> Void)? {
        get { self[ClearResultsCommandKey.self] }
        set { self[ClearResultsCommandKey.self] = newValue }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        // Browser-style native window tabs (⌘T / "Move Tab to New Window").
        NSWindow.allowsAutomaticWindowTabbing = true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false // keep app alive while tabbed windows exist
    }

    func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool {
        true
    }
}
