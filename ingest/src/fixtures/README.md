# Fixtures for offline tests and `--dry-run`

Labels: **REAL** = verbatim fetched content. **RECONSTRUCTED** = every value comes from a live fetch, but the file was re-assembled field by field. **SYNTHETIC** = hand-made in the documented format. Each file says its label in its first line (or `_comment` field).

| File | Label |
|---|---|
| `sec-8k-item-2.02.atom.xml`, `sec-8k-item-5.02.atom.xml` | RECONSTRUCTED (SEC current 8-K Atom feed, 2026-10-17) |
| `sec-8k-feed.atom.xml` | RECONSTRUCTED (the two entries above in one feed) |
| `fed-press-monetary.rss.xml` | RECONSTRUCTED (Federal Reserve monetary policy RSS, 2026-10-17) |
| `treasury-par-yield-2026.csv` | REAL (header + 3 rows) |
| `fred-DGS10-observations.json` | SYNTHETIC (FRED JSON shape) |
| `sec-company-tickers-exchange.json` | SYNTHETIC (SEC ticker list shape) |
| `sec-filing-index.html`, `sec-primary-8k.html` | SYNTHETIC (generic filing pages, no company facts) |
| `fed-press-release.html` | SYNTHETIC (generic press-release page) |
