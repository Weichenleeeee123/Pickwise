# Pickwise OPC Pitch Materials Design

## Objective

Prepare a Chinese-language, solo-presenter submission package for the 2026 Huairou Science City OPC Innovation Challenge. The package must explain Pickwise's business model and AI employee, demonstrate verified product behavior, and follow the handbook's material and timing requirements.

## Deliverables

1. An editable 16:9 PowerPoint deck with no more than eight slides, suitable for booth review and a five-minute final pitch.
2. A standalone, one-page business model canvas covering the eight required elements.
3. A standalone, one-page AI employee job description covering role, inputs, outputs, human intervention, and acceptance criteria.
4. A disclosure brief separating pre-existing work from work added during the 48-hour competition period.
5. A solo-presenter runbook with a five-minute talk track, live demo cues, and a two-minute judge Q&A bank.

## Pitch Narrative

Positioning alignment confirmed by the user on 2026-11-16: Pickwise is fundamentally an e-commerce product-selection Agent, a digital employee for an e-commerce OPC operator. Embedded teaching differentiates that working Agent as a selection coach. Give equal weight to completing the real selection task and explaining the data and reasoning so a novice operator can gradually learn to judge product value through repeated use. The current first-release scope remains candidate-product analysis for Amazon US.

For Expo and the pitch, first establish the digital employee's job and show its actual research, analysis, calculations and deliverable. Then show how teaching is embedded in that same process and result, followed by practice on another product. Use docs/2026-11-16-project-positioning.md as the current messaging reference.

This is a live, five-minute contest pitch, not an investor deck meant to be read alone and not a technical report. Keep slide copy sparse and legible from the back of a room; put speaking prompts in PowerPoint notes and the separate presenter runbook. Each slide makes one audience-facing point and earns its place in the story.

Story spine:

- Once upon a time: a first-time Amazon seller has a product candidate and a marketplace page full of signals.
- Every day: the seller has to decide whether those signals justify spending scarce first-batch cash.
- One day: a real Pickwise run shows that visible price, rank, and rating still do not establish product demand, profit, or fit for this seller.
- Because of that: the product-selection Agent researches the candidate, checks evidence, compares products, calculates costs where inputs permit, and delivers an actionable analysis with explicit unknowns.
- Because of that: teaching embedded in the real work explains which data matters, why it matters, and how it supports a product-value judgment. The seller can practise that method on another candidate.
- Until finally: the OPC can offer a repeatable, per-candidate coaching service while the seller retains the investment decision.

The position is: Pickwise completes product-selection work as an OPC's digital employee and builds the operator's understanding through teaching embedded in that work. Handling insufficient evidence honestly is a quality requirement of the Agent, not the entire product proposition or the teaching differentiator. The stakes are the operator's inventory spending and ability to make informed product decisions. The ending is: "选得聪明，不是选得快。"

Current eight-slide arc, aligned on 2026-11-16: product and digital-employee role; the solo seller's selection workload and need to understand decisions; the Agent's work and deliverables; evidence of actual work in one verified case; teaching embedded in that same case and result; practice on another product; the service unit, pricing hypotheses, cost and human decision boundary; verified status and the next user-validation invitation. Keep pre-existing-work disclosure traceable in supporting material and the closing note. The timed rehearsal outline and demo-selection constraints are in docs/2026-11-16-pitch-narrative-v4.md. Implementation architecture, API inventories, and test internals stay in supporting documents unless a judge asks.

The demo example is the verified Amazon US ASIN run recorded on 2026-11-15. Present it as a real system run, not as a customer outcome. That run has no user-entered operating costs or initial judgment, so it does not establish profitability, a learning gain, willingness to pay, or market demand. Its story is that available product-page and vendor signals are not enough to justify an investment, and the product correctly calls for more evidence.

## Evidence and Claim Rules

- Use existing repository records for product behavior, tests, API observations, and the verified demo.
- Mark the ¥49 single-session and ¥129 three-session prices as unvalidated pricing hypotheses.
- Do not claim paying customers, validated learning outcomes, revenue, savings, market size, or commercial impact without evidence in the project records.
- Distinguish facts, vendor estimates, user assumptions, and unknowns in slide labels and speaker notes.
- State that the 94/94 offline regression result verifies the recorded test suite only; it is not proof of production reliability.
- Describe the team as one person. Leave name and contact fields blank when no source provides them.
- Updated user clarification on 2026-11-16: the entrant developed the project alone from scratch. Do not classify the project's early PRD or foundational commits as carried-in pre-existing work solely because they precede later commits. Describe the current project's chronological development and reused third-party dependencies honestly. Formal 48-hour boundaries still require the organizer's actual clock; do not infer them from Git timestamps. Use docs/2026-11-16-submission-preparation.md and the latest submission disclosure instead of the older disclosure's classifications.

## Design and Accessibility

Use a restrained, high-contrast visual system consistent with the Pickwise identity in the repository. Treat the deck as a live stage presentation: one strong headline, one visual or evidence excerpt, and minimal supporting copy per slide. Avoid architecture diagrams, API lists, implementation chronology, and screenshot tours. Use the real product screen only to prove the decision moment, not as the narrative itself. Keep the eight-element canvas readable on one page and the job description to one page. Use Chinese fonts available in the environment and ensure text remains editable in Office formats.

## Validation

- Confirm slide count is at most eight and each required contest topic is covered.
- Cross-check factual statements against the PRD, evidence completion log, test log, and verified demo report.
- Run the full talk track against five minutes and make sure the opening, demo turn, and close fit without rushing.
- Render every DOCX page and every slide, then inspect at readable size for clipping, overlap, font substitution, or missing content.
- Check all deliverable files open and contain their expected sections.

## Out of Scope

No project code changes, contest submission, account registration, external messaging, invented team details, new market research spend, or unsupported customer claims.
