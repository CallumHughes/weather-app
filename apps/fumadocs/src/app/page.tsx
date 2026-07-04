import { redirect } from "next/navigation";

import { docsRoute } from "@/lib/shared";

// The docs are the whole app — there is no landing page to show.
export default function HomePage() {
  redirect(docsRoute);
}
