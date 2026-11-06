// billing — pricing catalog, quotes, promo codes, checkout and fulfilment.
//
// Live payment collection is OFF until the owner (1) sets the STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET secrets and
// (2) turns on PlatformSetting "payments" { enabled: true } in Admin → Settings after testing in Stripe test mode.
// Until then checkout returns `payments_not_configured`; 100%-off promo codes and admin grants still work.
// deno-lint-ignore-file no-explicit-any
import { createClientFromRequest } from "npm:@base44/sdk@0.8.59";
import { addDays, cleanText, getOwnedEmployer, getPricing, getSetting, HttpError, notify, nowIso, oneOf, requireUser, serveActions } from "./_shared.ts";

const PRODUCTS = ["single_job", "featured_upgrade", "pro_monthly", "premium_monthly"] as const;

export async function paymentsStatus(sr: any) {
  const setting = await getSetting(sr, "payments", { enabled: false, provider: "stripe", mode: "test" });
  const hasKey = !!Deno.env.get("STRIPE_SECRET_KEY");
  return { enabled: !!setting.enabled && hasKey, provider: setting.provider || "stripe", mode: setting.mode || "test", key_configured: hasKey };
}

export function computeQuote(pricing: any, product: string, promo: any | null) {
  const p = pricing.products?.[product];
  if (!p) throw new HttpError(400, "Unknown product.");
  const subtotal = Math.round(Number(p.price_cents) || 0);
  let discount = 0;
  if (promo) {
    discount = promo.discount_type === "percent" ? Math.round(subtotal * Math.min(100, Math.max(0, promo.amount)) / 100) : Math.min(subtotal, Math.round(promo.amount));
  }
  const taxable = Math.max(0, subtotal - discount);
  const tax = Math.round(taxable * (pricing.tax_rate ?? 0.13));
  return { product, name: p.name, kind: p.kind, subtotal_cents: subtotal, discount_cents: discount, tax_cents: tax, total_cents: taxable + tax, currency: pricing.currency || "CAD", tax_label: pricing.tax_label || "HST" };
}

async function findPromo(sr: any, code: string, product: string) {
  if (!code) return null;
  const promo = (await sr.entities.PromoCode.filter({ code: code.toUpperCase() }, "-created_date", 1))[0];
  if (!promo || promo.active === false) throw new HttpError(400, "That promo code isn't valid.");
  if (promo.valid_until && promo.valid_until < nowIso()) throw new HttpError(400, "That promo code has expired.");
  if (promo.max_redemptions && (promo.redemptions || 0) >= promo.max_redemptions) throw new HttpError(400, "That promo code has been fully redeemed.");
  if (promo.applies_to?.length && !promo.applies_to.includes(product)) throw new HttpError(400, "That promo code doesn't apply to this product.");
  return promo;
}

async function nextInvoiceNumber(sr: any) {
  const year = new Date().getFullYear();
  const count = (await sr.entities.Payment.list("-created_date", 10000)).length;
  return `STO-${year}-${String(count + 1).padStart(5, "0")}`;
}

// Idempotent: marks a pending payment paid and grants what was bought.
export async function fulfil(sr: any, payment: any, origin = "", providerRef = "") {
  if (payment.status === "paid") return payment;
  const pricing = await getPricing(sr);
  const employer = await sr.entities.Employer.get(payment.employer_id);
  const updated = await sr.entities.Payment.update(payment.id, { status: "paid", paid_at: nowIso(), provider_ref: providerRef || payment.provider_ref || "" });
  if (payment.product === "single_job") {
    await sr.entities.Employer.update(employer.id, { job_credits: (employer.job_credits || 0) + 1, plan: employer.plan === "free" ? "single" : employer.plan });
  } else if (payment.product === "featured_upgrade") {
    await sr.entities.Employer.update(employer.id, { featured_credits: (employer.featured_credits || 0) + 1 });
  } else {
    const plan = pricing.products[payment.product].plan;
    const existing = (await sr.entities.Subscription.filter({ employer_id: employer.id }, "-created_date", 1))[0];
    const sub = { employer_id: employer.id, owner_id: payment.owner_id, plan, status: "active", provider: payment.provider, provider_ref: providerRef || payment.provider_ref || "", current_period_end: addDays(30), cancel_at_period_end: false };
    if (existing) await sr.entities.Subscription.update(existing.id, sub);
    else await sr.entities.Subscription.create(sub);
    await sr.entities.Employer.update(employer.id, { plan });
  }
  if (payment.promo_code) {
    const promo = (await sr.entities.PromoCode.filter({ code: payment.promo_code }, "-created_date", 1))[0];
    if (promo) await sr.entities.PromoCode.update(promo.id, { redemptions: (promo.redemptions || 0) + 1 });
  }
  await notify(sr, payment.owner_id, { type: "payment", title: `Payment received — ${payment.description}`, body: `Invoice ${payment.invoice_number}: ${(payment.total_cents / 100).toFixed(2)} ${payment.currency}. Thank you!`, link: "/employer/billing" }, origin);
  return updated;
}

async function stripeCheckout(payment: any, quote: any, origin: string, customerEmail: string) {
  const key = Deno.env.get("STRIPE_SECRET_KEY")!;
  const form = new URLSearchParams();
  const recurring = quote.kind === "subscription";
  form.set("mode", recurring ? "subscription" : "payment");
  form.set("success_url", `${origin}/employer/billing?payment=${payment.id}&status=success`);
  form.set("cancel_url", `${origin}/employer/billing?payment=${payment.id}&status=cancelled`);
  form.set("customer_email", customerEmail);
  form.set("client_reference_id", payment.id);
  form.set("metadata[payment_id]", payment.id);
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", (quote.currency || "CAD").toLowerCase());
  form.set("line_items[0][price_data][product_data][name]", quote.name);
  form.set("line_items[0][price_data][unit_amount]", String(quote.total_cents));
  if (recurring) {
    form.set("line_items[0][price_data][recurring][interval]", "month");
    form.set("subscription_data[metadata][payment_id]", payment.id);
  }
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new HttpError(502, `Payment provider error: ${data?.error?.message || res.status}`);
  return data;
}

const actions: Record<string, (ctx: any) => Promise<any>> = {
  async catalog({ sr }) {
    const pricing = await getPricing(sr);
    const status = await paymentsStatus(sr);
    return { pricing, payments: { enabled: status.enabled, mode: status.mode } };
  },

  async quote({ sr, user, body }) {
    requireUser(user);
    const product = oneOf(body.product, PRODUCTS, "Product")!;
    const pricing = await getPricing(sr);
    const promo = await findPromo(sr, cleanText(body.promo_code, 40), product);
    return { quote: computeQuote(pricing, product, promo), promo_applied: !!promo };
  },

  async checkout({ sr, user, body, origin }) {
    requireUser(user);
    const employer = await getOwnedEmployer(sr, user);
    const product = oneOf(body.product, PRODUCTS, "Product")!;
    const pricing = await getPricing(sr);
    const promoCode = cleanText(body.promo_code, 40).toUpperCase();
    const promo = await findPromo(sr, promoCode, product);
    const quote = computeQuote(pricing, product, promo);
    const status = await paymentsStatus(sr);
    if (quote.total_cents > 0 && !status.enabled) {
      return { status: "payments_not_configured", message: "Online payments aren't switched on yet. Contact hello@staffto.ca and we'll activate your plan manually.", quote };
    }
    const payment = await sr.entities.Payment.create({
      employer_id: employer.id, owner_id: user.id, employer_name: employer.business_name, product, description: quote.name,
      subtotal_cents: quote.subtotal_cents, discount_cents: quote.discount_cents, tax_cents: quote.tax_cents, total_cents: quote.total_cents,
      currency: quote.currency, promo_code: promo ? promoCode : "", status: "pending", provider: quote.total_cents === 0 ? "promo" : "stripe",
      invoice_number: await nextInvoiceNumber(sr), job_id: cleanText(body.job_id, 40),
    });
    await sr.entities.AnalyticsEvent.create({ type: "checkout", user_id: user.id, channel: product });
    if (quote.total_cents === 0) {
      const paid = await fulfil(sr, payment, origin);
      return { status: "paid", payment: paid };
    }
    if (!origin) throw new HttpError(400, "Missing site origin.");
    const session = await stripeCheckout(payment, quote, origin, user.email);
    await sr.entities.Payment.update(payment.id, { provider_ref: session.id });
    return { status: "redirect", url: session.url, payment_id: payment.id };
  },

  async cancelSubscription({ sr, user }) {
    requireUser(user);
    const employer = await getOwnedEmployer(sr, user);
    const sub = (await sr.entities.Subscription.filter({ employer_id: employer.id, status: "active" }, "-created_date", 1))[0];
    if (!sub) throw new HttpError(404, "No active subscription.");
    if (sub.provider === "stripe" && sub.provider_ref && Deno.env.get("STRIPE_SECRET_KEY")) {
      const res = await fetch(`https://api.stripe.com/v1/subscriptions/${sub.provider_ref}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ cancel_at_period_end: "true" }),
      });
      if (!res.ok) throw new HttpError(502, "Couldn't reach the payment provider. Try again.");
    }
    return { subscription: await sr.entities.Subscription.update(sub.id, { cancel_at_period_end: true }) };
  },
};

export const handler = serveActions(actions, createClientFromRequest);
Deno.serve(handler);
