# Marketing write: one click to the cheapest campaign mix

Scope, 28 September 2026. It follows the uniforms write (`docs/mod-write-back-scope.md`
section 3, `POST /write/uniforms`): the board's finding kind `promotion` (labelled "Campaign
mix", formerly "Promotion below cap") names the sites whose cheapest mix differs from what
they run; this adds a button that sets it through the game link mod.

## 1. How the game works (read from `BigAmbitions.dll`, build 3680)

- A business holds `marketingCampaigns`: a list of `{agencyAddress, marketingTypeName, enabled}`.
  One campaign per agency and type. Six types (`Entities.MarketingTypeName`), hard-coded in
  `MarketingTypeSettings..cctor`:

  | Type | Id | $/day | Reach (m²) | $ per m² |
  | --- | --- | --- | --- | --- |
  | Small internet | 0 | 100 | 20 | 5.0 |
  | Medium internet | 1 | 250 | 40 | 6.25 |
  | Large internet | 2 | 500 | 60 | 8.3 |
  | Small billboard | 3 | 500 | 100 | 5.0 |
  | Medium billboard | 4 | 2,500 | 250 | 10.0 |
  | Large billboard | 5 | 6,000 | 600 | 10.0 |

- `BuildingRegistration.GetMarketingEfficiency`:
  `marketing = min(1, Σ reach(enabled) × type.marketingReachMultiplier / building m²) × 100`.
- `BusinessHelper.UpdatePromotion`:
  `total = min(100, round(traffic + round(marketing) × neighbourhood.marketingStrength))`.
  Only for types tagged `hasmarketingpromotion`.
- Billing: `MarketingHelper.RunDaily` charges the enabled campaigns' price at midnight. If it
  cannot be paid, every campaign of that business is disabled. Nothing is charged up front.
- Two ways the game changes campaigns:
  - At the agency, in person (`MarketingAgencyDialog.OnMarketingSettingsSet`): it adds or
    enables the ticked types and removes the unticked ones, then `UpdatePromotion` and the game
    event `ba:gameevent_newmarketing`.
  - On the phone, from anywhere (`BizManMarketing.UpdateCampaignEnabled`): it toggles `enabled`,
    and adds the campaign if it is missing, but only for agencies the business already appears
    under. Then `UpdatePromotion`.
- **Why setting up a shop is tedious.** BizMan's Marketing page (`RefreshCampaigns`) draws a
  block of switches only for agencies that already have a campaign entry for that business,
  enabled or not. It shows a switch for every type the agency offers. The agency also has to be
  a phone contact. The contact is added only by talking to the agency's employee in person
  (`BuildingRegistration.GetOrAddBusinessContact`, called from `SpecialEmployeeController`).
  So each new shop means:
  1. Visit each agency once to get the contact.
  2. Call it.
  3. Go through the chat dialog.
  4. Tick the types.

  Only after that do the switches appear.
- In a save, contacts are `GameInstance.Contacts`: `{id, streetName, streetNumber, category,
  messagesQueue}`. In Peter's city the agencies are "McCain's eMarketing" and "CityAds".

**Checked against every save on disk.** Taking m² from `ba_buildings.json` (`m`):
- The type multiplier is 1.0 for every type seen except cinema and theater, which are 2.0.
- Neighbourhood strength is Midtown 0.5, Hell's Kitchen 0.7, Murray Hill 0.8, Garment District
  0.9, and 1.0 in Industry City, Lower Manhattan and the Hamptons.

In the cities seen, Third Ave 17 sells the three internet types and Second Ave 5 the three
billboards.

## 2. What "optimal" means

Settled by Peter on 28 September 2026. There are six types, each on or off: 64 mixes, so brute
force is enough.

- The plan is the **cheapest mix that brings promotion to 100**.
- If no mix can do that, the plan is the **cheapest mix that brings marketing to 100**.
- There is no tolerance: 99 is short.
- The types the site already has a switch for always count: an existing switch flips at any
  time (section 3). A type with no switch counts only when an agency that sells it is a phone
  contact. With neither and a change needed there is no plan, and the line names the agencies
  to visit once; a site whose plan a first visit would improve gets a "Visit … once" hint.
- Ties go to fewer campaigns, then to the mix the shop already runs.

The same search also drops campaigns that only push past the target, so one button covers both
underspending and overspending.

What that search gives on Peter's saves:
- **Recover #0:** 24 shops already on plan. A Murray Hill gym saves $150 a day. Three shops are
  short: a liquor store could reach 100 for $850 a day, and two Midtown cinemas at 77 and 82
  could reach 100 for $3,000–3,750 a day.
- **Safara:** 14 shops on plan and 3 short. Two are at 99. The third, a Midtown bookstore, can
  reach no more than 82, and full marketing costs $2,500 a day against its $1,350 now.

Shops and offices are covered. Headquarters have a promotion but no customers, so they are excluded.

## 3. The wire: `POST /write/marketing` (mod 0.4.0, additive, `schemaVersion` stays 1)

```json
{"dryRun": true, "expect": {"character": "…", "company": "…"},
 "sites": [{"address": {"street": "ba:street_secondavenue", "number": 12},
            "on": ["SmallInternet", "SmallBillboard"],
            "was": ["SmallBillboard", "LargeInternet"]}]}
```

- `on` is the full set of types the site should have enabled after the write. Every other
  campaign is **disabled, never removed**, the way the phone does it, so undo stays exact.
- `was` is the enabled set the page planned from, used as the compare-and-set. If it differs
  from the game, that row answers `changed` and nothing is written for it.
- **Agency:** for each type, use the agency the business already uses for that type. Otherwise
  use the first agency whose `MarketingAgencySettings.marketingTypesAvailable` offers the type,
  found by walking the buildings. There is one campaign per type, as in the game: its dialog
  removes a type from every other agency when it sets that type.
- **Existing switches any time; new ones only through known, open agencies** (Peter, 28 Sep 2026,
  revised the same evening). A campaign entry the business already has (a switch in BizMan)
  can be turned on or off at any time, exactly as the phone does; no contact or opening check.
  Only a NEW entry, a type the business has no switch for yet, needs its agency to be a phone
  contact (the player visited it once) and open at the moment of the write. Open is the game's
  own `BusinessHelper.IsBusinessOpen(reg, -1)`. The mod never adds a contact.
- **Set-up, done by every write** (it replaces the call and the chat, not the first visit): the
  site gets an entry for every type each usable agency offers, the unused ones disabled. After
  one write, BizMan shows the full set of switches for that site, and the player can adjust it
  by hand from then on. A disabled entry costs nothing: billing, reach and the billboards in the
  world all count enabled campaigns only. The write adds no chat messages; the mod's usual
  notification says what changed.
- **Seeding needs no consent from a closed agency:** new switch entries go only to agencies that
  are a contact and open; a closed or unknown agency just gets none, and that alone refuses nothing.
- **What a row may touch:** flipping existing entries is never refused for agency reasons. A
  row is refused with `no_contact` or `agency_closed` only when a type in `on` has no entry
  and no agency selling it is a contact and open; the answer names the agency and, when
  closed, its next opening. Undo only flips existing entries, so it is never refused for
  agency reasons.
- **Calls after the write:** `UpdatePromotion`, and `GameEvent ba:gameevent_newmarketing` when a
  campaign is added. The answer carries:
  - the resulting `promotion {trafficIndex, marketing, total}` and `dailyCost`, so each apply
    checks the board's model against the game
  - `entriesAdded`
- **Row errors:** `not_found`, `not_rented`, `no_business`, `no_promotion` (the type is not
  tagged), `no_agency` (no agency offers the type), `no_contact`, `agency_closed`.
- **Undo:** `POST /write/undo {"kind": "marketing"}` restores the previous enabled flags on
  campaigns that are still as the write left them. Campaigns the write added are disabled
  again. The added entries stay, because they are set-up and cost nothing.
- Everything in "Every write" applies unchanged: pairing, `busy`, `cannot_write`, the notify
  message, 256 KiB.

## 4. The board

- **Extraction:** per shop, `campaigns[]` (type, agency, enabled) and `marketingPlan`
  (`on`, cost now vs. plan, promotion now vs. plan). The inputs are m² from `ba_buildings.json`
  and two constants tables with a build comment: `MARKETING_TYPES` and the per-neighbourhood
  and per-type factors.
- **Site panel, Promotion block (`spPull`):** a line "Cheapest mix: Small internet + Small
  billboard · $600/day · 100%" and a **Set** button. The button shows when the plan differs
  from now, or when the shop lacks any of the six entries. Without the mod, the line tells the
  player what to tick in BizMan.
- **Finding `promotion`** (Peter, 29 Sep 2026, after the in-game test), plan-based, shops and
  offices alike, sites not trading yet left to their own finding. Up to four lines, each
  with its own subject and so its own id:
  - the sites the plan raises, leading with the gain ("3 sites can reach 100% promotion for
    less: …"); a warning when one gains `PROMOTION_GAP` points or more, else an opportunity;
  - the sites that only pay for campaigns past the target ("HART. Gym can save $150/day at
    the same promotion"), an opportunity;
  - the sites with no plan, since they have no switch and no agency is a contact ("Visit
    CityAds once: no campaign can be set at … before that");
  - the sites on the best mix their known agencies allow, short of 100, that a first visit
    would raise ("Visit CityAds once to raise promotion at …"); a visit that would only save
    money is the Promotion block's hint alone.

  A plan that only adds missing switches changes neither cost nor promotion and is no
  finding. Each of the two mix lines carries its own "Set the cheapest mix at N sites",
  over exactly its own sites. Either opens the same dry-run dialog as the uniforms write
  (the write-dialogs canvas), with one row per site: now → plan, and $/day before → after.
- **Set up all sites:** a Marketing action in Businesses › Standards for every shop or office
  missing entries, one not trading yet included, so a new site needs no phone call. It
  applies each site's plan, which already includes the set-up. It runs one write, so it shares the dialog above. A site
  already on plan reads "+3 switches", and switches that wait for an agency are one short
  clause ("2 switches later, Tuesday 8:00"). A dry run that would change nothing is one line
  with no Apply.
- **Offices:** the office site page gets the same Promotion line and button, and the finding
  and both all-sites actions include offices.

## 5. Work and order

Two PRs, like the write-back:

1. **Board and mock** (Opus worker):
   - extraction plus the optimizer, with `tests/test_marketing_plan.py`
   - the button and dialog, with a Node test on the dialog
   - `tools/game_link_mock.py` accepts `/write/marketing`
   - the contract in `docs/game-link-api.md`
   - both clients: the `web/app.js` third source and `--game`
   - payload snapshots regenerated
   - the `docs/architecture.md` registries row for the payload keys

   Behind `writes` containing `"marketing"`, so it ships dark until the mod does.
2. **Mod 0.4.0**: `MarketingWrite.cs`, modelled on `UniformWrite.cs`, plus the `LinkHttpServer`
   route and the `writes` list. Built by Peter on the Mac, then a Workshop release and a deploy.

Before building, read `NeighborhoodData.marketingStrength` and
`BuildingTypeData.marketingReachMultiplier` from the Addressables bundles (UnityPy, as
`make_demand_curves.py` does). This confirms the values in section 1 and covers neighbourhoods
and types no save has shown yet. Add both to the `docs/game-update.md` checklist.

## 6. Decisions

Settled by Peter on 28 September 2026:
- **Target:** promotion 100, or marketing 100 when promotion 100 is out of reach (section 2).
- **Set-up:** the write replaces the call and the chat (section 3).
- **Known and open agencies only for new switches:** the plan uses the types the business
  already has a switch for, plus types sold by agencies that are phone contacts; a new switch
  needs its agency open at the moment of the write (section 3). Existing switches change any time. The board reads both from the
  save: `Contacts` (`streetName`, `streetNumber`) and the agency registration's `scheduleDays`
  and `temporarilyClosed`, against the save's day and hour. So the line can say "CityAds opens at
  8:00" or "Visit CityAds once to add billboards" before the player clicks.

- **Offices are included**, like shops. Headquarters, warehouses and factories are not: they
  have no customers, or no `hasmarketingpromotion` tag.
