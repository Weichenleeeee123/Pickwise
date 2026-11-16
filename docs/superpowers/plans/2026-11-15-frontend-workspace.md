# Pickwise frontend workspace implementation

User approved the layout on 2026-11-15. Direct implementation without TDD, no file deletion, layout commit before poster styling, final verification.

- [x] Split lobby, room, report, evidence/calculations and learning.
- [x] Add persistent navigation, history and explicit local demo.
- [x] Preserve live actions and office motion; isolate page state and polling.
- [x] Verify syntax and commit layout.
- [x] Apply cream, forest green, sage and warm orange.
- [x] Run final tests and desktop/mobile browser checks; commit styling.

Verified: 126/126 tests pass. Desktop and 390px mobile have no horizontal overflow. Five workspaces, demo cost recalculation/reset, history and live-session restoration were checked. Demo API operations produced zero fetch calls.

Environment: old port 4173 returns icon 404; current port 4188 returns 200. No running processes were stopped.

Two existing office assertions at 27400ms assumed every employee remained in transit. Continuous roaming already allows early meeting arrival; assertions now require walking in transit or standing at the assigned meeting coordinate. Production animation code is unchanged.

Demo includes a preloaded teaching case, reports, evidence, local cost/cash calculations and office replay. Free model questions and model-generated exercises stay disabled in demo.
