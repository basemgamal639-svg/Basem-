// stripeWebhook — receives Stripe events (configure the endpoint URL of this function in the Stripe dashboard).
// Verifies the Stripe-Signature header with STRIPE_WEBHOOK_SECRET before touching any data.
// deno-lint-ignore-file no-explicit-any
import { createClientFromRequest } from "npm:@base44/sdk@0.8.59";
import { addDays, getPricing, notify } from "./_shared.ts";

async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function verifyStripeSignature(raw: string, header: string, secret: string, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=")).map(([k, ...v]) => [k, v.join("=")]));
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${raw}`);
  return sigs.some((s) => safeEqual(s, expected));
}

async function markPaid(sr: any, paymentId: string, ref: string, origin: string) {
  const payment = await sr.entities.Payment.get(paymentId).catch(() => null);
  if (!payment || payment.status === "paid") return;
  // Inline fulfilment (kept in sync with billing/fulfil).
  const pricing = await getPricing(sr);
  const employer = await sr.entities.Employer.get(payment.employer_id);
  await sr.entities.Payment.update(payment.id, { status: "paid", paid_at: new Date().toISOString(), provider_ref: ref || payment.provider_ref });
  if (payment.product === "single_job") {
    await sr.entities.Employer.update(employer.id, { job_credits: (employer.job_credits || 0) + 1, plan: employer.plan === "free" ? "single" : employer.plan });
  } else if (payment.product === "featured_upgrade") {
    await sr.entities.Employer.update(employer.id, { featured_credits: (employer.featured_credits || 0) + 1 });
  } else {
    const plan = pricing.products[payment.product].plan;
    const existing = (await sr.entities.Subscription.filter({ employer_id: employer.id }, "-created_date", 1))[0];
    const sub = { employer_id: employer.id, owner_id: payment.owner_id, plan, status: "active", provider: "stripe", provider_ref: ref, current_period_end: addDays(31), cancel_at_period_end: false };
    if (existing) await sr.entities.Subscription.update(existing.id, sub);
    else await sr.entities.Subscription.create(sub);
    await sr.entities.Employer.update(employer.id, { plan });
  }
  if (payment.promo_code) {
    const promo = (await sr.entities.PromoCode.filter({ code: payment.promo_code }, "-created_date", 1))[0];
    if (promo) await sr.entities.PromoCode.update(promo.id, { redemptions: (promo.redemptions || 0) + 1 });
  }
  await notify(sr, payment.owner_id, { type: "payment", title: `Payment received — ${payment.description}`, body: `Invoice ${payment.invoice_number} is paid.`, link: "/employer/billing" }, origin);
}

export const handler = async (req: Request) => {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return Response.json({ error: "Webhook not configured" }, { status: 503 });
  const raw = await req.text();
  const ok = await verifyStripeSignature(raw, req.headers.get("stripe-signature") || "", secret);
  if (!ok) return Response.json({ error: "Invalid signature" }, { status: 400 });
  const event = JSON.parse(raw);
  const sr = createClientFromRequest(req).asServiceRole;
  const origin = Deno.env.get("SITE_URL") || "";
  const obj = event.data?.object || {};
  if (event.type === "checkout.session.completed" && obj.payment_status === "paid") {
    await markPaid(sr, obj.metadata?.payment_id || obj.client_reference_id, obj.subscription || obj.payment_intent || obj.id, origin);
  } else if (event.type === "invoice.paid" && obj.subscription) {
    const sub = (await sr.entities.Subscription.filter({ provider_ref: obj.subscription }, "-created_date", 1))[0];
    if (sub) await sr.entities.Subscription.update(sub.id, { status: "active", current_period_end: new Date((obj.lines?.data?.[0]?.period?.end || Date.now() / 1000 + 31 * 86400) * 1000).toISOString() });
  } else if (event.type === "invoice.payment_failed" && obj.subscription) {
    const sub = (await sr.entities.Subscription.filter({ provider_ref: obj.subscription }, "-created_date", 1))[0];
    if (sub) await sr.entities.Subscription.update(sub.id, { status: "past_due" });
  } else if (event.type === "customer.subscription.deleted") {
    const sub = (await sr.entities.Subscription.filter({ provider_ref: obj.id }, "-created_date", 1))[0];
    if (sub) {
      await sr.entities.Subscription.update(sub.id, { status: "cancelled" });
      await sr.entities.Employer.update(sub.employer_id, { plan: "free" });
    }
  }
  return Response.json({ received: true });
};

Deno.serve(handler);
