# Visual Wiki guides for all shops

Simplified implementation plan, 14 September 2026.

Extend the existing Gift Shop implementation to the other **20 customer-facing businesses**. All their help pages already exist; this work gives them the same useful visual treatment.

## Approach

Use **one reusable guide, generated from the existing extractor, with a few business-specific notes**.

Keep the Gift Shop layout: summary, glance tiles, opening checklist, products or services, relevant recipes, suppliers, save context and sources. Hide sections that do not apply. Show secondary products as their own visible cards, with their applicable recipes on the same page. Keep primary and secondary ranges clearly labeled.

The main changes belong in the existing `tools/build_wiki_data.py`, `web/wiki.js` and wording file. Adjust `tools/wiki_data.py` and `web/wiki.css` only where these guides need it.

### 1. Make Gift Shop reusable and prove it on two shops

- Give the existing builder a business ID instead of fixing it to Gift Shop. Extract the game catalogue once, then build each business's guide from it.
- Add `guides[pageId]` to the public payload using the current sample structure. Keep `sample` as the Gift Shop compatibility entry. The renderer reads the selected guide, with the existing reader as fallback.
- Pass the selected guide to the existing rendering helpers. Keep shared page data and provenance where they already live. Each guide includes only its relevant products, equipment and suppliers.
- Give each recipe its own workstation reference and allow multiple recipes per product. This removes the current single-workstation assumption.
- Include the business ID in checklist keys and clear graph selection when switching pages. Use the active business ID for save matching and planner handoff.
- Add **Florist** and **Coffee Shop**. Together with Gift Shop, these cover product-specific shelf capacities, employee-served sales and multiple factory workstations.

**Done when:** all three use the same renderer, Gift Shop retains its existing behavior, and switching guides does not mix their checklist, graph or planner state.

### 2. Populate the remaining retail and food businesses

Most of this is generated content plus a short review of each shop's requirements and source links.

| Businesses | Details to handle |
| --- | --- |
| Bookstore | Book displays, suppliers and recipes. |
| Fruit And Vegetable Store; Supermarket | Scale requirements, including Supermarket's optional produce range. |
| Fast Food Restaurant | Preparation equipment and the correct workstation for each recipe. |
| Clothing Store | Changing Room and distinct clothing variants. |
| Electronics Store; Jewelry Store; Liquor Store | Product-specific sourcing and recipes; Jewelry and Liquor use multiple workstation types. |

Reuse the existing product cards and graph. For a crowded graph, show a product selector and that product's connections. Use the cards as the readable mobile alternative. Add further grouping only if these pages actually need it.

**Done when:** these eight businesses have complete primary and secondary cards and recipes, useful setup checklists, working links and readable desktop/mobile layouts.

### 3. Adapt the same guide for services and venues

Service cards show equipment, employee skills and consumables needed to collect a fee. Physical goods keep the existing product cards. A mixed business can contain both. Use a simple linked dependency list for services; a new service-graph system is unnecessary.

| Businesses | Details to handle |
| --- | --- |
| Hairdresser | Four services, alternative chairs and Hair Care Product dependencies. |
| Gym | Automatic cover charge, required equipment and physical drinks. |
| Event Planning Agency; Graphic Designer; Law Firm; Travel Agency; Web Development Agency | Shared office setup, with each business's own skill and fee. |
| Nightclub | Drinks, cover charge, coat check alternatives and DJ equipment. |
| Cinema; Theater | Correct building type, ticket/equipment/staff requirements and optional concessions. Tickets are services despite their `products-` page IDs. |

Office pages omit stock and manufacturing sections. Mixed businesses show recipes only for physical goods. The planner link appears only when the existing planner supports the range.

**Done when:** these ten businesses work through the same guide components. Together with Gift Shop, Florist, Coffee Shop and the eight retail additions, all 21 customer-facing businesses are covered.

## Keep the data handling straightforward

Preserve complex requirements as linked source wording. A checklist line can say “Hairdresser Chair or Hairdresser Chair (Modern)” without introducing a general-purpose requirements engine. Keep minimum counts and conditions in that wording too.

Use the existing wording file for the small number of authored summaries, grouping choices and cross-page notes, keyed by business ID and source references. Continue reading names, quantities, rates and suppliers from game data. If a note's supporting data changes, flag it for review or omit it.

Retain the accuracy rules that affect players:

- Show capacities for the actual product and keep units, boxes and customers/hour distinct.
- Separate business requirements, linked equipment/service requirements and suggestions. An item absent from the business page is not automatically optional.
- Keep missing or contradictory facts explicit. An unreadable recipe rate is not zero or proof that no recipe exists; retain its source link and gap.
- Apply layout evidence only to the business whose layouts were checked.
- Preserve source badges and the original help disclosure. Keep unknown prices and profit estimates out of the guides.

A normalized entity database, new schema migration project, separate configuration file per shop, coverage-management system and general dependency engine are unnecessary for this release. The bounded per-guide payload may duplicate some relevant records; measure its size before adding a shared-entity layer.

## Verify and ship

Extend the existing Wiki tests where behavior changes: multiple workstations, product-specific capacities, service dependencies and state when switching guides. Check that every target business has a guide and that referenced pages resolve or show an explicit gap.

Smoke-test all 21 pages. Inspect Gift Shop, Florist, Coffee Shop, Clothing Store, Hairdresser, an office and a venue in detail: desktop/mobile, keyboard use, no-save access, map pins, planner selection and browser Back/Forward. Preserve the existing local-watch/export checks.

Run the existing Python and Node/browser suites, rebuild through `build_web.py`, review generated output and update the changelog. Keep unchanged builds deterministic and deploy the generated assets together. Each of the three steps can be reviewed and released as a useful increment.

## Scope and starting point

Factory, Headquarters and Warehouse retain their existing reference pages. Enhanced operational guides for those three are a separate follow-up.

Start implementation from the latest released main branch. The original investigation verified the live [Wiki](https://bigcopilot.com/#wiki) against `C:/Users/Peter/Coding_Projects/big-copilot-wiki-implementation` at `49b27f8`, following PR #22. The current `Big Ambitions` workspace contains earlier work and pre-existing changes; preserve them.

Implementation is complete in `C:/Users/Peter/Coding_Projects/big-copilot-all-shops`, on `codex/wiki-all-shops`, and submitted as PR #25. GLM 5.3 Flash implemented the data/build work through the CLI; Opus 5 implemented the UI against the Gift Shop mockup; Codex authored the text and reviewed the integration. With user approval, Codex finished the final three corrections after GLM exhausted its provider quota.

Validation after review corrections: 233 Python tests and 274 Node/browser tests passed. Source checks verify all 21 guides, 132 offering cards (including 54 secondary products), and 118 recipe flows. Mobile, desktop and keyboard regressions cover the corrected equipment groups and focus/scroll behavior. A second build produced identical HTML, version manifest and Wiki payload bytes.

The independent Astra browser, Opus CLI and Grok CLI findings were assessed and corrected: complete office bathroom groups, business-specific drink equipment, scroll/focus restoration, visible workstation requirements, complete seller lists, applicable source caveats, and the Supermarket scale requirement. Two latent parser/build cases were also fixed with regressions. The initial parallel Node run had one restore file-picker timeout; it passed in isolation and in the complete serial run. No independent review round was repeated.
## Release wording

Explore every shop and service business in the Wiki. All 21 customer-facing businesses have setup checklists, product or service cards, supplier locations and the relevant production recipes. Secondary products have their own visible cards and recipe sections.

The implementation is tracked in [PR #25](https://github.com/PeterHartwieg/big-copilot/pull/25), with its player-facing entry in `web/changelog.json`. The release branch includes the performance improvements from PR #24.

Final validation on the combined release branch: 233 Python tests and all 280 Node/browser tests passed, including the generated-page release check and the six performance regressions. The Cloudflare deployment dry run passed. Before release, the live HTML and version manifest matched `origin/main` byte for byte.
