# Design Update Plan: Comic Collection Tracker

## Status
Completed and shipped to production (Phase 1 redesign + Phase 2 accessibility + Phase 3 interaction polish).

### Delivered
- Modern app shell with tokenized design system.
- Full visual refresh across Collection, Add Comic, Missing Issues, Bulk Import, Data Manager.
- Updated Cover Gallery and View Mode Toggle styling.
- Accessibility hardening:
  - Keyboard-accessible tablist behavior (`ArrowLeft`, `ArrowRight`, `Home`, `End`)
  - ARIA tab/tabpanel semantics
  - Live regions for save/toast status
  - Accessible labels for icon-only action buttons
  - Keyboard-accessible cover click targets
- Interaction polish:
  - Async action states for import/export/refresh/submit
  - Inline status feedback in Bulk Import and Data Manager
  - Disabled-state protection for long-running actions

### Notes
- The original plan was implementation-focused. Production implementation uses namespaced shared utility classes (`ui-*`) to avoid global CSS collisions.

## Objective
Modernize the UI from a dated Web 2.0 look to a contemporary, premium collector dashboard while preserving all current functionality.

## Product Vision
Create an interface that feels like a high-end comic archive: editorial, tactile, and efficient.

- Personality: bold, intentional, content-first
- Tone: premium but practical
- Behavior: calm default state, clear emphasis for active/critical states

## Design Principles
- Prioritize comic content over decorative chrome.
- Use typography and spacing for hierarchy before adding borders/background noise.
- Keep one clear primary action per surface.
- Encode meaning with icon + text + color (not color alone).
- Ensure dense data can be scanned quickly.

## Visual Direction

### Typography
- Display/headings: `Bricolage Grotesque`
- Body/UI: `Manrope`
- Mono/support text: `IBM Plex Mono`

### Color Tokens
- `--bg-page: #f3f0e8`
- `--bg-surface: #fffdf8`
- `--bg-elevated: #ffffff`
- `--ink-primary: #1f2520`
- `--ink-secondary: #5b635d`
- `--accent-primary: #1f7a5a`
- `--accent-secondary: #d95f43`
- `--accent-highlight: #e0a100`
- `--border-soft: #d9d3c7`
- `--focus: #0a7ea4`

### Radius, Shadow, Motion
- Radius: `8px / 14px / 20px`
- Shadow: light depth for cards and stronger depth for overlays
- Motion: subtle transitions only (`140ms` hover/focus, `220ms` panel changes)

### Spacing Scale
- `4, 8, 12, 16, 24, 32, 48`

## App Shell Redesign
- Replace narrow centered column with responsive multi-column layout.
- Add persistent top bar containing title, save state, and quick utility area.
- Convert tab row to segmented-control style navigation with active pill state.
- Introduce layered neutral background with subtle texture/pattern.

## Screen-by-Screen Plan

### 1) Collection View
- Convert series sections into accordion-like cards with stronger headings.
- Improve comic cards: larger cover thumbnail, clearer metadata hierarchy.
- Consolidate search/sort/filter into a single responsive toolbar.

### 2) Add Comic
- Use grouped field sections: Issue Info, Publishing, Cover.
- Two-column desktop layout; one-column mobile.
- Standardize validation and helper feedback styles.

### 3) Missing Issues
- Present key stats in compact metric tiles.
- Refine issue grid states (owned/missing/milestone/annual) with improved contrast and less harsh grayscale.
- Keep legend visible and easy to parse.

### 4) Bulk Import
- Use split layout: input pane + live preview pane.
- Increase preview density and surface duplicate warnings inline.
- Clarify method switching with segmented method tabs.

### 5) Data Manager
- Reframe as operations console with clearer section hierarchy.
- Separate normal actions from destructive actions.
- Use an isolated danger zone with strong warning styling.

## Shared Component System
Define and apply shared style contracts before view-specific styling:

- `Button`: primary, secondary, ghost, danger
- `Input`: default, focus, error, success
- `Badge`: status, count, warning, milestone
- `Card`: surface, elevated, warning, danger
- `Tabs/SegmentedControl`
- `Toast`: consistent icon + action layout

## Accessibility Requirements
- WCAG AA color contrast minimum.
- Highly visible keyboard focus states.
- Minimum `40x40` target size for touch interactions.
- Respect `prefers-reduced-motion`.
- Save state and system statuses include textual labels.

## Implementation Plan (Engineer Handoff)
1. Add global design tokens and typography imports in `/Users/daviddana/Developer/comic-collection-tracker/src/App.css`.
2. Refactor app shell and top-level nav styles first (no functional changes).
3. Create shared utility classes/tokens for buttons, inputs, badges, cards.
4. Migrate view styles incrementally:
   - `/Users/daviddana/Developer/comic-collection-tracker/src/components/CollectionView.css`
   - `/Users/daviddana/Developer/comic-collection-tracker/src/components/ComicForm.css`
   - `/Users/daviddana/Developer/comic-collection-tracker/src/components/MissingIssues.css`
   - `/Users/daviddana/Developer/comic-collection-tracker/src/components/BulkImport.css`
   - `/Users/daviddana/Developer/comic-collection-tracker/src/components/DataManager.css`
5. Perform responsive tuning for mobile/tablet/desktop breakpoints.
6. Run accessibility and visual regression pass.

## Definition of Done
- A cohesive, modern visual language across all tabs.
- No regression in app behavior.
- Shared design system applied consistently.
- Intentional mobile layout, not just compressed desktop layout.
- Accessibility checks pass for contrast, focus, and keyboard flow.

## QA Checklist
- [x] Validate at 375px, 768px, and 1280px widths.
- [x] Verify all interactive states: default, hover, focus, active, disabled.
- [x] Verify save status visibility in all tabs.
- [x] Validate legibility of metadata and badges in dense views.
- [x] Confirm danger actions are visually and behaviorally distinct.
