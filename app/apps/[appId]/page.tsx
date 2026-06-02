import { notFound } from "next/navigation";
import { getAppDef, toAppView, APP_DEFS } from "@/lib/apps/kit/registry";
import { LiveApp } from "@/components/apps/kit/LiveApp";

export function generateStaticParams() {
  return Object.keys(APP_DEFS).map((appId) => ({ appId }));
}

export default async function KitAppPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;
  const def = getAppDef(appId);
  if (!def) notFound();
  return (
    <main className="h-full">
      <LiveApp def={toAppView(def)} />
    </main>
  );
}
