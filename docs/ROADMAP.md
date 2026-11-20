# SyncBeats roadmap

This describes contribution areas, not promised release dates. Discuss large changes in an issue before starting. Native clients remain experimental; the web client and backend are the current contribution focus.

| Area | Useful next work | Verification |
| --- | --- | --- |
| Contributor onboarding | Validate setup on a clean checkout and document provider-free development limits | Follow the setup guide with a disposable database |
| Accessibility | Audit keyboard navigation, player controls and screen-reader labels | Keyboard and screen-reader walkthroughs |
| Synchronization | Improve diagnostics for joining and reconnecting devices | Real multi-device measurements under stated conditions |
| Reliability | Add focused regressions for room recovery and queue transitions | Reproduce the failure and verify the fix |
| Documentation | Keep protocol and architecture descriptions aligned with code | Check event names and payloads against source |
| Lint debt | Resolve existing frontend and visualizer violations, then make lint a required CI step | Both package lint commands exit successfully |
| Native clients | Apple Music source access and hybrid cloud/LAN recovery | Platform build plus runtime and multi-device evidence |

Open-source launch prerequisites and repository discovery settings are tracked in [OPEN_SOURCE_PLAN.md](OPEN_SOURCE_PLAN.md).
