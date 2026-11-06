/**
 * SERVICES — each entry appears in the services index on the home page and gets its own page
 * at /services/<slug>. `icon` must match an id in src/icons.js.
 * `image` starts as a stock photo from config/photos.js. Replace it with your own:
 *   image: { src: '/images/photos/brakes.jpg', alt: '...', width: 1000, height: 1250 }  (4:5 portrait)
 */
const stock = require('./photos').services;

const services = [
  {
    slug: 'engine-diagnostics',
    name: 'Engine Diagnostics',
    icon: 'engine',
    short: 'Warning light on? We read the codes, test the system and find the actual cause before recommending any repair.',
    intro:
      'A fault code tells us where to look, not what to replace. We combine scan-tool data with hands-on testing so you pay for the repair the car actually needs.',
    includes: ['OBD-II fault code reading and interpretation', 'Live sensor and fuel-trim analysis', 'Misfire, sensor, emissions and electrical fault testing', 'A written explanation of the findings and an estimate before any work'],
    signs: ['Check-engine light on or flashing', 'Rough idle, hesitation or loss of power', 'Fuel consumption suddenly higher'],
  },
  {
    slug: 'brake-repair',
    name: 'Brake Repair & Replacement',
    icon: 'brake',
    short: 'Pads, discs, calipers and fluid measured against spec, with a clear view of what needs doing now and what can wait.',
    intro:
      'We measure pad thickness and disc wear, check the hydraulics and fluid condition, and show you the readings so the recommendation is easy to understand.',
    includes: ['Brake pad and shoe replacement', 'Disc and drum replacement', 'Caliper, hose and brake line repair', 'Brake fluid testing and replacement'],
    signs: ['Squealing or grinding under braking', 'Soft or long brake pedal', 'Car pulls to one side when stopping'],
  },
  {
    slug: 'oil-change-maintenance',
    name: 'Oil Changes & Maintenance',
    icon: 'oil',
    short: 'Manufacturer-schedule servicing with the correct oil specification, filters and a full vehicle check.',
    intro:
      'Scheduled maintenance is the cheapest way to avoid expensive failures. We follow your manufacturer’s service schedule and oil specification, and note anything that will need attention soon.',
    includes: ['Oil and filter change to manufacturer specification', 'Air, cabin and fuel filter replacement', 'Fluid level and condition checks', 'Service reminder reset and vehicle health check'],
    signs: ['Service indicator on the dashboard', 'Due or overdue by date or mileage', 'Low or dark oil on the dipstick'],
  },
  {
    slug: 'transmission-services',
    name: 'Transmission Services',
    icon: 'gear',
    short: 'Diagnosis and servicing for manual and automatic gearboxes, from fluid service to fault finding.',
    intro:
      'Transmission problems rarely improve on their own. Early diagnosis can be the difference between a fluid service and a major repair.',
    includes: ['Transmission fault code reading', 'Fluid level, condition and leak checks', 'Road test and shift-quality assessment', 'Fluid service and clutch inspection'],
    signs: ['Slipping or delayed gear changes', 'Harsh or jerky shifting', 'Burning smell or fluid under the car'],
  },
  {
    slug: 'tires-wheel-alignment',
    name: 'Tire Services & Wheel Alignment',
    icon: 'tire',
    short: 'Fitting, balancing, rotation and alignment for even wear, straight tracking and a quieter ride.',
    intro:
      'Correctly fitted, balanced and aligned tires last longer, grip better and make the car more pleasant to drive.',
    includes: ['Tire fitting and replacement', 'Wheel balancing and rotation', 'Wheel alignment check and adjustment', 'Puncture inspection and TPMS checks'],
    signs: ['Steering wheel off-centre or vibrating', 'Uneven or fast tire wear', 'Car drifts to one side'],
  },
  {
    slug: 'suspension-steering',
    name: 'Suspension & Steering',
    icon: 'suspension',
    short: 'Shocks, struts, bushes and steering joints inspected and replaced to restore stability and control.',
    intro:
      'Worn suspension affects braking distance, tire wear and how the car feels on the road. We inspect every joint and component and replace only what is worn.',
    includes: ['Shock absorber and strut replacement', 'Control arms, ball joints and bushes', 'Track rods and steering rack checks', 'Alignment after suspension work'],
    signs: ['Knocking or clunking over bumps', 'Excess body roll or bouncing', 'Vague or wandering steering'],
  },
  {
    slug: 'battery-electrical',
    name: 'Battery & Electrical Systems',
    icon: 'battery',
    short: 'Battery, charging and starting tests, plus fault finding on lights, sensors and wiring.',
    intro:
      'Modern cars depend on stable voltage. We test the battery, alternator and starter, and trace electrical faults back to their source.',
    includes: ['Battery health and load testing', 'Battery replacement and registration where required', 'Alternator and starter testing', 'Lighting, wiring and sensor fault finding'],
    signs: ['Slow cranking or clicking on start', 'Battery or charging warning light', 'Intermittent electrical faults'],
  },
  {
    slug: 'air-conditioning-heating',
    name: 'Air Conditioning & Heating',
    icon: 'ac',
    short: 'Performance checks, leak detection, recharging and heater repairs for a comfortable cabin all year.',
    intro:
      'If the air conditioning blows warm there is usually a reason. We find the cause, whether it is a leak, a component or a control fault, instead of only topping it up.',
    includes: ['A/C performance test and leak detection', 'Refrigerant recovery and recharge', 'Compressor, condenser and blower repairs', 'Heater, thermostat and cabin filter service'],
    signs: ['Air not cold, or heater not warm', 'Musty smell from the vents', 'Windows slow to demist'],
  },
  {
    slug: 'pre-purchase-inspection',
    name: 'Pre-Purchase Vehicle Inspection',
    icon: 'clipboard',
    short: 'An independent check of a used car before you buy, with a written report you can use to decide or negotiate.',
    intro:
      'A used car can look perfect and still hide expensive problems. Our inspection gives you an independent view of its condition before you commit.',
    includes: ['Diagnostic scan for stored and pending faults', 'Brakes, tires, suspension and steering inspection', 'Leaks, fluids and underbody check', 'Road test and written report with photos'],
    signs: ['Buying a used car privately or from a dealer', 'Checking a car before a long trip', 'Want an independent second opinion'],
  },
];

// Use the stock photo for any service without its own image.
for (const s of services) if (s.image === undefined) s.image = stock[s.slug] || null;

module.exports = services;
