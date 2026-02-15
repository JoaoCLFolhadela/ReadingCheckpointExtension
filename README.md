# Reading Checkpoint Firefox Extension

This extension lets you mark page sections as read (`✓`) or attention-needed (`!`) and keeps those marks for the same URL.

## Install in Firefox (temporary)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**.
3. Select `manifest.json` from this folder.

## Permanent install (signed add-on)

1. Build an XPI package:
   - `./scripts/build-xpi.sh`
2. Upload the generated file in `dist/` to AMO Developer Hub:
   - https://addons.mozilla.org/developers/
3. Choose:
   - `Unlisted` for personal/private distribution, or
   - `Listed` to publish publicly.
4. Install the signed XPI produced by AMO.

## How to use

- Hover a paragraph/list/heading and use the two circles on the left:
  - `✓` for read checkpoint (green highlight)
  - `!` for attention (yellow highlight)
- Lists/enumerations are treated as one block (`ul`/`ol`) rather than per-item markers.
- Highlights are mutually exclusive per marked region.
- You can select text inside one block and a mini floating menu (`!` and `✓`) appears near the selection.
- You can also right-click selected text to open the context menu:
  - **Toggle read checkmark (selected text)**
  - **Toggle attention mark ! (selected text)**
- Right-click anywhere on the page for quick page actions:
  - **Clear all markers on this page**
  - **Undo marker action**
  - **Redo marker action**
- Right-click selected text for:
  - **Clear marker from selected text/block**
- Marks are saved in `browser.storage.local` per page URL.

## Notes

- Checkmarks persist when you reopen the same page URL.
- If a site changes its DOM heavily, some marks may not map perfectly.

## Policy and compliance docs

- Privacy policy: `PRIVACY.md`
- AMO checklist (aligned to Extension Workshop publish policy FAQ): `docs/AMO-COMPLIANCE-CHECKLIST.md`
