"use client";

import { useState } from "react";
import type { Collection } from "@/lib/types";

// A real account used for the "Try a sample" button, so visitors who don't play can still
// see the tool work end to end.
const SAMPLE_TAG = "#20P8U02YJG";

interface Props {
  collection: Collection;
  onSynced: (c: Collection) => void;
}

export default function SyncBar({ collection, onSynced }: Props) {
  const [tag, setTag] = useState(collection.tag || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function syncWith(rawTag: string) {
    const t = rawTag.trim();
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/player?tag=${encodeURIComponent(t)}`);
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
    <section className="rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <h2 className="text-lg font-bold">
        <span style={{ color: "var(--accent-2)" }}>Step 1</span> · Sync your account
      </h2>
      <p className="mb-3 mt-1 text-sm" style={{ color: "var(--muted)" }}>
        Enter your player tag to pull your collection. Find it under your name in the game, like{" "}
        <span className="font-semibold" style={{ color: "var(--foreground)" }}>#2QABC9</span>. It is public, so no login
        is needed.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && syncWith(tag)}
            placeholder="#YourPlayerTag"
            aria-label="Clash Royale player tag"
            className="rounded-lg bg-[var(--background)] px-3 py-1.5 text-sm outline-none"
            style={{ border: "1px solid var(--border)", minWidth: 160 }}
          />
          <button
            onClick={() => syncWith(tag)}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-bold transition disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {loading ? "Syncing…" : "Sync account"}
          </button>
        </div>
        <button
          onClick={() => {
            setTag(SAMPLE_TAG);
            syncWith(SAMPLE_TAG);
          }}
          disabled={loading}
          className="text-xs underline disabled:opacity-50"
          style={{ color: "var(--muted)" }}
        >
          Don&apos;t play? Try a sample account
        </button>
      </div>

      {collection.syncedAt && collection.name && (
        <span className="mt-3 block text-sm" style={{ color: "var(--muted)" }}>
          Synced <strong style={{ color: "var(--foreground)" }}>{collection.name}</strong>
          {collection.trophies != null ? ` · ${collection.trophies} 🏆` : ""}
          {collection.arena != null ? ` · Arena ${collection.arena}` : ""}
          {collection.experienceLevel != null ? ` · Exp ${collection.experienceLevel}` : ""}
        </span>
      )}
      {error && (
        <p className="mt-2 text-sm" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}
      <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
        Stored only in this browser. You can also skip syncing and add cards by hand below.
      </p>
    </section>
  );
}
