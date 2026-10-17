# Raw source fixtures

Small samples of what each public source returns, for offline tests. Fetched or written 2026-10-17. Read only: copy into your own fixtures folder and keep the labels.

Labels: **REAL** = verbatim fetched content. **RECONSTRUCTED** = every value comes from a live fetch, but the XML was re-assembled field by field (the fetch tool returns parsed content, not raw bytes), so whitespace and attribute order may differ. **SYNTHETIC** = hand-made in the documented format.

| File | Source URL | Fetched | Label |
|---|---|---|---|
| `sec-8k-item-2.02.atom.xml` | https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&company=&dateb=&owner=include&start=0&count=40&output=atom | 2026-10-17 | RECONSTRUCTED (GoPro, Inc., Items 2.02, 4.02, 8.01) |
| `sec-8k-item-5.02.atom.xml` | same as above | 2026-10-17 | RECONSTRUCTED (Costco Wholesale Corp, Items 5.02, 9.01) |
| `fed-press-monetary.rss.xml` | https://www.federalreserve.gov/feeds/press_monetary.xml | 2026-10-17 | RECONSTRUCTED (item real; channel title/description assumed) |
| `fred-DGS10-observations.json` | https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&file_type=json (needs an API key) | not fetched | SYNTHETIC (shape per FRED docs; values copied from the Treasury 10 Yr column; `"."` = missing value) |
| `treasury-par-yield-2026.csv` | https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/2026/all?type=daily_treasury_yield_curve&field_tdr_date_value=2026&page&_format=csv | 2026-10-17 | REAL (header + first 3 rows) |

Notes for parsers:
- SEC feed is Atom, ISO-8859-1. Item numbers are in `<summary>` as escaped HTML: one `<br>Item N.NN: Title` per item. The live feed also contains `8-K/A` entries.
- Fed feed is RSS 2.0; `description` repeats the title; `pubDate` is GMT.
- Treasury CSV: newest row first, dates `MM/DD/YYYY`, values in percent.
- FRED returns values as strings; `"."` means no observation.
