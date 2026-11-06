// Inline SVG icon sprite (stroke icons on a 24×24 grid).
const paths = {
  wrench:
    '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-2 2-1.3-1.3a4 4 0 0 1-5-5L6 15.4V18H3.5v-2.6L10 9a4 4 0 0 1 4.7-2.7z"/><path d="M14.5 3.5 17 6l-2.5 2.5"/>',
  engine:
    '<path d="M4 9h3l2-2h5l2 2h2v3h2V9h1v8h-1v-3h-2v3h-2l-2 2H9l-2-2H4z"/><path d="M9 4h5M11.5 4v3"/><path d="M2 11v4"/>',
  oil: '<path d="M3 9h7l2-2h3l6 2-6 3H12l-1 6H5l-2-6z"/><path d="M19 14s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z"/>',
  brake:
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M5.5 7.5A8 8 0 0 1 9 4.6M18.5 7.5A8 8 0 0 0 15 4.6"/><path d="M15 3.5 18 6l-2 2"/>',
  tire: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/>',
  battery:
    '<rect x="3" y="7" width="18" height="12" rx="1.5"/><path d="M7 7V5h3v2M14 7V5h3v2"/><path d="M7 13h3M15.5 11.5v3M14 13h3"/>',
  suspension:
    '<path d="M12 2v4M12 18v4"/><path d="M8 6h8M8 18h8"/><path d="M9 8l6 2-6 2 6 2-6 2"/>',
  ac: '<path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11"/><path d="M9.5 3.5 12 6l2.5-2.5M9.5 20.5 12 18l2.5 2.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/><circle cx="12" cy="12" r="6.5"/>',
  clipboard:
    '<rect x="5" y="4" width="14" height="18" rx="1.5"/><path d="M9 4V2.5h6V4"/><path d="m8.5 12 2 2 4-4M8.5 18h7"/>',
  check: '<path d="m4 12.5 5 5L20 6.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  phone:
    '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="m3.5 6 8.5 7 8.5-7"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="1.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  car: '<path d="M3 16v-3l2-5a2 2 0 0 1 2-1.5h10A2 2 0 0 1 19 8l2 5v3"/><path d="M3 13h18M3 16h18v2H3z"/><circle cx="7" cy="16.5" r="1.5"/><circle cx="17" cy="16.5" r="1.5"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  receipt: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  parts: '<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  quote: '<path d="M4 17V11a5 5 0 0 1 5-5M13 17v-6a5 5 0 0 1 5-5"/><path d="M4 11h5v6H4zM13 11h5v6h-5z"/>',
  menu: '<path d="M3 7h18M3 12h18M3 17h18"/>',
  close: '<path d="M5 5l14 14M19 5 5 19"/>',
  facebook: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  google: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M12 12h8"/>',
  youtube: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3z"/>',
  tiktok: '<path d="M14 3v11a4 4 0 1 1-4-4"/><path d="M14 3a5 5 0 0 0 5 5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  directions: '<path d="M12 2 22 12 12 22 2 12z"/><path d="M9 13v-2h5V9l3 3-3 3v-2z"/>',
  camera: '<path d="M4 7h3l2-2.5h6L17 7h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  gauge: '<path d="M3.5 17a9 9 0 1 1 17 0"/><path d="m12 13 4.5-4.5"/><circle cx="12" cy="13" r="1.3"/><path d="M6 13h1.5M16.5 13H18M12 6.5V8"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
};

function sprite() {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" class="sprite" aria-hidden="true">' +
    Object.entries(paths)
      .map(
        ([id, d]) =>
          `<symbol id="i-${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</symbol>`
      )
      .join('') +
    '</svg>'
  );
}

function icon(name, cls = 'icon') {
  return `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
}

module.exports = { sprite, icon, names: Object.keys(paths) };
