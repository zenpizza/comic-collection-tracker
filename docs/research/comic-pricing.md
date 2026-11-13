# Research: estimated price ranges for comics (COM-60)

**Goal:** while browsing at a shop or a street vendor, look up any issue and see what it typically sells for, so you can judge whether an asking price is a good deal.

**Status:** research, November 2026. **Phase 1 shipped** (COM-61): a Price Check tab, plus "Check eBay sold prices" links in the comic detail view and on Add Comic's review step. Prices, plans and API terms below were checked against each source's own pages where possible. Items marked *unverified* come from third-party or forum sources.

## TL;DR

- **Value depends mostly on grade (condition) and whether the issue is a "key."** A single "price" is misleading. Show a range by grade, and say how it was derived.
- **Sold prices are the signal; asking prices aren't.** The best sources aggregate real sales.
- **No source is free, open and licensed for apps:**
  - **eBay's sold-data API** is limited to approved partners.
  - **GoCollect's** API is enterprise-only.
  - **CovrPrice** shows no public API.
  - **GPA** covers CGC-graded books only.
  - **PriceCharting** is the one with a documented, self-serve comics API (prices by grade, UPC lookup). It needs the **$49/month Legendary** plan, and its data is licensed for **internal use only**.
- **Recommendation:**
  1. **MVP, free:** a "Check prices" lookup that opens the issue's **sold listings and price-guide pages** (eBay sold and completed, PriceCharting, GoCollect, CovrPrice) in one tap. There's no licensing problem, no cost, and it works in a shop today.
  2. **If live numbers are worth $49/month:** a **PriceCharting** integration, with server-side cached lookups, prices by grade, and a "good deal?" verdict against an asking price. This fits PriceCharting's internal-use terms only while the app is single-user. Opening it to others (see COM-47) would need their commercial license.

## How comics are priced

- **Grade.** CGC and CBCS grade on the same **0.5–10.0 scale**. Dealers often use coarser bands for cheaper books, where each band covers several points of the 10-point scale. ([mycomicshop grading](https://mycomicshop.com/help/grading))
- **Raw vs slabbed.** A slab (a sealed, graded copy) guarantees condition and authenticity, which makes resale easier and can add a lot of value. Market interest still dominates, and an issue that falls out of favour loses value either way. A common rule of thumb is that grading only pays when the graded value exceeds the raw value plus fees by about 50%. Fees run roughly $20–150+ per book. ([Zapkapow](https://club.zapkapowcomics.com/blog/raw-vs-graded-how-different-values-affect-your-collection), dealer blog)
- **Key issues** (first appearances, deaths, famous covers) are where grade swings value the most. ([Zapkapow guide](https://zapkapowcomics.com/?p=959))
- **Variants.** Ratio variants (1:10, 1:25, 1:50…) are printed in smaller numbers and can be worth far more than cover A. ([Zapkapow guide](https://zapkapowcomics.com/?p=959))
- **Newsstand vs direct edition, printings, signatures** also matter. I found no reliable, quantified source for newsstand premiums. *Open question.*
- **Sold vs asking.** Sold prices reflect the market; listings and shop stickers don't. Collectors commonly cross-check several sources: GPA, eBay sold listings, Heritage and Overstreet. ([CPG forum](https://comicspriceguide.com/forum/messages.aspx?TopicID=11891), [CBCS forum](https://forum.cbcscomics.com/topic/12775/covrprice-vs-gocollect-vs-comicspriceguide/))
- **Thin markets.** Many raw, non-key issues rarely sell, so any estimate for them is low-confidence. The UI should show how much data a number rests on.

## Sources evaluated

| Source | What it is | Raw / graded | Programmatic access | Cost | Fit for this app |
|---|---|---|---|---|---|
| **PriceCharting** | Price guide built from sales, with comics added recently | Ungraded plus 14 grade points (2.0 → 10.0) | **Official API.** Lookup by `id`, `upc` or text `q`, 1 call/s. Daily CSV on Legendary. **Current values only, no sales history.** ([API docs](https://www.pricecharting.com/api-documentation)) | **$49/mo** Legendary for the API; the $6/mo Collector plan has none ([plans](https://www.pricecharting.com/pricecharting-pro)) | **Best technical fit.** Licensed for *internal use only*; sharing with other users needs a commercial license. Data must be purged when the subscription ends. Caching is encouraged. |
| **GoCollect** | Sales-based values and market trends, mainly graded | Graded-focused; raw coverage unclear | **API only on Enterprise** ("Customized API access"); Pro has none ([pricing](https://gocollect.com/pricing)) | Pro $9/mo (no API); Enterprise is custom-priced | Only via an enterprise deal; it has licensed data to other apps before (CLZ) ([CLZ](https://clz.com/comics/desktop/whatsnew/2019/08/13/v19-1-1-automatic-comic-values-powered-by-gocollect)) |
| **CovrPrice** | Fair-market values from validated sales across several marketplaces, not just eBay | Raw and graded | **No public API found** | Subscription | Deep link only. Reported as a CLZ add-on, which implies B2B deals exist *(unverified)* |
| **eBay sold listings** | Raw sales, the ground truth that many guides build on | Both, but noisy (mislabelled grades, lots, variants) | **Marketplace Insights API** (sold items, last 90 days) is a *limited release* for approved partners only ([eBay docs](https://www.developer.ebay.com/api-docs/buy/marketplace-insights/overview.html)); developers report rejections | Free, if approved | **Deep link** to a sold and completed search instead |
| **GPA Analysis** | Verified CGC sales from approved sellers and auction houses; owned by CGC's parent company | **CGC graded only**, no raw | No public API found | Subscription | Graded keys only. Not the in-shop raw use case |
| **ComicsPriceGuide.com** | Long-running guide, free and paid | Raw and graded | No public API found | Free / paid | Collectors report values diverging from real sales ([CPG forum](https://comicspriceguide.com/forum/messages.aspx?TopicID=11891)) *(anecdotal)* |
| **Overstreet Price Guide** | The traditional annual print guide | Grade columns | None known | Book / digital | Reference only; updated yearly, so it lags the market |
| **Heritage Auctions** | Auction results archive | Mostly graded, high end | None known | Free to browse | Deep link for high-value keys |
| **ComicVine / GCD / Metron** | Catalogue data, not pricing | n/a | ComicVine (used already); Metron has a UPC filter | Free | **Matching and metadata only.** GCD lists the *original* cover price |

**Third-party scrapers:** there are Apify scrapers for GoCollect and PriceCharting pages. They depend on page layout, and may breach the sites' terms, so I don't recommend building on them.

## Matching an issue to a price

- **PriceCharting** looks up by text (`q`, best match), by product `id`, or by **UPC**. It doesn't use ComicVine IDs, so the first lookup for an issue needs a confirm step ("Is this the right one?"), after which its `id` should be stored to make later lookups exact.
- **Variants and printings are the main mismatch risk.** A UPC's printing digit can change on a reprint, while the base UPC often stays the same across a series ([Diamond UPC guide](https://www.diamondcomics.com/SiteData/Downloads/UPCGuide%20forComics10-15.pdf)). Always show which variant a price is for.
- **UPCs for older books:** comics before the late 1970s have no barcode, and PriceCharting notes UPCs may be missing for older items. Text search stays the fallback.
- **Metron** offers an exact UPC filter ([Metron API best practices](https://metron-project.github.io/blog/api-best-practices)), which could map a scanned barcode to an issue before the price lookup. Its rate limits are reported inconsistently (20–30/min) *(verify)*.

## Barcode scanning in a shop

- **iOS Safari doesn't support** the browser `BarcodeDetector` API. It's disabled by default through iOS 26, and the feature flag stopped working after iOS 18. It works in Chrome on Android. ([caniuse](https://caniuse.com/mdn-api_barcodedetector), [WebKit bug](https://bugs.webkit.org/show_bug.cgi?id=281848))
- **A practical approach:** use `BarcodeDetector` where available and fall back to a **WebAssembly decoder (ZXing)** on iOS ([write-up](https://dev.to/ilhannegis/barcode-scanning-on-ios-the-missing-web-api-and-a-webassembly-solution-2in2)). That's worth doing in a later phase; typing the series and issue number with the existing autocomplete is fine for an MVP.

## Presenting prices honestly

- **Show a small grade table, not one number:** e.g. *Ungraded*, then graded 4.0, 6.0, 8.0, 9.4 and 9.8. PriceCharting provides exactly these points.
- **Always show the source and date** ("PriceCharting, updated daily"), and that these are estimates.
- **For the "good deal?" verdict,** compare the asking price with the **ungraded or low-to-mid grade** values for raw books, since shops rarely sell raw copies in 9.8 condition. Use plain bands such as *below typical*, *about right*, *above typical*, and say when data is thin.
- **Keys and variants:** warn when the match may be the wrong variant or printing.

## Recommendation and phases

1. **Phase 1, free, about a day of work.** Add a **"Check prices"** action wherever an issue is identified: the Add Comic review step, the comic detail view, and a new quick "Price check" screen that uses the look-up-first search (COM-55) **without adding to the collection**. It opens pre-filled searches:
   - eBay **sold and completed** listings
   - PriceCharting search
   - GoCollect search
   - CovrPrice search

   There's no API, cost or licensing risk. CLZ ships a similar feature ([CLZ eBay links](https://clz.com/comics/mobile/whatsnew/2025/10/24/v10-4-automatic-ebay-search-links)).
2. **Phase 2, only if live numbers are worth $49/month.** A **PriceCharting** integration:
   - A server-side `/api/price-check` endpoint, so the token never reaches the browser.
   - Cached in MongoDB per PriceCharting product, which their terms encourage, with a daily refresh. PriceCharting's 1 call/s limit is fine for one user.
   - The grade table plus an asking-price verdict.
   - Stored PriceCharting IDs on owned comics, which later enables estimated values for the collection.
   - Purging cached data if the subscription ends.
3. **Phase 3, optional.** Barcode scanning (`BarcodeDetector` with a ZXing/WASM fallback) and Metron UPC → issue → price.

## Decisions needed

- **Phase 2 cost:** is $49/month worth it? Without it, Phase 1 still makes in-shop checks quick.
- **Licensing:** PriceCharting's internal-use license fits while the app is single-user. Before opening the app to other users (COM-47), either get their commercial license or switch the feature to links only.
- **GoCollect Enterprise:** worth a sales enquiry only if graded and trend data become important. Pricing isn't published.

## Sources

- PriceCharting: [API documentation](https://www.pricecharting.com/api-documentation), [subscription plans](https://www.pricecharting.com/pricecharting-pro)
- GoCollect: [pricing](https://gocollect.com/pricing), [CLZ values powered by GoCollect](https://clz.com/comics/desktop/whatsnew/2019/08/13/v19-1-1-automatic-comic-values-powered-by-gocollect)
- eBay: [Marketplace Insights API overview](https://www.developer.ebay.com/api-docs/buy/marketplace-insights/overview.html), [Marketplace Insights access discussion](https://community.ebay.com/t5/eBay-APIs-Talk-to-your-fellow/Marketplace-Insights-API-access/m-p/34838736)
- GPA: [About GPAnalysis](https://comics.gpanalysis.com/about-gpanalysis), [Quality Comix GPA guide](https://www.qualitycomix.com/guide/gpanalysis/)
- Collector discussions: [CovrPrice vs GoCollect vs CPG (CBCS forum)](https://forum.cbcscomics.com/topic/12775/covrprice-vs-gocollect-vs-comicspriceguide/), [CPG value discrepancies](https://comicspriceguide.com/forum/messages.aspx?TopicID=11891), [CLZ thread on CovrPrice data](https://club.clz.com/t/inaccurate-price-data-amazing-spider-man-363-newsstand/17070)
- Grading and value: [mycomicshop grading](https://mycomicshop.com/help/grading), [Zapkapow: raw vs graded](https://club.zapkapowcomics.com/blog/raw-vs-graded-how-different-values-affect-your-collection), [Zapkapow grading guide](https://zapkapowcomics.com/?p=959)
- Matching and barcodes: [Diamond UPC guide](https://www.diamondcomics.com/SiteData/Downloads/UPCGuide%20forComics10-15.pdf), [Metron API best practices](https://metron-project.github.io/blog/api-best-practices), [caniuse BarcodeDetector](https://caniuse.com/mdn-api_barcodedetector), [WebKit bug 281848](https://bugs.webkit.org/show_bug.cgi?id=281848), [iOS barcode scanning with WASM](https://dev.to/ilhannegis/barcode-scanning-on-ios-the-missing-web-api-and-a-webassembly-solution-2in2), [CLZ automatic eBay links](https://clz.com/comics/mobile/whatsnew/2025/10/24/v10-4-automatic-ebay-search-links)
