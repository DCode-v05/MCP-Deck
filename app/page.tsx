import { McpDeckPanel } from "@/components/mcpdeck/McpDeckPanel";

// McpDeck is the only surface — it lives at the root.
export default function Page() {
  return (
    <main className="h-full">
      <McpDeckPanel />
    </main>
  );
}
