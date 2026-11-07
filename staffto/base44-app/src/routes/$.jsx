import { createFileRoute } from "@tanstack/react-router";
import StaffToApp from "@/staffto/StaffToApp";

// Catch-all: StaffTO's own router (react-router) resolves the path in the browser.
export const Route = createFileRoute("/$")({
  ssr: false,
  head: () => ({ meta: [{ title: "StaffTO — Toronto Hospitality Jobs" }] }),
  component: StaffToApp,
});
