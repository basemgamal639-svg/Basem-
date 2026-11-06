// Appointment slot generation and availability.
const db = require('./db');
const { booking } = require('../config/business');

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const pad = (n) => String(n).padStart(2, '0');
const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

// Local calendar date as YYYY-MM-DD (the server's timezone is the shop's timezone; set TZ to change it).
function localISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseISODate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

// All slot start times for a date, ignoring bookings. Empty when closed.
function slotsForDate(dateStr) {
  const date = parseISODate(dateStr);
  if (!date || booking.closedDates.includes(dateStr)) return [];
  const hours = booking.schedule[DAYS[date.getDay()]];
  if (!hours) return [];
  const out = [];
  for (let t = toMin(hours[0]); t + booking.slotMinutes <= toMin(hours[1]); t += booking.slotMinutes) out.push(toHHMM(t));
  return out;
}

function bookingWindow(now = new Date()) {
  const last = new Date(now);
  last.setDate(last.getDate() + booking.maxDaysAhead);
  return { min: localISO(now), max: localISO(last) };
}

function isBookableTime(dateStr, time, now = new Date()) {
  const date = parseISODate(dateStr);
  if (!date) return false;
  const [h, m] = time.split(':').map(Number);
  date.setHours(h, m, 0, 0);
  return date.getTime() >= now.getTime() + booking.minNoticeHours * 3600 * 1000;
}

function confirmedCount(dateStr, time, excludeId = 0) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM appointments WHERE status = 'Confirmed' AND preferred_date = ? AND preferred_time = ? AND id != ?")
    .get(dateStr, time, excludeId).n;
}

// Public availability: slots inside the booking window, with notice period applied.
function availability(dateStr, now = new Date()) {
  const { min, max } = bookingWindow(now);
  if (!parseISODate(dateStr) || dateStr < min || dateStr > max) return { date: dateStr, open: false, slots: [] };
  const all = slotsForDate(dateStr);
  const slots = all.map((time) => ({
    time,
    available: isBookableTime(dateStr, time, now) && confirmedCount(dateStr, time) < booking.capacity,
  }));
  return { date: dateStr, open: all.length > 0, slots };
}

function isSlotAvailable(dateStr, time, now = new Date()) {
  const a = availability(dateStr, now);
  const s = a.slots.find((x) => x.time === time);
  return Boolean(s && s.available);
}

module.exports = { availability, isSlotAvailable, slotsForDate, confirmedCount, bookingWindow, localISO, parseISODate };
