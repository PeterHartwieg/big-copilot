A live refresh could replace the browser's pending approval view with staffing loading text, hiding the Allow instructions before the player answered. Keep that view open until approval finishes, then recheck the plan against fresh board data before offering Apply. Company/source changes still cancel the dialog, and superseded requests cannot overwrite a newer review.

Refs #524.

Validation: reproduced the disappearing view before the fix. Added five browser regressions covering refresh/approval ordering, fresh-plan rechecking without automatic apply, scope changes, denial and Cancel. Focused suites pass (97 tests; final on-demand-page/regression run 72 tests; regression/global-name run 7 tests). Final CI is green: all six Node shards, both Python shards and assembly, run 40641765021. Self-reviewed; no external reviewer or model invoked.

Remaining verification: the actual Allow button is in the game; this fixes the browser illustration and waiting instructions shared by staffing business types. The report has no save or trace identifying which window disappeared. No mod code changed, and native game-popup behavior remains unverified without the Unity/game environment.

