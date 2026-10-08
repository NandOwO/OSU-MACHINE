# Fixtures

`fixtures/private/` is git-ignored. It holds third-party files used only by local validation tests:

- `erisu-insane.osu`: difficulty `[Erisu's Insane]` from DIALOGUE+ - Deneb to Spica (TV Size), extracted from the `.osz`.
- `erisu-insane.osr`: replay of that difficulty (MD5 `58a613f1f28b2b9388413b4ef5a30dd3`, no mods).

Without them, the replay tests are skipped.
