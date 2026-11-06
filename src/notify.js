/**
 * Email alerts to the shop for new appointment requests and messages.
 *
 * Configure with environment variables:
 *   NOTIFY_TO      address that receives alerts (required to enable alerts)
 *   NOTIFY_FROM    sender address, e.g. "Website <bookings@your-domain.com>"
 *   SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS, SMTP_SECURE ("1" for port 465)
 * Most email providers (Google Workspace, Microsoft 365, Postmark, SendGrid, Mailgun…) offer SMTP.
 *
 * The result of every attempt is stored on the record (notified_at / notify_error) and shown in the admin.
 */
const nodemailer = require('nodemailer');
const db = require('./db');

const TO = process.env.NOTIFY_TO;
let transporter = null;
if (process.env.SMTP_TRANSPORT === 'json') {
  transporter = nodemailer.createTransport({ jsonTransport: true }); // used by the test suite
} else if (TO && process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === '1',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

const enabled = () => Boolean(transporter);

const lines = (pairs) => pairs.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');

async function send(table, id, subject, text, replyTo) {
  if (!transporter) return;
  try {
    await transporter.sendMail({
      from: process.env.NOTIFY_FROM || process.env.SMTP_USER || 'website@localhost',
      to: TO || 'shop@localhost',
      replyTo,
      subject,
      text,
    });
    db.prepare(`UPDATE ${table} SET notified_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), notify_error = NULL WHERE id = ?`).run(id);
  } catch (err) {
    console.error(`[notify] ${table} #${id} failed:`, err.message);
    db.prepare(`UPDATE ${table} SET notify_error = ? WHERE id = ?`).run(String(err.message).slice(0, 300), id);
  }
}

function appointmentCreated(row, adminUrl) {
  return send(
    'appointments',
    row.id,
    `New appointment request ${row.reference} — ${row.service}`,
    `A new appointment request was submitted on the website. It is NOT confirmed until you confirm it with the customer.\n\n${lines([
      ['Reference', row.reference],
      ['Customer', row.name],
      ['Phone', row.phone],
      ['Email', row.email],
      ['Vehicle', `${row.vehicle_year} ${row.vehicle_make} ${row.vehicle_model}`],
      ['Service', row.service],
      ['Requested slot', `${row.preferred_date} at ${row.preferred_time}`],
      ['Details', row.message],
    ])}\n\nManage it in the admin dashboard: ${adminUrl}`,
    row.email
  );
}

function inquiryCreated(row, adminUrl) {
  return send(
    'inquiries',
    row.id,
    `New website message ${row.reference}${row.subject ? ' — ' + row.subject : ''}`,
    `${lines([
      ['Reference', row.reference],
      ['From', row.name],
      ['Email', row.email],
      ['Phone', row.phone],
      ['Topic', row.subject],
    ])}\n\n${row.message}\n\nAdmin dashboard: ${adminUrl}`,
    row.email
  );
}

module.exports = { enabled, appointmentCreated, inquiryCreated };
