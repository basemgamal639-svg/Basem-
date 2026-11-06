---
name: google-maps-scraper
description: Guide for using omkarcloud's Google Maps Extractor (github.com/omkarcloud/google-maps-scraper) to build local-business lead lists from Google Maps - search strategies, filters, geolocation/polygon searches, country-level runs, the 50+ output fields, enrichment (emails, socials, phone type) and pricing. Use when the user wants Google Maps leads, asks how to configure or run the Extractor app, or needs to interpret/clean its CSV/JSON exports.
---

# Google Maps Extractor (omkarcloud)

The upstream repo ships **no scraper source code**. It documents a desktop app
(Windows / macOS / Linux, built on Botasaurus Desktop) that the user downloads
and runs themselves: https://www.omkar.cloud/google-maps-extractor/download

Claude cannot run the app from a cloud session. Help the user plan searches,
pick settings, and work with the exported data.

## Workflow
1. Clarify the target: business type + location (e.g. "restaurants in New York City").
2. Recommend settings (below), then have the user run it in the app and export CSV/JSON/Excel.
3. Process the export: dedupe on `kgmid`, filter, score, and format for outreach.

## Search strategy
| Strategy | When |
|---|---|
| **Detailed** (default) | Almost everything; finds the most businesses |
| **Fast** | Whole-country runs (~4% fewer results, ~15% faster) |
| **Fastest** | Whole-country runs on machines with < 8 GB RAM |
| **Zoom 15–18** | Advanced only; very slow. Never use Zoom 18 for a country (20–30 days) |
| **Geolocation** | Custom area: draw polygons at geojson.io and paste the GeoJSON into *Polygons Data* |

Country-level runs: use the Country Level Data feature with **Fast**. Expect 2–3 days for large countries such as the US.

**Filters for Faster Runs** (3–5x faster): quick picks such as Operational only,
75+ reviews, 4★+, Has website, Has phone. Use **Category In** + "Suggest with AI" for categories.

## Data handling rules
- Use **`kgmid`** as the unique key. It is always present. `place_id` can be null.
- Rental/hotel-only fields (`checkin_date`, `bedrooms`, `hotel_stars`, ...) apply only when `is_rental` is true.
- To keep non-English characters, export with UTF-8 (see `references/advanced.md`).
- Result counts can drop after a task completes because of deduplication. This is expected.
- Full schema: `references/fields.md`.

## Enrichment (optional, paid credits; 1 credit = $0.01, 100 free/month)
API key from https://www.omkar.cloud/api-key goes into the app's **Enrichment** section.
- Website emails + socials: 0.2 credits/business
- AI email recommendation: free
- Email verification: MillionVerifier 0.2, ZeroBounce 1 credit/email
- Phone carrier (mobile vs landline): 2 credits
- AI sales summary: 1 credit; Apollo decision-maker: 2 credits/person

The open-source website email part is github.com/omkarcloud/website-email-contact-scraper.

## Pricing (per search, about 500 results each)
Free: 200 searches/month · Starter: $16/month for 5,000 · Unlimited: $48/month.

## References
- `references/fields.md`: complete output schema
- `references/advanced.md`: geolocation, country-level data, limits, export encoding, macOS Chrome issues
- `references/server-deployment.md`: running the extractor on AWS/GCP VMs

## Compliance
Remind users that cold outreach to scraped contacts must follow local law (CAN-SPAM, GDPR, etc.) and Google's terms.
