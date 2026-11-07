// The single server function the StaffTO client calls for server-enforced logic
// (quotas, applications, AI, billing, moderation, admin). Input is validated here;
// authorization happens in each action (see src/lib/staffto/*.server.js).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { dispatch } from "@/lib/staffto/dispatch.server";

export const staffBackend = createServerFn({ method: "POST" })
  .validator(
    z.object({
      fn: z.enum(["jobs", "ai", "billing", "marketplace", "site", "account", "admin"]),
      action: z.string().min(1).max(64),
      payload: z.record(z.string(), z.any()).optional(),
      origin: z.string().max(300).optional(),
    }),
  )
  .handler(({ data, context }) => dispatch(data, context));
