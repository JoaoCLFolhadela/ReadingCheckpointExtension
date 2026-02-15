# AMO Compliance Checklist

This checklist maps this project to Mozilla add-on policy FAQ expectations and the Extension Workshop publishing flow.

Reference:
- https://extensionworkshop.com/documentation/publish/add-on-policies-faq/

## Product scope and behavior

- Single purpose: annotate reading progress on web pages using check/attention markers.
- No hidden features, no deceptive behavior, no obfuscation.
- No remote code execution.

## Data and privacy

- Data is stored only in `browser.storage.local`.
- No external data transmission.
- No analytics, fingerprinting, ads, or tracking.
- Privacy policy included: `PRIVACY.md`.

## Permissions justification

- `storage`: required to persist markers across sessions.
- `menus`: required for context menu actions.
- `<all_urls>`: required because user can annotate any page and content script runs where user reads.

## Security and policy-sensitive items

- No `eval`, dynamic code loading, or remote script injection.
- No collection of credentials, financial, health, or sensitive user information.
- No cryptocurrency mining, botnet behavior, or background network tasks.
- No affiliate code injection or ad replacement.

## User controls and transparency

- Marker operations are user-initiated (hover controls, text-selection menu, context menu).
- Undo/redo and clear actions are provided.
- Functionality and permissions are documented in `README.md`.

## Manual pre-submit verification

- Load package in Firefox and test:
  - Paragraph and heading markers
  - List (`ul`/`ol`) markers as single blocks
  - Text-selection quick menu
  - Undo/redo and clear actions
- Confirm no console errors on common article pages.
