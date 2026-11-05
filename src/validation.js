// Shared server-side validation. The browser runs equivalent checks in public/js/main.js,
// but the server is the source of truth.
const services = require('../config/services');
const business = require('../config/business');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+()\-.\s\d]{7,20}$/;
const UUID_RE = /^[a-zA-Z0-9-]{16,64}$/;

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function validateAppointment(body = {}) {
  const errors = {};
  const data = {
    submission_id: str(body.submission_id, 64),
    name: str(body.name, 100),
    phone: str(body.phone, 30),
    email: str(body.email, 150).toLowerCase(),
    vehicle_make: str(body.vehicle_make, 50),
    vehicle_model: str(body.vehicle_model, 50),
    vehicle_year: str(String(body.vehicle_year ?? ''), 4),
    service: str(body.service, 80),
    preferred_date: str(body.preferred_date, 10),
    preferred_time: str(body.preferred_time, 60),
    message: str(body.message, 2000),
  };

  if (!UUID_RE.test(data.submission_id)) errors.form = 'Please reload the page and try again.';
  if (data.name.length < 2) errors.name = 'Please enter your full name.';
  if (!PHONE_RE.test(data.phone) || data.phone.replace(/\D/g, '').length < 7)
    errors.phone = 'Please enter a valid phone number.';
  if (!EMAIL_RE.test(data.email)) errors.email = 'Please enter a valid email address.';
  if (!data.vehicle_make) errors.vehicle_make = 'Please enter the vehicle make.';
  if (!data.vehicle_model) errors.vehicle_model = 'Please enter the vehicle model.';

  const year = Number(data.vehicle_year);
  const maxYear = new Date().getFullYear() + 1;
  if (!/^\d{4}$/.test(data.vehicle_year) || year < 1950 || year > maxYear)
    errors.vehicle_year = `Please enter a year between 1950 and ${maxYear}.`;
  data.vehicle_year = year;

  const serviceNames = services.map((s) => s.name).concat('Other / Not sure');
  if (!serviceNames.includes(data.service)) errors.service = 'Please choose a service.';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.preferred_date) || isNaN(Date.parse(data.preferred_date)))
    errors.preferred_date = 'Please choose a preferred date.';
  else if (data.preferred_date < todayISO()) errors.preferred_date = 'Please choose a date in the future.';

  if (!business.appointmentTimes.includes(data.preferred_time))
    errors.preferred_time = 'Please choose a preferred time.';

  return { data, errors };
}

function validateInquiry(body = {}) {
  const errors = {};
  const data = {
    submission_id: str(body.submission_id, 64),
    name: str(body.name, 100),
    email: str(body.email, 150).toLowerCase(),
    phone: str(body.phone, 30),
    subject: str(body.subject, 150),
    message: str(body.message, 3000),
  };
  if (!UUID_RE.test(data.submission_id)) errors.form = 'Please reload the page and try again.';
  if (data.name.length < 2) errors.name = 'Please enter your name.';
  if (!EMAIL_RE.test(data.email)) errors.email = 'Please enter a valid email address.';
  if (data.phone && (!PHONE_RE.test(data.phone) || data.phone.replace(/\D/g, '').length < 7))
    errors.phone = 'Please enter a valid phone number or leave it blank.';
  if (data.message.length < 10) errors.message = 'Please enter a message (at least 10 characters).';
  return { data, errors };
}

module.exports = { validateAppointment, validateInquiry, EMAIL_RE };
