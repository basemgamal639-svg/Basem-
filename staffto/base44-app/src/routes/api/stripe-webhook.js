// Stripe webhook endpoint: https://<your-domain>/api/stripe-webhook
// The handler verifies the Stripe-Signature header (STRIPE_WEBHOOK_SECRET) before using the service role.
import { createFileRoute } from "@tanstack/react-router";
import { makeWebhookHandler } from "@/lib/staffto/stripeWebhook.server";

export const Route = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: ({ request, context }) => makeWebhookHandler(() => context.getBase44().asServiceRole)(request),
    },
  },
});
