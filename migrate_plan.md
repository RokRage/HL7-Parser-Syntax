# SwiftUI Migration Plan

This plan is written for an AI implementer porting the current static HL7 Message Explorer web app into a native SwiftUI app.

## Goal

Build a native SwiftUI app that preserves the web app's core behavior:

- Parse, inspect, edit, and serialize HL7 v2.x messages locally.
- Display field names, descriptions, datatype/component labels, repeats, components, and subcomponents.
- Provide sample messages, search/path jump, copy helpers, HTTP POST sending, theming, and settings.
- Store user preferences and current message locally.

Use `functionality.md` as the behavioral source of truth.

## Source Files To Port

- `assets/js/app.js`: parsing, serialization, editing, search, copy snippets, settings behavior, HTTP sender behavior.
- `assets/js/samples.js`: bundled sample messages and sample titles.
- `assets/js/hl7-fields-2x.js`: HL7 field-name reference metadata for v2.3 and v2.4.
- `assets/js/hl7-datatypes-2x.js`: datatype and component-name metadata.
- `assets/js/hl7-field-desc-2x.js`: field description metadata.
- `assets/css/styles.css`: visual intent, colors, spacing, light/dark palette, responsive layout behavior.
- `assets/dude_sqizzle_shaded.svg`: app/logo asset.
- `functionality.md`: full feature inventory and acceptance reference.

## Recommended App Targets

- macOS first, because the existing app is a desktop-style split-pane editor.
- iPadOS second if desired, using the same SwiftUI layout with adaptive navigation.
- iOS can be supported with the existing mobile-pane tab concept.

Avoid embedding the existing web app in `WKWebView`; port the parser/model/UI natively.

## Proposed Swift Architecture

Use MVVM with a small pure-Swift HL7 core:

- `HL7Model`
  - `HL7Message`
  - `HL7Segment`
  - `HL7Field`
  - `HL7Repeat`
  - `HL7Component`
  - `HL7Delimiters`
- `HL7Parser`
  - `splitSegments(_:)`
  - `detectDelimiters(_:)`
  - `parse(_:)`
  - `parseField(_:index:delimiters:)`
- `HL7Serializer`
  - `serialize(_:)`
  - `fieldToRaw(_:)`
  - `escape(_:delimiters:)`
- `HL7ReferenceStore`
  - Field names by version.
  - Datatype by field.
  - Component names by datatype.
  - Field descriptions by segment.
- `AppSettings`
  - Theme.
  - Font size.
  - Stripe settings.
  - Page/sidebar gutter equivalent.
  - Hover detail mode.
  - Smooth scrolling preference if still relevant.
  - Last mobile/detail pane selection.
- `HL7ExplorerViewModel`
  - Current message text.
  - Current parsed model.
  - Selected HL7 version.
  - Selected sample.
  - Search query.
  - Filtered breakdown state.
  - Active/selected segment.
  - HTTP send state.

Keep the parser and serializer free of SwiftUI dependencies so they can be unit tested.

## Data Migration

Convert the JavaScript metadata files to Swift-friendly resources:

- Preferred: generate JSON files from the existing JS globals and load them from the app bundle.
- Alternative: convert to Swift dictionaries if the metadata size remains manageable.

Suggested bundled resources:

- `Samples.json`
- `HL7FieldNames.json`
- `HL7Datatypes.json`
- `HL7FieldDescriptions.json`

Preserve current keys and values exactly where possible:

- Sample keys: `a01_v24`, `oru_v24`, `orm_v24`, `a01_v23`.
- Version keys: `2.3`, `2.4`.
- Segment-field lookup behavior, including fallback to the other supported version.

## Persistence Mapping

Replace browser `localStorage` with `UserDefaults` or `@AppStorage`.

- `hl7_message` -> `lastMessage`.
- `hl7_mobile_view` -> `selectedCompactPane`.
- `hl7_font_size` -> `editorFontSize`.
- `hl7_settings` -> individual settings keys or one Codable settings blob.
- `hl7_http_send` -> Codable HTTP send settings.
- `hl7_theme` -> theme mode.

Use Codable structs for grouped settings:

- `EditorSettings`
- `LayoutSettings`
- `InteractionSettings`
- `HTTPSendSettings`

## SwiftUI UI Plan

### Root Layout

Use `NavigationSplitView` or an `HSplitView`-style layout on macOS:

- Left pane: HL7 input editor.
- Right pane: breakdown/search/details.
- Top toolbar: sample picker, wrap toggle, send button, theme toggle, version picker, settings button.

For compact width:

- Use a segmented control or tab switcher with `HL7 Input` and `Breakdown`, matching the web app behavior.
- Persist selected compact pane.

### Editor

Use a native text editor first:

- SwiftUI `TextEditor` for a simple port.
- AppKit `NSTextView` wrapper for macOS if syntax highlighting, hover hit-testing, line numbers, and precise selection mapping are required.

Required editor behavior:

- Debounced parse after edits.
- Manual parse command with Command-Return.
- Word wrap toggle.
- Font size controls from 9pt to 28pt.
- Persist current message.
- Select/cursor line should highlight the matching segment in the breakdown.

Syntax highlighting options:

- Phase 1: plain monospaced editor.
- Phase 2: `NSTextStorage`/`NSTextView` attributed highlighting for segment names, separators, timestamps, IDs, escapes, and active hover value.

### Breakdown

Represent each segment as a card/list section:

- Segment title.
- Repeat occurrence badge for repeated segments.
- Fields as rows on macOS/iPad.
- Fields as stacked cards on compact iPhone width.

Each field row must include:

- Field number.
- Field name.
- Field description/info button.
- Raw value editor.
- Field-level copy helper.
- Component/repeat/subcomponent breakdown editor.

### Repeats And Components

Port behavior exactly:

- Single repeat: inline repeat controls.
- Multiple repeats: repeat carousel/stepper with previous, next, counter, add, remove.
- Add repeat copies the first repeat's structure with blank values.
- Remove repeat deletes the selected repeat.
- Add/remove subcomponent mutates component structure and reserializes.

Use SwiftUI bindings back into the parsed model, then serialize back to message text after each edit.

### Search And Path Jump

Implement one search field:

- Normal text search filters segment, field number, field name, raw value, and breakdown text.
- Path parser supports:
  - `PID.5.1`
  - `PID:5`
  - `OBX.5.2`
  - `PID.13(2).1`
- Path hits should reveal and highlight matching fields/components.
- For multi-repeat fields, path search must switch to the matching repeat.

Use `ScrollViewReader` for jump/scroll behavior.

### Copy Helpers

Use `NSPasteboard` on macOS and `UIPasteboard` on iOS/iPadOS.

Generate the same snippets:

- `doc.GetValueAt("PID:5")`
- `doc.GetValueAt("PID:5.1")`
- `doc.GetValueAt("PID:13(2)")`

Show a native toast, transient overlay, or status message after copy.

### Field Info

Use a popover or sheet:

- Title: `SEG-index field name`.
- Body: metadata description or generated fallback description.
- Close on outside click/Escape where the platform supports it.

### HTTP Send

Use `URLSession` with timeout support.

UI settings:

- URL.
- Content-Type picker:
  - `text/plain`
  - `application/hl7-v2`
  - `application/x-hl7`
- Timeout: 1 to 120 seconds, default 15.

Validation:

- URL required.
- Scheme must be HTTP or HTTPS.
- Message body cannot be blank.

Response display:

- HTTP status.
- First 4000 characters of response text.
- Timeout and network errors.

Note: Native apps do not have browser CORS limitations, but network permissions and App Transport Security may apply.

### Settings

Create a settings sheet with:

- Alternating rows enabled.
- Light stripe color.
- Dark stripe color.
- Side gutter/page padding equivalent.
- Hover detail mode:
  - Floating tooltip/popover.
  - Header.
  - Footer.
- Smooth mouse scrolling if using custom scroll behavior.
- Reset defaults.

Defaults:

- `stripeOn = true`
- `stripeLight = #eef1f6`
- `stripeDark = #1b2433`
- `pageGutter = 8`
- `smoothScroll = true`
- `hintMode = float`
- `fontSize = 13`
- `timeoutSeconds = 15`

## Parser Acceptance Requirements

Match current JavaScript behavior:

- Blank input parses to an empty message.
- Segment splitting accepts `\r`, `\n`, and `\r\n`.
- Empty/whitespace-only segment lines are ignored.
- Delimiters are detected from the first `MSH` segment.
- Default delimiters are `|`, `^`, `~`, `\`, `&`.
- `MSH-1` and `MSH-2` use special logical field numbering.
- Repeats split by repeat delimiter.
- Components split by component delimiter.
- Subcomponents split by subcomponent delimiter.
- Serialization joins segments with `\r\n`.
- Field serialization escapes delimiter characters using HL7 escape sequences:
  - field -> `\F\`
  - component -> `\S\`
  - repeat -> `\R\`
  - escape -> `\E\`
  - subcomponent -> `\T\`

## Testing Plan

### Unit Tests

Create tests for:

- Delimiter detection.
- MSH parsing/serialization.
- Non-MSH segment parsing.
- Repeat/component/subcomponent parsing.
- Escape behavior.
- Round-trip parse and serialize for every bundled sample.
- Field-name fallback between v2.3 and v2.4.
- Path query parsing.
- Search matching logic.
- Copy snippet generation.

### UI Tests

Create tests for:

- Loading each sample.
- Changing HL7 version.
- Editing a raw field updates editor text.
- Editing a component updates raw field and editor text.
- Adding/removing repeats.
- Adding/removing subcomponents.
- Search filters rows and updates counts.
- Path jump reveals the target.
- Settings persist after relaunch.
- HTTP sender validation errors.

### Manual QA

Verify:

- Large messages remain responsive.
- Split/compact layouts work.
- Dark mode and stripe colors are legible.
- Editor and breakdown stay synchronized.
- No patient data leaves the device except via Send HTTP.

## Implementation Phases

### Phase 1 - Native Core

- Create Swift app project.
- Port HL7 model, parser, serializer.
- Convert metadata/sample JS into JSON bundle resources.
- Add unit tests for parser, serializer, metadata lookup, and samples.

### Phase 2 - Basic UI

- Build split layout.
- Add message editor.
- Add sample picker and version picker.
- Render segment/field breakdown.
- Add raw field editing and serialize-back behavior.

### Phase 3 - Full Editing

- Add component/subcomponent editing.
- Add repeat carousel behavior.
- Add add/remove repeat and add/remove subcomponent controls.
- Add field info popovers.

### Phase 4 - Productivity Features

- Add search and path jump.
- Add copy helpers and toast/status confirmation.
- Add cursor-to-segment synchronization.
- Add word wrap and font size controls.

### Phase 5 - Settings, Theme, Send

- Add settings sheet and persistence.
- Add light/dark theme support.
- Add HTTP sender with saved settings.
- Add compact pane tabs for iPhone/narrow windows.

### Phase 6 - Polish And Validation

- Add syntax highlighting if needed.
- Tune spacing/colors against the web app.
- Run full test suite.
- Compare every feature against `functionality.md`.

## Defer Or Reconsider

- CodeMirror-level editor behavior can be deferred until the native app's parsing/editing loop is stable.
- Smooth wheel scrolling may not be needed if native scrolling feels correct.
- Direct MLLP/TCP sending is outside current web-app parity and should not be included unless explicitly requested.
- Cloud sync should not be added without a privacy/security review.

## Completion Definition

The SwiftUI port is complete when:

- Every bundled sample parses and round-trips.
- Every ability in `functionality.md` is implemented or explicitly documented as intentionally deferred.
- Settings and message state persist across relaunch.
- Editing the breakdown and editor remain synchronized.
- Search/path jump/copy helpers match the web app's output.
- HTTP Send validates inputs, sends via POST, handles timeout, and displays status/response.
- Unit and UI tests cover the parser, editor synchronization, settings, and main workflows.
