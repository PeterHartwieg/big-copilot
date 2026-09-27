# Navigation layout: sidebar A / B / C

Canvas: https://claude.ai/artifact/AJjoC3UAJVEc3W5ttVQchk (Design type, 10 artboards).
Generator: `build_nav_canvas.py` (icons from `../ui-redesign/kit.py`). Rerun it and never
hand-edit `project/`. `--preview` writes plain HTML into `_preview/` for screenshots.

Baseline: the implemented board at `0c33440` (ui-redesign-chunk3 worktree), rendered from
the synthetic fixture (QA Expanded Co., HART. sites). Styles follow its TEMPLATE tokens
and components. All frames are 1440 wide, light, full page down to the end of the content
(the footer is left out: it is the same in every variant). The sidebar is drawn as a
sticky 900 px column at scroll top, so its foot sits at the bottom of the first screen.

## Layout of the canvas

| Row | Now | A | B | C |
| --- | --- | --- | --- | --- |
| Supply › Imports | `Main` | `ImportsA` | `ImportsB` | `ImportsC` |
| Overview | `OverviewNow` | `OverviewA` | `OverviewB` (merged ··· open) | `OverviewC` |
| B extras | `ImportsB1100` (rail) | `ImportsBDark` | | |

## What moves where

| Element | Now | A | B | C |
| --- | --- | --- | --- | --- |
| Company name, dot, sphere | masthead | sidebar head | sidebar head | sidebar head |
| Five areas | tab row | sidebar | sidebar | sidebar |
| Views (Changes 14, Imports 7 …) | row under areas | top of content, left | sidebar, nested under the open area | sidebar, nested |
| View controls (scope, Needs a change / Everything, Full production / Shop demand) | same row, right | same row as the views | top of content, alone | sidebar, under the active view |
| City map, Game guide (NEW) | masthead | sidebar, below areas | same | same |
| Search | masthead icon | sidebar, under the head | same | same |
| Update, ··· | masthead (two ··· menus) | sidebar foot, one ··· | same | same |
| Clock | masthead right | sidebar foot | same | same |
| News strip | above everything | top of content column | same | same |

The merged ··· holds the save source (status line, Choose save folder, Link to the game,
Open one save file, Where is my save?) and the utilities (What's new, Preferences, Help &
feedback). Update stays a visible button beside it.

Sidebar widths: A 240, B 256, C 280 px. On Imports the focused card starts at y = 262 (Now),
114 (A), 118 (B) and 60 (C), news strip included.

B at 1100 px collapses to a 64 px icon rail (sphere, search, areas, references, clock,
Update, ···) and puts the views back at the top of the content with the controls, which
wrap to a second line: the rail cannot show the nested views.

## Open questions

1. B and C expand only the open area's views; the others show a chevron. Expand all
   areas instead (about 20 rows, still fits 900 px in B, not in C)?
2. B's collapsed rail falls back to A's view row. Alternative: a flyout of the views on
   hover of the area icon, keeping the content top empty.
3. C puts the controls far from the table they change, and they disappear with a
   collapsed sidebar. Does Overview need anything in the sidebar in C (Needs attention /
   All tools as jumps), or is it right that Overview has no nested views?
4. The source status line in the sidebar foot duplicates the one inside ···. Keep one?
5. News strip: over the content column (drawn) or across the full width above the sidebar?
