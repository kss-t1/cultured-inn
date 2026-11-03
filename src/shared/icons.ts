// SVG icons from the design (design/kulturalna-karczma-design): 24 px grid, stroked with
// currentColor by the .ico class. Strings, so the same markup works in React, SSR and Leaflet HTML.
export const ICONS = {
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  boardgames: '<path d="M12 3a2.6 2.6 0 0 1 2.6 2.6c0 .9-.4 1.6-1 2.1l4.9 2.1c.9.4 1.3 1.3 1 2.2-.3.8-1.2 1.2-2 1l-2.1-.6 2.6 6.4c.3.8-.3 1.7-1.2 1.7h-2.4L12 16.5l-2.4 4H7.2c-.9 0-1.5-.9-1.2-1.7l2.6-6.4-2.1.6c-.8.2-1.7-.2-2-1-.3-.9.1-1.8 1-2.2l4.9-2.1c-.6-.5-1-1.2-1-2.1A2.6 2.6 0 0 1 12 3z"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  calplus: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M12 12.5v5.5M9.25 15.25h5.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  chevl: '<path d="M15 6l-6 6 6 6"/>',
  chevr: '<path d="M9 6l6 6-6 6"/>',
  chat: '<path d="M4.5 19.5l1.2-3.6A8 8 0 1 1 8.4 18.6z"/><path d="M9 11h.01M12 11h.01M15 11h.01"/>',
  code: '<path d="M8.5 8l-4 4 4 4M15.5 8l4 4-4 4M13.5 5.5l-3 13"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.6 9.3c-.5-.8-1.4-1.3-2.6-1.3-1.5 0-2.5.8-2.5 1.9 0 2.6 5 1.4 5 4.2 0 1.1-1 1.9-2.5 1.9-1.2 0-2.1-.5-2.6-1.3M12 6.5V8M12 16v1.5"/>',
  ext: '<path d="M14 4.5h5.5V10M19.5 4.5L11 13M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>',
  impro: '<path d="M4 4.5c2.6 1 5.4 1.5 8 1.5s5.4-.5 8-1.5v7a8 8 0 0 1-16 0z"/><path d="M7.8 10.6c.7-.7 1.8-.7 2.4 0M13.8 10.6c.7-.7 1.8-.7 2.4 0M8.5 14.5c1.9 2 5.1 2 7 0"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  larp: '<path d="M4 4l11 11M13 17l4-4M15 15l4 4M20 4L9 15M11 17l-4-4M9 15l-4 4"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  locate: '<circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M4.5 7.5l7.5 5.5 7.5-5.5"/>',
  map: '<path d="M3.5 6.5L9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  minus: '<path d="M5 12h14"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  pinq: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><path d="M10.2 8.6a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4M12 13.9v.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  repeat: '<path d="M17 3.5l3 3-3 3M4 11.5v-1a4 4 0 0 1 4-4h12M7 20.5l-3-3 3-3M20 12.5v1a4 4 0 0 1-4 4H4"/>',
  rpg: '<path d="M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5z"/><path d="M12 7.5l4.5 7.5h-9zM12 2.5v5M7.5 15l-4 1.75M16.5 15l4 1.75"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="17.5" cy="6" r="2.5"/><circle cx="17.5" cy="18" r="2.5"/><path d="M8.2 10.8l7-3.6M8.2 13.2l7 3.6"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  sprout: '<path d="M12 20v-8M12 12c0-3.5-2.5-6-6.5-6 0 3.8 2.6 6 6.5 6zM12 13.5c0-3 2.2-5.5 6.5-5.5 0 3.5-2.6 5.5-6.5 5.5z"/>',
  ticket: '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z"/><path d="M14.5 7v1.5M14.5 11.25v1.5M14.5 15.5V17"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.5 3.5-5.5 7-5.5s6.2 2 7 5.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
} as const;
export type IconName = keyof typeof ICONS;

export const iconSvg = (name: IconName) =>
  `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

/** The logo ("Drużyna"), 48×48. Drawn for the dark header: currentColor strokes, --sign-* fills. */
export const LOGO_PATHS = '<path d="M38.6 25L45.4 4" style="fill: none; stroke: currentColor; stroke-width: 4.8; stroke-linecap: round"/><path d="M38.6 25L45.4 4" style="fill: none; stroke: var(--sign-gold, #f2b84f); stroke-width: 2.8; stroke-linecap: round"/><path d="M18 23l-6.5 2.2c-1.8.6-2.6 2.4-1.9 4 .6 1.4 2.2 2.1 3.7 1.6l3.7-1.2-3.8 11c-.5 1.5.6 3 2.2 3h4.4L24 37l4.2 6.6h4.4c1.6 0 2.7-1.5 2.2-3L31 29.6l3.7 1.2c1.5.5 3.1-.2 3.7-1.6.7-1.6-.1-3.4-1.9-4L30 23z" style="fill: var(--sign-ink, #f6e9cf); stroke: currentColor; stroke-width: 1.4; stroke-linejoin: round"/><circle cx="24" cy="15.2" r="6.6" style="fill: var(--sign-ink, #f6e9cf); stroke: currentColor; stroke-width: 1.4"/><path d="M17.6 13.4c2-.9 4.4-1 6.4.2 2-1.2 4.4-1.1 6.4-.2l-.6 3.6c-1.8 1.4-4.2 1.3-5.8-.4-1.6 1.7-4 1.8-5.8.4z" style="fill: var(--sign-gold, #f2b84f); stroke: none"/><ellipse cx="21" cy="15" rx="1.35" ry=".9" style="fill: var(--sign-bg, #2a1c10)"/><ellipse cx="27" cy="15" rx="1.35" ry=".9" style="fill: var(--sign-bg, #2a1c10)"/><path d="M34.6 24.6l7.6 2.5" style="fill: none; stroke: currentColor; stroke-width: 4.4; stroke-linecap: round"/><path d="M34.6 24.6l7.6 2.5" style="fill: none; stroke: var(--sign-gold, #f2b84f); stroke-width: 2.4; stroke-linecap: round"/><path d="M38.4 25.8l-1.2 3.6" style="fill: none; stroke: currentColor; stroke-width: 2.6; stroke-linecap: round"/><path d="M12 22.5l7.4 4.25v8.5L12 39.5l-7.4-4.25v-8.5z" style="fill: var(--sign-bg, #2a1c10); stroke: var(--sign-gold, #f2b84f); stroke-width: 2; stroke-linejoin: round"/><path d="M12 26l4.5 7.8h-9z" style="fill: none; stroke: var(--sign-gold, #f2b84f); stroke-width: 1.4; stroke-linejoin: round; stroke-linecap: round"/>';
