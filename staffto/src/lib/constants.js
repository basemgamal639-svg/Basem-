export const CATEGORIES = [
  ['chef', 'Chef', 'BOH'], ['sous_chef', 'Sous Chef', 'BOH'], ['line_cook', 'Line Cook', 'BOH'], ['prep_cook', 'Prep Cook', 'BOH'],
  ['dishwasher', 'Dishwasher', 'BOH'], ['kitchen_manager', 'Kitchen Manager', 'BOH'], ['restaurant_manager', 'Restaurant Manager', 'FOH'],
  ['server', 'Server', 'FOH'], ['bartender', 'Bartender', 'FOH'], ['barista', 'Barista', 'FOH'], ['host', 'Host', 'FOH'],
  ['busser', 'Busser', 'FOH'], ['catering_staff', 'Catering Staff', 'Events'], ['event_staff', 'Event Staff', 'Events'], ['other', 'Other hospitality', 'Other'],
].map(([value, label, group]) => ({ value, label, group }));

export const LOCATIONS = [
  ['downtown_toronto', 'Downtown Toronto'], ['north_york', 'North York'], ['scarborough', 'Scarborough'], ['etobicoke', 'Etobicoke'],
  ['east_york', 'East York'], ['york', 'York'], ['mississauga', 'Mississauga'], ['brampton', 'Brampton'], ['markham', 'Markham'],
  ['vaughan', 'Vaughan'], ['richmond_hill', 'Richmond Hill'], ['oakville', 'Oakville'], ['pickering', 'Pickering'], ['ajax', 'Ajax'], ['other_gta', 'Elsewhere in the GTA'],
].map(([value, label]) => ({ value, label }));

export const BUSINESS_TYPES = [
  ['restaurant', 'Restaurant'], ['bar_pub', 'Bar / Pub'], ['cafe', 'Café'], ['hotel', 'Hotel'], ['catering', 'Catering'], ['bakery', 'Bakery'],
  ['nightlife', 'Nightlife'], ['event_venue', 'Event venue'], ['food_truck', 'Food truck'], ['other_hospitality', 'Other hospitality'],
].map(([value, label]) => ({ value, label }));

export const EMPLOYMENT_TYPES = [
  ['full_time', 'Full-time'], ['part_time', 'Part-time'], ['contract', 'Contract'], ['seasonal', 'Seasonal'], ['temporary', 'Temporary'],
].map(([value, label]) => ({ value, label }));

export const EXPERIENCE = [
  ['none', 'No experience needed'], ['under_1', 'Under 1 year'], ['1_2', '1–2 years'], ['3_5', '3–5 years'], ['5_plus', '5+ years'],
].map(([value, label]) => ({ value, label }));

export const SHIFTS = [['mornings', 'Mornings'], ['afternoons', 'Afternoons'], ['evenings', 'Evenings'], ['overnight', 'Overnight'], ['weekends', 'Weekends']].map(([value, label]) => ({ value, label }));
export const TIPS = [['none', 'No tips'], ['pooled', 'Tip pool'], ['individual', 'Keep your tips'], ['service_charge', 'Service charge share']].map(([value, label]) => ({ value, label }));
export const EMPLOYEE_BANDS = ['1-9', '10-24', '25-49', '50-99', '100+'].map((v) => ({ value: v, label: `${v} employees` }));

export const CLASSIFIED_CATEGORIES = [
  ['restaurant_equipment', 'Restaurant equipment'], ['kitchen_equipment', 'Kitchen equipment'], ['restaurant_supplies', 'Restaurant supplies'],
  ['furniture', 'Furniture'], ['appliances', 'Appliances'], ['business_opportunities', 'Business opportunities'], ['other', 'Other'],
].map(([value, label]) => ({ value, label }));
export const CONDITIONS = [['new', 'New'], ['like_new', 'Like new'], ['good', 'Good'], ['fair', 'Fair'], ['for_parts', 'For parts'], ['not_applicable', 'N/A']].map(([value, label]) => ({ value, label }));

export const APP_STATUS = {
  submitted: { label: 'Submitted', tone: 'neutral' }, viewed: { label: 'Viewed', tone: 'neutral' }, shortlisted: { label: 'Shortlisted', tone: 'lake' },
  interview: { label: 'Interview', tone: 'brass' }, offered: { label: 'Offered', tone: 'brass' }, hired: { label: 'Hired', tone: 'ok' },
  rejected: { label: 'Not selected', tone: 'muted' }, withdrawn: { label: 'Withdrawn', tone: 'muted' },
};
export const JOB_STATUS = {
  draft: { label: 'Draft', tone: 'neutral' }, active: { label: 'Live', tone: 'ok' }, closed: { label: 'Closed', tone: 'muted' },
  removed: { label: 'Removed', tone: 'signal' }, expired: { label: 'Expired', tone: 'muted' },
};
export const REPORT_REASONS = [
  ['scam', 'Scam or fraud'], ['discriminatory', 'Discriminatory'], ['misleading_pay', 'Misleading pay'], ['inappropriate', 'Inappropriate'],
  ['duplicate', 'Duplicate'], ['sold_or_filled', 'Already filled / sold'], ['other', 'Something else'],
].map(([value, label]) => ({ value, label }));

// TIPS goes first so that EXPERIENCE's 'none' label wins (tips 'none' is never displayed).
const ALL = [...TIPS, ...CATEGORIES, ...LOCATIONS, ...BUSINESS_TYPES, ...EMPLOYMENT_TYPES, ...EXPERIENCE, ...SHIFTS, ...CLASSIFIED_CATEGORIES, ...CONDITIONS];
const MAP = Object.fromEntries(ALL.map((o) => [o.value, o.label]));
export const label = (v) => MAP[v] || v || '';
