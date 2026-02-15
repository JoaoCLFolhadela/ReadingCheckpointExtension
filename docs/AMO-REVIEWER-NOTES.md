# AMO Reviewer Notes

## Add-on purpose

Reading Checkpoint is a reading-progress helper for web pages. It lets users annotate blocks/selected text with:

- Read checkpoint (`✓`)
- Attention marker (`!`)

Markers persist locally per URL.

## Permissions

- `storage`: saves user-created markers in local extension storage.
- `menus`: provides context menu actions (toggle marks, clear/undo/redo).
- `<all_urls>`: required so users can use the add-on on any article/site they read.

## Data handling

- No remote requests are made by the extension code.
- No analytics/tracking.
- Data is stored locally via `browser.storage.local`.
- See `PRIVACY.md`.

## Remote code / obfuscation

- No remote code loading.
- No obfuscated/minified unreadable source.

## How to test quickly

1. Open any article page.
2. Hover paragraph/list/heading, apply `✓` and `!`.
3. Select text in one block and use floating quick menu (`✓`/`!`).
4. Use context menu actions for clear/undo/redo.
5. Refresh page and verify markers persist.
