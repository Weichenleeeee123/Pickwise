# Four-direction source expansion

Approved by the user on 2026-11-16: implement all four previously recommended directions, inspect better Actors, retain direct implementation without TDD, then verify.

- [x] Compare schemas/pricing and run capped samples.
- [x] Add bounded keyword fallback with provenance and relevance filtering.
- [x] Add no-login US review fallback, with explicit featured/recent sample semantics.
- [x] Add Buy Box/offer/seller/fulfilment snapshots with price-condition boundaries.
- [x] Add category Best Sellers/New Releases/Movers source, preserving empty-list status and real sample-to-sample changes.
- [x] Feed all records into evidence coverage, Agent tools, UI and Markdown.
- [x] Add regression coverage, run live adapter acceptance and full tests, restart idle service and commit.

Constraints: share the two-run Apify queue, keep per-Actor caps, no plan upgrades, no file deletion, no fake volumes/orders/reviews/movement. Legacy login-required review actor stays disabled; the newly authorized no-login path is separately controlled.

Accepted Actors: pravus/amazon-keywords; junglee/amazon-reviews-scraper with jdtpnjtp/amazon-reviews fallback; cleanpull/amazon-product-scraper; topapi/amazon-bestsellers-scraper. Five lightweight no-login review candidates were empty for this ASIN; Junglee returned 8 and then 10 genuine US reviews. Junglee requires a $0.50 maximum-run budget, while the measured 10-review run charged $0.06. No plan upgrade was made.

Live capture: 25 keyword estimates (4 relevant category terms), 10 US reviews, 8 offers, 10 Best Sellers and 10 New Releases. Movers returned no rows and remains explicitly unavailable; genuine rank changes require two actual captures. Agent acceptance confirms the new material reaches the report prompt; model output is not a fallback.

Desktop and 390px checks performed. Tables scroll inside their containers; the page has no horizontal overflow. Full tests: 144 passing at final release check.
