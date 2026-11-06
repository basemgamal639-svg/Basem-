/**
 * FAQ — answers marked `null` are policy questions only the shop can answer.
 * They show as placeholders in development and are hidden in production until you fill them in.
 */
module.exports = [
  {
    q: 'Do I need an appointment?',
    a: 'Booking ahead is the best way to make sure a technician and a bay are free when you arrive. Use the booking form or call us, and we will confirm a time with you.',
  },
  {
    q: 'How long do repairs usually take?',
    a: 'Routine work such as an oil change or brake pads is often finished the same day. Diagnostics and larger repairs depend on what we find and on parts availability. We give you a time estimate with the price, and keep you updated if anything changes.',
  },
  {
    q: 'Do you provide repair estimates?',
    a: 'Yes. We explain what we found and give you an estimate before starting any work, and we ask for your approval before doing anything that was not agreed.',
  },
  { q: 'What vehicle brands do you service?', a: null, placeholder: 'List the makes you work on, or say “all major makes”.' },
  {
    q: 'Do you offer diagnostic services?',
    a: 'Yes. We use scan tools together with hands-on testing to find the cause of warning lights, running problems and electrical faults.',
  },
  { q: 'What payment methods do you accept?', a: null, placeholder: 'e.g. cash, debit and credit cards, Apple Pay.' },
  { q: 'Do you provide a warranty on repairs?', a: null, placeholder: 'Describe your parts and labour warranty, or remove this question.' },
];
