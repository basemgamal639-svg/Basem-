/**
 * STOCK PHOTOGRAPHY — a starting set so the site looks finished before your own photos exist.
 *
 * All images are from Unsplash (https://unsplash.com/license): free for commercial use, no
 * attribution required. Sources are listed in public/images/photos/CREDITS.md.
 *
 * They are marked `stock: true`, and the admin dashboard's Setup list reminds you to replace them.
 * Photos of YOUR workshop, team and real jobs will always convert better than stock, and the
 * gallery in particular should show your own work. To replace one, put your file in
 * public/images/photos/ and use your own entry in config/business.js or config/services.js, e.g.
 *   { src: '/images/photos/my-workshop.jpg', alt: 'Our two-bay workshop', width: 1600, height: 1000 }
 */
const DIR = '/images/photos';

// Build a responsive image entry from files named `<name>-<width>.webp`.
function stock(name, alt, widths, ratio) {
  const largest = widths[widths.length - 1];
  return {
    src: `${DIR}/${name}-${largest}.webp`,
    srcset: widths.map((w) => `${DIR}/${name}-${w}.webp ${w}w`).join(', '),
    width: largest,
    height: Math.round(largest / ratio),
    alt,
    stock: true,
  };
}

const svc = (name, alt) => stock(`svc-${name}`, alt, [640, 1000], 0.8);

module.exports = {
  hero: stock('hero', 'Classic car with its tail-lights glowing inside a dimly lit workshop', [1280, 2400], 2400 / 1398),
  about: stock('about', 'Technician working in the engine bay of a car', [720, 1200], 0.8),
  aboutDetail: stock('detail', 'Illuminated rev counter on a car dashboard', [640], 1),

  services: {
    'engine-diagnostics': svc('diagnostics', 'Open engine bay of a modern car'),
    'brake-repair': svc('brakes', 'Technician removing a wheel with an impact wrench'),
    'oil-change-maintenance': svc('oil', 'Fresh engine oil being poured into an engine'),
    'transmission-services': svc('transmission', 'Mechanic’s hand working a spanner deep in an engine bay'),
    'tires-wheel-alignment': svc('tires', 'Stacks of tires in a tire bay'),
    'suspension-steering': svc('suspension', 'Car with its bonnet open on a workshop lift'),
    'battery-electrical': svc('electrical', 'Fuse box being tested in an engine bay'),
    'air-conditioning-heating': svc('ac', 'Dashboard, climate controls and air vents of a car'),
    'pre-purchase-inspection': svc('inspection', 'Technician inspecting the engine of a used car'),
  },

  gallery: [
    { ...stock('gal-tools', 'Wall of spanners and sockets in a workshop', [800, 1600], 1.5), caption: 'The tool wall' },
    { ...stock('gal-bench', 'Technician rebuilding an engine at a workbench', [800, 1600], 4 / 3), caption: 'Engine work' },
    { ...stock('gal-lift', 'Car raised on a lift with its bonnet open', [800, 1200], 2 / 3), caption: 'On the lift' },
    { ...stock('gal-headlight', 'Technician fitting a headlight unit', [800, 1600], 1.5), caption: 'Lighting and electrical' },
    { ...stock('gal-engine', 'Close-up of an engine’s auxiliary belt and pulleys', [800, 1600], 16 / 9), caption: 'Belts and pulleys' },
    { ...stock('gal-hands', 'Hands working on hoses inside an engine bay', [800, 1600], 1.5), caption: 'Hands-on diagnosis' },
  ],
};
