// Ported from base44/functions/marketplace/entry.ts (StaffTO repo).
import { adminUserIds, cleanList, cleanText, getSetting, HttpError, isAdmin, LOCATIONS, notify, nowIso, oneOf, requireActiveProfile, requireUser } from "./shared.server.js";
const CLASSIFIED_CATEGORIES = ["restaurant_equipment", "kitchen_equipment", "restaurant_supplies", "furniture", "appliances", "business_opportunities", "other"];
const REPORT_REASONS = ["scam", "discriminatory", "misleading_pay", "inappropriate", "duplicate", "sold_or_filled", "other"];
const AUTO_HIDE_AFTER_REPORTS = 3;
function listingPayload(d) {
  const title = cleanText(d.title, 120);
  if (title.length < 3) throw new HttpError(400, "Add a title.");
  const price_type = oneOf(d.price_type || "fixed", ["fixed", "negotiable", "free", "contact"], "Pricing");
  const price_cents = ["fixed", "negotiable"].includes(price_type) ? Math.round(Number(d.price) * 100) : 0;
  if (["fixed", "negotiable"].includes(price_type) && !(price_cents > 0)) throw new HttpError(400, "Enter a price, or choose Free / Contact for price.");
  const photos = cleanList(d.photos, 8, 600).filter((u) => /^https?:\/\//.test(u) || u.startsWith("/"));
  return {
    title,
    category: oneOf(d.category, CLASSIFIED_CATEGORIES, "Category"),
    description: cleanText(d.description, 6e3),
    price_type,
    price_cents,
    condition: oneOf(d.condition || "not_applicable", ["new", "like_new", "good", "fair", "for_parts", "not_applicable"], "Condition"),
    location: oneOf(d.location, LOCATIONS, "Location"),
    photos
  };
}
async function participants(sr, user, threadKey) {
  const [kind, id, buyer] = String(threadKey || "").split(":");
  if (kind === "app") {
    const app = await sr.entities.JobApplication.get(id).catch(() => null);
    if (!app) throw new HttpError(404, "Conversation not found.");
    const isEmployer = app.employer_owner_id === user.id;
    const isApplicant = app.applicant_id === user.id;
    if (!isEmployer && !isApplicant) throw new HttpError(403, "You're not part of this conversation.");
    if (app.status === "withdrawn") throw new HttpError(400, "This application was withdrawn.");
    return {
      context_type: "application",
      context_id: app.id,
      context_title: `${app.job_title} \xB7 ${app.employer_name}`,
      recipient_id: isEmployer ? app.applicant_id : app.employer_owner_id,
      recipient_name: isEmployer ? app.applicant_name : app.employer_name,
      sender_name: isEmployer ? app.employer_name : app.applicant_name,
      link: isEmployer ? "/account/messages" : "/employer/messages"
    };
  }
  if (kind === "cls") {
    const listing = await sr.entities.ClassifiedListing.get(id).catch(() => null);
    if (!listing) throw new HttpError(404, "Listing not found.");
    const isSeller = listing.owner_id === user.id;
    if (!isSeller && buyer !== user.id) throw new HttpError(403, "You're not part of this conversation.");
    return {
      context_type: "classified",
      context_id: listing.id,
      context_title: listing.title,
      recipient_id: isSeller ? buyer : listing.owner_id,
      recipient_name: isSeller ? "Buyer" : listing.seller_name,
      sender_name: user.full_name || user.email?.split("@")[0] || "StaffTO member",
      link: "/messages"
    };
  }
  throw new HttpError(400, "Invalid conversation.");
}
const actions = {
  async saveListing({ sr, user, body }) {
    requireUser(user);
    await requireActiveProfile(sr, user);
    const fields = listingPayload(body.data || {});
    const settings = await getSetting(sr, "classifieds", { require_approval: true });
    let listing = body.listing_id ? await sr.entities.ClassifiedListing.get(String(body.listing_id)).catch(() => null) : null;
    if (body.listing_id && (!listing || listing.owner_id !== user.id)) throw new HttpError(404, "Listing not found.");
    if (listing?.status === "removed") throw new HttpError(403, "This listing was removed by moderation.");
    const status = settings.require_approval ? "pending" : "active";
    if (!listing) {
      listing = await sr.entities.ClassifiedListing.create({ ...fields, owner_id: user.id, seller_name: cleanText(body.data?.seller_name, 80) || user.full_name || "StaffTO member", status, approved_at: status === "active" ? nowIso() : "", views: 0, report_count: 0 });
    } else {
      listing = await sr.entities.ClassifiedListing.update(listing.id, { ...fields, seller_name: cleanText(body.data?.seller_name, 80) || listing.seller_name, status: listing.status === "sold" ? "sold" : status });
    }
    return { listing };
  },
  async setListingStatus({ sr, user, body }) {
    requireUser(user);
    const listing = await sr.entities.ClassifiedListing.get(String(body.listing_id || "")).catch(() => null);
    if (!listing || listing.owner_id !== user.id) throw new HttpError(404, "Listing not found.");
    const status = oneOf(body.status, ["sold", "active", "delete"], "Status");
    if (listing.status === "removed") throw new HttpError(403, "This listing was removed by moderation.");
    if (status === "delete") {
      await sr.entities.ClassifiedListing.delete(listing.id);
      return { deleted: true };
    }
    if (status === "active" && !listing.approved_at) throw new HttpError(400, "This listing is still awaiting review.");
    return { listing: await sr.entities.ClassifiedListing.update(listing.id, { status }) };
  },
  async contactSeller({ sr, user, body, origin }) {
    requireUser(user);
    await requireActiveProfile(sr, user);
    const listing = await sr.entities.ClassifiedListing.get(String(body.listing_id || "")).catch(() => null);
    if (!listing || listing.status !== "active") throw new HttpError(404, "This listing isn't available.");
    if (listing.owner_id === user.id) throw new HttpError(400, "This is your listing.");
    const text = cleanText(body.body, 4e3);
    if (text.length < 2) throw new HttpError(400, "Write a message.");
    const thread_key = `cls:${listing.id}:${user.id}`;
    const msg = await sr.entities.Message.create({
      thread_key,
      context_type: "classified",
      context_id: listing.id,
      context_title: listing.title,
      sender_id: user.id,
      sender_name: user.full_name || user.email.split("@")[0],
      recipient_id: listing.owner_id,
      recipient_name: listing.seller_name,
      body: text,
      read: false
    });
    await notify(sr, listing.owner_id, { type: "message", title: `New message about "${listing.title}"`, body: text.slice(0, 280), link: "/messages" }, origin);
    return { message: msg, thread_key };
  },
  async sendMessage({ sr, user, body, origin }) {
    requireUser(user);
    await requireActiveProfile(sr, user);
    const text = cleanText(body.body, 4e3);
    if (text.length < 1) throw new HttpError(400, "Write a message.");
    const p = await participants(sr, user, body.thread_key);
    const msg = await sr.entities.Message.create({ thread_key: String(body.thread_key), context_type: p.context_type, context_id: p.context_id, context_title: p.context_title, sender_id: user.id, sender_name: p.sender_name, recipient_id: p.recipient_id, recipient_name: p.recipient_name, body: text, read: false });
    await notify(sr, p.recipient_id, { type: "message", title: `New message \u2014 ${p.context_title}`, body: text.slice(0, 280), link: "/messages" }, origin);
    return { message: msg };
  },
  async report({ sr, user, body, origin }) {
    requireUser(user);
    const target_type = oneOf(body.target_type, ["job", "classified", "employer", "message", "user"], "Target");
    const target_id = cleanText(body.target_id, 60);
    const reason = oneOf(body.reason, REPORT_REASONS, "Reason");
    const dup = await sr.entities.Report.filter({ reporter_id: user.id, target_id, status: "open" }, "-created_date", 1);
    if (dup.length) return { report: dup[0], duplicate: true };
    let title = "";
    if (target_type === "job") title = (await sr.entities.Job.get(target_id).catch(() => null))?.title || "";
    if (target_type === "classified") {
      const listing = await sr.entities.ClassifiedListing.get(target_id).catch(() => null);
      if (listing) {
        title = listing.title;
        const count = (listing.report_count || 0) + 1;
        await sr.entities.ClassifiedListing.update(listing.id, { report_count: count, ...count >= AUTO_HIDE_AFTER_REPORTS && listing.status === "active" ? { status: "pending", moderation_note: "Hidden automatically after multiple reports \u2014 awaiting review." } : {} });
      }
    }
    if (target_type === "employer") title = (await sr.entities.Employer.get(target_id).catch(() => null))?.business_name || "";
    const report = await sr.entities.Report.create({ reporter_id: user.id, target_type, target_id, target_title: title, reason, details: cleanText(body.details, 2e3), status: "open" });
    for (const adminId of await adminUserIds(sr)) {
      await notify(sr, adminId, { type: "report", title: `New report: ${target_type}`, body: `${reason}${title ? ` \u2014 ${title}` : ""}`, link: "/admin/reports" }, origin);
    }
    return { report };
  },
  async submitTestimonial({ sr, user, body }) {
    requireUser(user);
    const profile = await requireActiveProfile(sr, user);
    const quote = cleanText(body.quote, 800);
    if (quote.length < 20) throw new HttpError(400, "Tell us a little more (at least 20 characters).");
    if (!body.consent_to_publish) throw new HttpError(400, "Please confirm we may publish your testimonial.");
    const review = await sr.entities.Review.create({
      author_id: user.id,
      author_name: cleanText(body.author_name, 80) || user.full_name || "StaffTO member",
      author_role: cleanText(body.author_role, 80),
      business_name: cleanText(body.business_name, 120),
      audience: profile?.account_type || "seeker",
      quote,
      rating: Math.min(5, Math.max(1, Number(body.rating) || 5)),
      status: "pending",
      featured: false,
      consent_to_publish: true
    });
    return { review: { id: review.id, status: review.status } };
  },
  async markThreadRead({ sr, user, body }) {
    requireUser(user);
    const msgs = await sr.entities.Message.filter({ thread_key: String(body.thread_key || ""), recipient_id: user.id, read: false }, "-created_date", 200);
    for (const m of msgs) await sr.entities.Message.update(m.id, { read: true });
    return { updated: msgs.length };
  }
};
export {
  actions,
  isAdmin
};
