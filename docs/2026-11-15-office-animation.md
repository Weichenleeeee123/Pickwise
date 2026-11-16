# Pickwise office animation — 2026-11-15

Production walking artwork: six `assets/team/*-walking-four-v11.webp` sheets, each 1024 by 1024 with four frames per direction. Rows are south, west, east and north. All directions were generated independently using the user-authorized OpenAI Next image service and gpt-image-2.6. Walking has lowered swinging arms and stepping legs. The rejected discussion-pose limb-warp experiments remain preserved but unused.

Appearance references come from existing standing characters; the approved first four-direction sheet supplies pose and layout for the other five characters. Source PNGs are preserved in output/imagegen/pickwise-walk-v10. API credentials are not stored in this document or in the repository.

Extraction: scripts/prepare-directional-walk.py. It detects row boundaries, removes exterior white background and detached specks, keeps complete heads and shoes, and registers each row to a shared baseline at y=238. Per-asset manifests record source and output hashes.

Runtime: occupied chair composites at workstations; dedicated directional walking sheets during travel; inward-facing standing discussion gestures only after arriving at the table. Empty chairs stay at desks. The walking direction selects a separately drawn atlas row, without mirroring discussion poses. Floor anchors align on departure and arrival. Routes avoid the table. Playback time controls position and animation frame together, so pause and seek freeze both. Live motion persists across rerenders and supports reversal before arrival.

Validation: 19 targeted office, UI and resource checks pass. Browser checks confirmed all four walking rows, clean transparency, and all six actors returning to occupied chair composites; console errors: zero. Current preview: http://127.0.0.1:4188/?office-demo.

User constraints: never delete files; use targeted verification for animation adjustments instead of repeatedly running unrelated suites.

## Follow-up: stable desks, roaming, symmetric summary

The user accepts the four-direction walking artwork. Working employees now use a fixed occupied-chair frame: the generated whole-person frames changed the chair-back and head pixels as well as the hands, causing visible shaking every 420 ms. Stop cycling whole chair composites while seated.

Idle employees no longer remain seated. src/ui/office-motion.js keeps independent positions, randomized aisle destinations and work/idle/meeting intents. The user subsequently requested continuous roaming with no stops: choose the next destination immediately on arrival, including within the same movement update. Only active work recalls an employee to their own workstation; summary recalls everyone to the table. Paths avoid the table and desks. Runtime state survives rerenders, and deterministic replay keeps seek and pause coherent.

Summary positions now form a symmetric six-person ring about x=770, with mirrored upper/lower side pairs and centered top/bottom positions. Keep this geometry symmetric when making subsequent adjustments.

Verification for this follow-up: 23 targeted office/UI/resource checks pass; browser inspection confirmed stable seated frame 0, simultaneous independent walking/pauses, symmetric summary arrangement and zero console errors. The existing port 4188 preview serves the changes after refresh.
