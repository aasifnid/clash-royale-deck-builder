"use client";

import { useState } from "react";
import type { Collection } from "@/lib/types";

// Owner's default tag — pre-filled so syncing is one click. Once you've synced, the
// last-used tag (collection.tag) takes over.
const DEFAULT_TAG = "#20P8U02YJG";

interface Props {
  collection: Collection;
  onSynced: (c: Collection) => void;
}

export default function SyncBar({ collection, onSynced }: Props) {
  const [tag, setTag] = useState(collection.tag || DEFAULT_TAG);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    if (!tag.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/player?tag=${encodeURIComponent(tag.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed.");
      onSynced(data as Collection);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sync()}
            placeholder="#YourPlayerTag"
            className="rounded-lg bg-[var(--background)] px-3 py-1.5 text-sm outline-none"
            style={{ border: "1px solid var(--border)", minWidth: 160 }}
          />
          <button
            onClick={sync}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-bold transition disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {loading ? "Syncing…" : "Sync account"}
          </button>
        </div>
        {collection.syncedAt && collection.name && (
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            Synced <strong style={{ color: "var(--foreground)" }}>{collection.name}</strong>
            {collection.trophies != null ? ` · ${collection.trophies} 🏆` : ""}
            {collection.arena != null ? ` · Arena ${collection.arena}` : ""}
            {collection.experienceLevel != null ? ` · Exp ${collection.experienceLevel}` : ""}
          </span>
        )}
      </div>
      {error && (
        <p className="mt-2 text-sm" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}
      <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
        Your tag is public — no password needed. Or skip syncing and add cards by hand below.
      </p>
    </section>
  );
}
