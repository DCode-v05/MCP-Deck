import { redirect } from "next/navigation";

// The widget chat was removed — /apps is now the only surface.
export default function Page() {
  redirect("/apps");
}
