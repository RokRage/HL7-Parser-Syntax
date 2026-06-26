# HL7 Message Explorer Functionality

This document inventories the current abilities, controls, and persisted settings of the web app.

## Core App

- Runs as a static browser app from `index.html`.
- Parses HL7 v2.x text directly in the browser; no backend is required for viewing, editing, or breakdown.
- Keeps patient/message data local unless the user explicitly sends it through the HTTP sender.
- Supports light and dark visual themes.
- Uses a local vendored CodeMirror bundle for syntax highlighting, with an offline-safe textarea fallback if the bundle cannot load.

## HL7 Input

- Paste, type, or load an HL7 message into the input editor.
- Parses automatically after edits with a short debounce.
- Supports manual parse with `Ctrl+Enter` or `Cmd+Enter`.
- Normalizes segment line endings internally and serializes edited messages with HL7 carriage-return segment separators.
- Detects HL7 delimiters from `MSH`, including field, component, repeat, escape, and subcomponent separators.
- Handles standard `MSH` field numbering where `MSH-1` is the field separator and `MSH-2` is encoding characters.
- Persists the current message in `localStorage` under `hl7_message`.
- Restores the saved message on reload unless a recognized URL hash sample is present.

## Editor Display

- Shows HL7 syntax coloring in CodeMirror:
  - Segment names.
  - Field separators.
  - Component separators.
  - Repeat separators.
  - Subcomponent separators.
  - Escape characters.
  - Date/time-like values.
  - Identifier/code-like values.
- Shows alternating segment row backgrounds when enabled.
- Highlights the currently hovered HL7 value chunk in the editor.
- Tracks editor cursor location and highlights the matching segment card in the breakdown pane.
- Supports word wrap toggle from the toolbar.
- Supports editor font size controls:
  - Decrease font size.
  - Increase font size.
  - Current font size label.
  - Range is 9px to 28px.
  - Saved in `localStorage` under `hl7_font_size`.

## Hover Details

- Shows field details while hovering over values in the editor.
- Hover detail text includes the segment-field identifier, field name, repeat/component/subcomponent path when applicable, and component name when known.
- Hover details can appear as:
  - Floating tooltip.
  - Input pane header hint.
  - Input pane footer hint.
- Hover details are hidden on mouse leave, mouse down, or invalid/non-HL7 locations.

## Sample Messages

- Provides a Sample dropdown populated from bundled examples.
- Bundled samples:
  - `ADT^A01 (v2.4)`.
  - `ORU^R01 (v2.4, lab result)`.
  - `ORM^O01 (v2.4, lab order)`.
  - `ADT^A01 (v2.3)`.
- Loading a sample replaces the editor message and reparses immediately.
- Sample selection also updates the HL7 Version dropdown when the sample key indicates v2.3 or v2.4.
- Supports opening a specific bundled sample by URL hash when the hash matches a sample key.

## HL7 Version Reference

- Supports reference metadata for HL7 versions:
  - 2.3.
  - 2.4.
- The selected version controls field names and datatype/component-name lookups in the breakdown.
- If a field name is missing for the selected version, the app falls back to the other supported version when possible.
- Changing the version reparses/rerenders the current message.

## Breakdown Pane

- Displays parsed messages as segment cards.
- Shows segment count and field count badges.
- Shows repeated segment occurrence badges when the same segment appears more than once.
- For each field, displays:
  - Field number.
  - HL7 field name.
  - Field information button when a description is available.
  - Raw field value editor.
  - Copyable field access snippet.
  - Repeat/component/subcomponent breakdown.
- Empty input shows an empty-state message.
- Parse failures show a parse error message in the breakdown pane.

## Field Descriptions

- Field info buttons open a popover with:
  - Segment-field title.
  - Description from bundled metadata when available.
  - Generated fallback description for known field names without a bundled description.
- Info popovers close on outside click, Escape, scroll, or window resize.

## Editing

- Raw field values are editable directly in the breakdown.
- Component and subcomponent values are editable directly in the breakdown.
- Editing the breakdown updates the internal model and writes the serialized HL7 message back into the editor.
- Editing `MSH-1` or `MSH-2` triggers a full serialize-and-refresh because delimiter definitions affect the whole message.
- Component edits escape HL7 delimiter characters during serialization.

## Repeats, Components, And Subcomponents

- Fields are split into repeats, components, and subcomponents using the detected delimiters.
- Single-repeat fields show repeat controls inline.
- Multi-repeat fields use a repeat carousel with:
  - Previous repeat.
  - Next repeat.
  - Repeat counter.
  - Add repeat.
  - Remove current repeat.
- Add repeat duplicates the component/subcomponent structure of the first repeat with blank values.
- Remove repeat deletes the selected repeat and refreshes the serialized message.
- Components include add/remove subcomponent controls.
- Multi-subcomponent values are shown as labeled subcomponent chips.

## Search And Path Jump

- Search filters visible breakdown rows by:
  - Segment name.
  - Field number.
  - Field name.
  - Raw value.
  - Breakdown text/component values.
- Segment and field count badges update to match filtered results.
- Supports path-like queries to jump to a field or component:
  - `PID.5.1`.
  - `PID:5`.
  - `OBX.5.2`.
  - Repeat-aware paths such as `PID.13(2).1`.
- Path hits are visually highlighted.
- Path jumps scroll the matching row or component into view.
- For multi-repeat fields, path jumps reveal the matching repeat in the carousel when possible.

## Copy Helpers

- Field-level copy buttons copy InterSystems-style snippets such as `doc.GetValueAt("PID:5")`.
- Component-level copy buttons copy snippets such as `doc.GetValueAt("PID:5.1")`.
- Repeating fields include the repeat index in copied snippets when needed, such as `doc.GetValueAt("PID:13(2)")`.
- Copying uses the Clipboard API when available and falls back to a temporary textarea copy method.
- A short toast confirms successful copy.

## HTTP Send

- Send HTTP opens a modal for posting the current HL7 message to an HTTP endpoint, such as a Mirth Connect HTTP Listener.
- Sends the current editor text with browser `fetch` using HTTP `POST`.
- Requires a URL beginning with `http://` or `https://`.
- Refuses to send when the URL is empty, invalid, or the message is blank.
- Configurable Content-Type options:
  - `text/plain`.
  - `application/hl7-v2`.
  - `application/x-hl7`.
- Configurable timeout from 1 to 120 seconds, default 15 seconds.
- Aborts timed-out requests and reports timeout status.
- Displays HTTP status and up to the first 4000 characters of the response body.
- Shows errors for failed sends, including CORS/listener/connectivity failures.
- Saves send settings in `localStorage` under `hl7_http_send`:
  - URL.
  - Content-Type.
  - Timeout seconds.

## Layout

- Desktop uses a split-pane layout with HL7 input on the left and breakdown on the right.
- The vertical gutter can be dragged with mouse or touch to resize panes.
- Pane resize clamps each pane to a minimum width and limits the split ratio.
- Double-clicking the gutter resets the split to the default ratio.
- At narrower widths, the app switches to mobile pane tabs:
  - HL7 Input.
  - Breakdown.
- Mobile tab selection is persisted in `localStorage` under `hl7_mobile_view`.
- Mobile breakdown rows become stacked field cards for readability.

## Theme

- Toolbar theme button toggles light and dark mode.
- The theme button icon and labels update to the opposite available mode.
- Selected theme is saved in `localStorage` under `hl7_theme`.
- Theme changes also reapply the active alternating-row stripe color.

## Settings Modal

The Settings modal is opened from the gear button and can be closed with Done, the close button, Escape, or clicking the overlay.

### Editor - Alternating Segment Rows

- Enable alternating rows:
  - Default: enabled.
  - Stored as `stripeOn`.
- Row colour - Light mode:
  - Default: `#eef1f6`.
  - Stored as `stripeLight`.
- Row colour - Dark mode:
  - Default: `#1b2433`.
  - Stored as `stripeDark`.

### Appearance

- UI style:
  - `Default`.
  - `Clinical`: cleaner clinical chart styling with stronger accent panels, left-accent segment cards, and more structured inputs.
  - `Clinical Blue`: same structure as Clinical with a blue accent palette.
  - `Paper`: light-mode-first document style with warm paper colors, serif headings, and flatter card blocks.
  - `Lab Light`: light-mode-first laboratory style with cyan accents, rounded controls, and left-accent result cards.
  - `Console`: terminal-like dense visual styling with square corners, monospace labels, stronger borders, and flatter controls.
  - Default: `Default`.
  - Stored as `uiStyle`.

### Layout

- Spacing:
  - `Default`.
  - `Compact`.
  - `Spacious`.
  - Default: `Default`.
  - Stored as `uiDensity`.
- Side gutter:
  - Controls the app edge gutter/page padding.
  - Range: 0px to 48px.
  - Default: 8px.
  - Stored as `pageGutter`.

### Interactivity

- Show hover details:
  - `Floating tooltip`.
  - `In header`.
  - `In footer`.
  - Default: floating tooltip.
  - Stored as `hintMode`.
- Smooth mouse scrolling:
  - Default: enabled.
  - Stored as `smoothScroll`.
  - Applies custom eased scrolling to the breakdown pane for mouse wheels.
  - Ignores horizontal scroll and small trackpad deltas.

### Reset Defaults

- Reset defaults restores all app settings to:
  - Alternating rows enabled.
  - Light stripe `#eef1f6`.
  - Dark stripe `#1b2433`.
  - UI style `Default`.
  - Spacing `Default`.
  - Page gutter `8`.
  - Smooth scrolling enabled.
  - Floating hover tooltip mode.

Settings are saved in `localStorage` under `hl7_settings`.

## Persistence Summary

- `hl7_message`: current HL7 editor text.
- `hl7_mobile_view`: selected mobile pane.
- `hl7_font_size`: editor font size.
- `hl7_settings`: settings modal preferences.
- `hl7_http_send`: HTTP sender URL, content type, and timeout.
- `hl7_theme`: light or dark theme.

## Known Boundaries

- Direct HL7 MLLP/TCP sending is not supported because browsers cannot open raw TCP sockets.
- HTTP sending depends on the target listener and browser CORS rules.
- CodeMirror syntax highlighting is bundled locally; the app remains usable through the textarea fallback if the local bundle fails to load.
