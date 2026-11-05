/**
 * SERVICES — each entry gets a card on the home page and its own page at /services/<slug>.
 * `icon` must match a symbol id in src/icons.js.
 */
module.exports = [
  {
    slug: 'general-repair-maintenance',
    name: 'General Repair & Maintenance',
    icon: 'wrench',
    short: 'Scheduled servicing and everyday repairs that keep your car running the way it should.',
    intro:
      'Regular maintenance is the simplest way to avoid expensive breakdowns. We follow your manufacturer’s service schedule and fix the small issues before they become big ones.',
    includes: [
      'Manufacturer-schedule maintenance',
      'Belts, hoses and filter replacement',
      'Lights, wipers and minor electrical repairs',
      'Multi-point visual inspection with every visit',
    ],
    signs: ['Service light on the dashboard', 'Overdue for scheduled maintenance', 'New noises, smells or leaks'],
  },
  {
    slug: 'engine-diagnostics',
    name: 'Engine Diagnostics',
    icon: 'engine',
    short: 'Check-engine light on? We read the codes, find the root cause and explain it in plain language.',
    intro:
      'A warning light is a symptom, not a diagnosis. We combine scan-tool data with hands-on testing to pinpoint the real problem — so you only pay for the repair you actually need.',
    includes: [
      'On-board diagnostic (OBD-II) code reading',
      'Live sensor data analysis',
      'Misfire, sensor and emissions fault testing',
      'Clear explanation and written estimate before any work',
    ],
    signs: ['Check-engine light on or flashing', 'Rough idle or loss of power', 'Poor fuel economy'],
  },
  {
    slug: 'oil-change-fluids',
    name: 'Oil Change & Fluids',
    icon: 'oil',
    short: 'Fresh oil, the right filter and topped-up fluids to protect your engine for the miles ahead.',
    intro:
      'Clean oil is your engine’s best protection. We use the oil grade your vehicle specifies and check every vital fluid while your car is with us.',
    includes: [
      'Conventional, blend and full-synthetic oil',
      'New oil filter',
      'Coolant, brake, power-steering and transmission fluid checks',
      'Fluid flushes and replacement when due',
    ],
    signs: ['Oil-change reminder or sticker due', 'Low or dark oil on the dipstick', 'Fluid spots under the car'],
  },
  {
    slug: 'brake-repair',
    name: 'Brake Inspection & Repair',
    icon: 'brake',
    short: 'Pads, rotors, calipers and fluid — inspected, measured and repaired so you can stop with confidence.',
    intro:
      'Your brakes are your most important safety system. We measure pad and rotor wear, check the hydraulics and show you what needs attention now and what can wait.',
    includes: [
      'Brake pad and shoe replacement',
      'Rotor and drum resurfacing or replacement',
      'Caliper and brake line repair',
      'Brake fluid testing and flush',
    ],
    signs: ['Squealing or grinding when braking', 'Soft or spongy pedal', 'Car pulls to one side when stopping'],
  },
  {
    slug: 'tires-balancing',
    name: 'Tire Replacement & Balancing',
    icon: 'tire',
    short: 'Mounting, balancing and rotation for a smooth, quiet ride and longer-lasting tires.',
    intro:
      'Correctly fitted and balanced tires improve grip, comfort and fuel economy. We help you choose the right tire for your car and the way you drive.',
    includes: [
      'Tire mounting and replacement',
      'Wheel balancing',
      'Tire rotation',
      'Puncture inspection and pressure (TPMS) checks',
    ],
    signs: ['Vibration through the steering wheel', 'Uneven or low tread', 'Tire-pressure warning light'],
  },
  {
    slug: 'battery-service',
    name: 'Battery Testing & Replacement',
    icon: 'battery',
    short: 'Load-tested batteries and charging-system checks so you’re never left with a car that won’t start.',
    intro:
      'Batteries often fail without warning. A quick test tells us how much life yours has left and whether the alternator and starter are doing their job.',
    includes: [
      'Battery load and health testing',
      'Battery replacement and terminal cleaning',
      'Alternator and charging-system testing',
      'Starter diagnostics',
    ],
    signs: ['Slow or clicking start', 'Battery warning light', 'Dim headlights or electrical glitches'],
  },
  {
    slug: 'suspension-steering',
    name: 'Suspension & Steering',
    icon: 'suspension',
    short: 'Shocks, struts and steering components repaired for a stable, comfortable and safe drive.',
    intro:
      'Worn suspension affects handling, braking distance and tire wear. We inspect every joint and component and restore the ride and control you expect.',
    includes: [
      'Shock absorber and strut replacement',
      'Ball joints, tie rods and bushings',
      'Power-steering repairs',
      'Wheel alignment checks',
    ],
    signs: ['Excessive bouncing or body roll', 'Clunking over bumps', 'Loose or wandering steering'],
  },
  {
    slug: 'air-conditioning',
    name: 'Air Conditioning Service',
    icon: 'ac',
    short: 'A/C performance checks, leak detection and recharging to keep your cabin cool and comfortable.',
    intro:
      'If your A/C is blowing warm, there is usually a reason — a leak, a failing component or low refrigerant. We find it and fix it properly rather than just topping it up.',
    includes: [
      'A/C performance testing',
      'Leak detection',
      'Refrigerant evacuation and recharge',
      'Compressor, condenser and cabin-filter service',
    ],
    signs: ['Air not cold enough', 'Musty smell from vents', 'Unusual noise when A/C is on'],
  },
  {
    slug: 'transmission-diagnostics',
    name: 'Transmission Diagnostics',
    icon: 'gear',
    short: 'Slipping, harsh shifts or warning lights? We diagnose transmission problems before they get worse.',
    intro:
      'Transmission problems rarely fix themselves. Early diagnosis can be the difference between a simple fluid service and a major repair.',
    includes: [
      'Transmission fault code reading',
      'Fluid level and condition check',
      'Road testing and shift-quality assessment',
      'Fluid service and repair recommendations',
    ],
    signs: ['Slipping or delayed gear changes', 'Harsh or jerky shifting', 'Burning smell or red fluid leak'],
  },
  {
    slug: 'vehicle-inspections',
    name: 'Vehicle Inspections',
    icon: 'clipboard',
    short: 'Thorough inspections before a road trip, a purchase or a required check — with a clear written report.',
    intro:
      'Whether you are buying a used car, heading on a long trip or simply want peace of mind, our inspection gives you an honest picture of your vehicle’s condition.',
    includes: [
      'Pre-purchase inspections',
      'Pre-trip safety checks',
      'Brakes, tires, lights, suspension and fluid inspection',
      'Written findings with prioritised recommendations',
    ],
    signs: ['Buying a used vehicle', 'Planning a long drive', 'Want a full health check'],
  },
];
