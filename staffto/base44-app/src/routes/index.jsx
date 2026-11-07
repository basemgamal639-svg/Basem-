import { createFileRoute } from "@tanstack/react-router";
import StaffToApp from "@/staffto/StaffToApp";

// StaffTO is a client-rendered app with its own router; "/" and every other path (see $.jsx) mount it.
export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({ meta: [{ title: "StaffTO — Toronto Hospitality Jobs" }] }),
  component: StaffToApp,
});
