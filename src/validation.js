// Server-side validation — the source of truth. public/js/main.js mirrors these checks in the browser.
const services = require('../config/services');
const { parseISODate } = require('./schedule');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+()\-.\s\d]{7,20}$/;
const ID_RE = /^[a-zA-Z0-9-]{16,64}$/;
const TOPICS = ['Repair estimate', 'General question', 'Existing appointment', 'Other'];

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const phoneOk = (p) => PHONE_RE.test(p) && p.replace(/\D/g, '').length >= 7;

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
    preferred_time: str(body.preferred_time, 5),
    message: str(body.message, 2000),
  };

  if (!ID_RE.test(data.submission_id)) errors.form = 'Please reload the page and try again.';
  if (!data.vehicle_make) errors.vehicle_make = 'Choose or enter the vehicle make.';
  if (!data.vehicle_model) errors.vehicle_model = 'Choose or enter the model.';
  const year = Number(data.vehicle_year);
  const maxYear = new Date().getFullYear() + 1;
  if (!/^\d{4}$/.test(data.vehicle_year) || year < 1950 || year > maxYear) errors.vehicle_year = `Enter a year between 1950 and ${maxYear}.`;
  data.vehicle_year = year;

  if (!services.map((s) => s.name).concat('Other / Not sure').includes(data.service)) errors.service = 'Choose a service.';
  if (!parseISODate(data.preferred_date)) errors.preferred_date = 'Choose a date.';
  if (!/^\d{2}:\d{2}$/.test(data.preferred_time)) errors.preferred_time = 'Choose a time.';

  if (data.name.length < 2) errors.name = 'Enter your full name.';
  if (!phoneOk(data.phone)) errors.phone = 'Enter a valid phone number.';
  if (!EMAIL_RE.test(data.email)) errors.email = 'Enter a valid email address.';
  return { data, errors };
}

function validateInquiry(body = {}) {
  const errors = {};
  const data = {
    submission_id: str(body.submission_id, 64),
    name: str(body.name, 100),
    email: str(body.email, 150).toLowerCase(),
    phone: str(body.phone, 30),
    subject: str(body.subject, 40),
    message: str(body.message, 3000),
  };
  if (!ID_RE.test(data.submission_id)) errors.form = 'Please reload the page and try again.';
  if (data.name.length < 2) errors.name = 'Enter your name.';
  if (!EMAIL_RE.test(data.email)) errors.email = 'Enter a valid email address.';
  if (data.phone && !phoneOk(data.phone)) errors.phone = 'Enter a valid phone number, or leave it blank.';
  if (!TOPICS.includes(data.subject)) errors.subject = 'Choose a topic.';
  if (data.message.length < 10) errors.message = 'Write a message of at least 10 characters.';
  return { data, errors };
}

module.exports = { validateAppointment, validateInquiry, TOPICS };
