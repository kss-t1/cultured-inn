# Kulturalna Karczma — design handoff

Visual redesign of https://github.com/kss-t1/cultured-inn. Same product and features, new look.

## What to port

1. **`kk.css`** — the whole design system in one plain-CSS file: tokens (light + dark as CSS custom properties) and every component. Replace the app's current stylesheet with it.
   - Theme follows the system; `data-theme="light|dark"` on the root `.kk` element forces one.
   - Breakpoints are container queries on `.kk-app` (760 px, 1000 px). Swap them for `@media (min-width: …)` if preferred.
   - `.is-hover`, `.is-active` and `.is-focus` exist only to draw states in the mock-ups. Delete them.
2. **`logo.svg`** — the logo ("Drużyna": a meeple in a gold mask, with a sword and a d20 shield). It is drawn for the dark header, and the same paths are in the `i-logo` symbol in `Home.dc.html`.
3. **Icons** — the `<symbol id="i-…">` sprite at the top of `Home.dc.html`: 24 px grid, 1.75 stroke, `currentColor`. Turn each one into a small React component or keep the sprite.

## Reference screens (not production code)

The `*.dc.html` files are design-canvas mock-ups. Read their markup for structure and class names; the logic class at the bottom holds sample data only.

- `Home.dc.html` — home page (filters, list + map, calendar, empty and loading states). One responsive component, shown at 390 px and 1280 px by the wrapper files (`M-*.dc.html`, `Home-*.dc.html`, `D-*.dc.html`).
- `Event.dc.html` — event page with `status` = open | cancelled | past and `cover` = true | false.
- `System.dc.html` — every component with all its states, light and dark side by side.
- `Logo.dc.html`, `Main.dc.html` — the logo board and the first moodboard.

## Notes

- Fonts (Google Fonts, latin-ext): Fraunces (display) + Source Sans 3 (body). The `<link>` is in every `.dc.html` `<helmet>`.
- Map pins use fixed `--pin-*` colours because they sit on light OpenStreetMap tiles in both themes. Style only Leaflet's pins, popups and controls; the map in the mock-ups is a placeholder.
- Venue addresses are placeholders (`[ulica i numer]`).
