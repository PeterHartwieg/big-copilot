# Workshop artwork

Workshop cover images for the Mods catalogue. Retrieved on 21 October 2026 through Steam’s public `ISteamRemoteStorage/GetPublishedFileDetails/v1/` API, using each item’s `preview_url`. Artwork belongs to the respective mod creators. Titles and descriptions in `template/board.js` are curated from those Workshop listings; descriptions are shortened for the catalogue.

Covers are kept on this site so opening the catalogue sends no request to Steam. WebP copies have a maximum width of 640 pixels, retain the original aspect ratio, and strip metadata. Standalone exports embed these files. To update a cover, fetch the current preview URL for its item ID and convert it with `cwebp -q 85 -resize 640 0 -metadata none <source> -o <file>`.

| File | Mod / source | Creator |
| --- | --- | --- |
| `street-food.webp` | [HART. Street Food](https://steamcommunity.com/sharedfiles/filedetails/?id=3822355169) | Peter Hartwieg |
| `seasons.webp` | [Alcware - Seasons](https://steamcommunity.com/sharedfiles/filedetails/?id=3803289067) | Alcsaar |
| `retail-expansion.webp` | [Alcware - Retail Expansion](https://steamcommunity.com/sharedfiles/filedetails/?id=3801675050) | Alcsaar |
| `economy-expansion.webp` | [Economy Expansion](https://steamcommunity.com/sharedfiles/filedetails/?id=3811945186) | Andre1408 |
| `big-copilot-link.webp` | [Big Copilot Link](https://steamcommunity.com/sharedfiles/filedetails/?id=3806322395) | Peter Hartwieg |
| `campaign-objectives.webp` | [Campaign Objectives](https://steamcommunity.com/sharedfiles/filedetails/?id=3807225297) | Peter Hartwieg |
| `free-camera.webp` | [HART Free Camera](https://steamcommunity.com/sharedfiles/filedetails/?id=3806807684) | Peter Hartwieg |
| `self-driving.webp` | [HART. Self Driving](https://steamcommunity.com/sharedfiles/filedetails/?id=3819853552) | Peter Hartwieg |
| `rdstr.webp` | [HART. RDSTR](https://steamcommunity.com/sharedfiles/filedetails/?id=3821783833) | Peter Hartwieg |
