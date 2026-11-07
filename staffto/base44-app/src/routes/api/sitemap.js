// Live XML sitemap of active jobs, published articles and classifieds (all publicly readable),
// read as the anonymous visitor — no service role.
import { createFileRoute } from "@tanstack/react-router";
import { buildSitemap } from "@/lib/staffto/site.server";

export const Route = createFileRoute("/api/sitemap")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const base44 = context.getBase44();
        const origin = new URL(request.url).origin;
        const [jobs, articles, listings] = await Promise.all([
          base44.entities.Job.filter({ status: "active" }, "-updated_date", 5000, 0, ["id", "slug", "updated_date"]),
          base44.entities.Article.filter({ status: "published" }, "-updated_date", 1000, 0, ["slug", "updated_date"]),
          base44.entities.ClassifiedListing.filter({ status: "active" }, "-updated_date", 2000, 0, ["id", "updated_date"]),
        ]);
        return new Response(buildSitemap(origin, jobs, articles, listings), {
          headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});
