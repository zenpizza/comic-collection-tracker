# UI Style Spec Sheet: Comic Collection Tracker

This document translates the design plan into implementation-ready UI specs.

## 1) Global Design Tokens (Exact CSS Block)
Add this near the top of `/Users/daviddana/Developer/comic-collection-tracker/src/App.css`.

```css
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Manrope:wght@400;500;600;700&display=swap');

:root {
  /* Color */
  --bg-page: #f3f0e8;
  --bg-surface: #fffdf8;
  --bg-elevated: #ffffff;
  --ink-primary: #1f2520;
  --ink-secondary: #5b635d;
  --ink-muted: #7b847d;

  --accent-primary: #1f7a5a;
  --accent-primary-strong: #176146;
  --accent-secondary: #d95f43;
  --accent-secondary-strong: #b9482f;
  --accent-highlight: #e0a100;
  --accent-info: #0a7ea4;

  --status-success-bg: #e7f6ef;
  --status-success-ink: #155a3f;
  --status-warning-bg: #fff4d6;
  --status-warning-ink: #7b5b07;
  --status-error-bg: #fde8e4;
  --status-error-ink: #7c2516;

  --border-soft: #d9d3c7;
  --border-strong: #bfb6a7;
  --focus: #0a7ea4;

  /* Typography */
  --font-display: 'Bricolage Grotesque', 'Avenir Next', 'Segoe UI', sans-serif;
  --font-ui: 'Manrope', 'Inter', 'Segoe UI', sans-serif;
  --font-mono: 'IBM Plex Mono', 'SFMono-Regular', 'Consolas', monospace;

  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-md: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.375rem;
  --text-2xl: 1.75rem;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;

  /* Radius */
  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --radius-pill: 999px;

  /* Elevation */
  --shadow-1: 0 2px 10px rgba(20, 28, 22, 0.08);
  --shadow-2: 0 8px 28px rgba(20, 28, 22, 0.14);

  /* Motion */
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --dur-fast: 140ms;
  --dur-med: 220ms;

  /* Layout */
  --container-max: 1200px;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  min-height: 100%;
}

body {
  margin: 0;
  font-family: var(--font-ui);
  color: var(--ink-primary);
  background:
    radial-gradient(circle at 10% 10%, rgba(255, 255, 255, 0.5) 0, transparent 45%),
    radial-gradient(circle at 90% 0%, rgba(224, 161, 0, 0.06) 0, transparent 38%),
    var(--bg-page);
}

:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}
```

## 2) Component Class Contract
Use these classes as the shared baseline across tabs. Keep view-specific classes for layout only.

### 2.1 App Shell
- `.app-shell`: page container, responsive max width, vertical spacing
- `.app-topbar`: sticky top header bar
- `.app-title`: display font, large heading
- `.save-chip`: save state badge container
- `.save-chip--loading | --saving | --saved | --error`: state variants
- `.segmented-tabs`: tab container
- `.segmented-tabs__button`: tab button base
- `.segmented-tabs__button.is-active`: active tab style
- `.view-panel`: shared panel wrapper for each tab content

### 2.2 Surface/Card
- `.ui-card`: base surface
- `.ui-card--elevated`: stronger shadow
- `.ui-card--warning`: warning border/background
- `.ui-card--danger`: danger border/background
- `.ui-card__header`: heading row with actions slot
- `.ui-card__body`: content container

### 2.3 Buttons
- `.btn`: base button
- `.btn--primary`: primary call-to-action
- `.btn--secondary`: secondary action
- `.btn--ghost`: low-emphasis action
- `.btn--danger`: destructive action
- `.btn--icon`: square icon button (min 40x40)
- `.btn:disabled`: reduced opacity, no hover transform

Behavior contract:
- Hover: background or border shift only; no dramatic movement
- Active: slight press (`translateY(1px)` max)
- Focus: `:focus-visible` ring from token

### 2.4 Inputs/Fields
- `.field`: wrapper for label + control + message
- `.field__label`: label text
- `.input`: text/select/textarea base
- `.input--error`: error border + soft background tint
- `.input--success`: success border + soft background tint
- `.field__hint`: helper text
- `.field__error`: error message

### 2.5 Badges/Status
- `.badge`: base badge
- `.badge--status`: neutral status badge
- `.badge--success | --warning | --error | --info`
- `.badge--milestone`: highlighted issue marker
- `.badge--count`: numeric count badge

### 2.6 Lists and Toolbars
- `.toolbar`: row for search/sort/filter/actions
- `.toolbar__group`: cluster of related controls
- `.list-row`: dense list row (preview/import/data lists)
- `.list-row__meta`: muted metadata cluster

### 2.7 Comics-Specific Contracts
- `.series-card`: container for grouped issues
- `.series-card__header`: series title + count + actions
- `.comic-item`: single comic row/card
- `.comic-item__cover`: fixed cover thumb area
- `.comic-item__content`: title + metadata
- `.comic-item__actions`: edit/delete controls
- `.issue-tile`: missing/owned issue tile
- `.issue-tile--owned | --missing | --milestone | --annual`: state modifiers

## 3) Baseline Interaction + Layout Rules
- Tap targets: minimum `40x40px`.
- Form control heights:
  - Desktop: `44px`
  - Mobile: `48px`
- Panel padding:
  - Desktop: `24px`
  - Mobile: `16px`
- Grid behavior:
  - `>=1280px`: 3-column comic card grid where possible
  - `768px-1279px`: 2-column
  - `<=767px`: single-column stack

## 4) Screen-by-Screen Mapping

### Collection (`/Users/daviddana/Developer/comic-collection-tracker/src/components/CollectionView.css`)
- Wrap each series in `.series-card`.
- Convert existing `.comic-card` to `.comic-item` styling.
- Move filter controls into `.toolbar` contract.

### Add Comic (`/Users/daviddana/Developer/comic-collection-tracker/src/components/ComicForm.css`)
- Replace ad hoc form styles with `.field`, `.input`, `.btn`.
- Section wrappers use `.ui-card` for grouped blocks.

### Missing Issues (`/Users/daviddana/Developer/comic-collection-tracker/src/components/MissingIssues.css`)
- Use `.badge` contracts for legend.
- Convert issue cards to `.issue-tile` modifiers.

### Bulk Import (`/Users/daviddana/Developer/comic-collection-tracker/src/components/BulkImport.css`)
- Method tabs use `.segmented-tabs` pattern.
- Preview items use `.list-row` contract.

### Data Manager (`/Users/daviddana/Developer/comic-collection-tracker/src/components/DataManager.css`)
- Stats and actions grouped as `.ui-card` sections.
- Danger zone uses `.ui-card--danger` + `.btn--danger`.

## 5) Before/After Screenshot Checklist
Capture on same data set and viewport sizes: `375x812`, `768x1024`, `1280x800`.

### App Shell
- [ ] Before: top-level app view on Collection tab.
- [ ] After: top-level app view on Collection tab.
- [ ] Verify: title hierarchy, save chip visibility, segmented tab clarity.

### Collection View
- [ ] Before/After: full collection with at least 2 series groups.
- [ ] Before/After: hover/focus state on comic actions.
- [ ] Verify: toolbar wrapping, cover readability, metadata hierarchy.

### Add Comic
- [ ] Before/After: blank form.
- [ ] Before/After: validation error state.
- [ ] Verify: field spacing, section clarity, CTA prominence.

### Missing Issues
- [ ] Before/After: populated issue grid including owned/missing/milestone.
- [ ] Verify: state distinction remains obvious in grayscale-resistant contexts.

### Bulk Import
- [ ] Before/After: text import input with parsed preview list.
- [ ] Verify: preview scanability and duplicate visibility.

### Data Manager
- [ ] Before/After: stats + action sections.
- [ ] Before/After: danger zone.
- [ ] Verify: destructive actions visually isolated and unmistakable.

### Accessibility Snapshots
- [ ] Focus ring visible on: tab button, input, primary button, icon button.
- [ ] Reduced motion check (system setting enabled).
- [ ] Contrast spot-check for status badges and muted text.

## 6) Acceptance Criteria for Implementation
- Shared class contracts are applied across all five main views.
- Legacy one-off color values are replaced by tokens.
- Button/input/status styles are visually consistent and state-complete.
- Mobile layout is intentional and readable on 375px width.
- Screenshot checklist is complete with no critical regressions.
