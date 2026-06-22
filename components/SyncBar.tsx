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

  const synced = collection.syncedAt && collection.name;

  return (
    <section className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="grid items-stretch gap-6 md:grid-cols-2">
        {/* Left: the sync action */}
        <div>
          <h2 className="text-lg font-bold">
            <span style={{ color: "var(--accent-2)" }}>Step 1</span> · Sync your account
          </h2>
          <p className="mb-4 mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Enter your player tag to pull your collection. Find it under your name in the game, like{" "}
            <span className="font-semibold" style={{ color: "var(--foreground)" }}>#8PYQ2L0RVG</span>. It is public, so no
            login is needed.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && syncWith(tag)}
              placeholder="#YourPlayerTag"
              aria-label="Clash Royale player tag"
              className="rounded-lg bg-[var(--background)] px-3 py-2 text-sm outline-none"
              style={{ border: "1px solid var(--border)", minWidth: 150 }}
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
            className="mt-3 text-xs underline disabled:opacity-50"
            style={{ color: "var(--muted)" }}
          >
            Don&apos;t play? Try a sample account
          </button>
          {error && (
            <p className="mt-2 text-sm" style={{ color: "#f87171" }}>
              {error}
            </p>
          )}
          <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
            Stored only in this browser. You can also skip syncing and add cards by hand below.
          </p>
        </div>

        {/* Right: the fetched account, presented like an achievement panel */}
        <div
          className="flex flex-col justify-center rounded-xl p-5"
          style={{ background: "var(--background)", border: "1px solid var(--border)" }}
        >
          {synced ? (
            <>
              <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
                Account synced
              </div>
              <div className="mt-1 text-2xl font-extrabold leading-tight" style={{ color: "var(--foreground)" }}>
                {collection.name}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  { label: "Trophies", value: collection.trophies != null ? `${collection.trophies} 🏆` : "—" },
                  { label: "Arena", value: collection.arena != null ? collection.arena : "—" },
                  { label: "Exp level", value: collection.experienceLevel != null ? collection.experienceLevel : "—" },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-lg px-2 py-2 text-center"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                      {s.label}
                    </div>
                    <div className="mt-0.5 text-base font-extrabold" style={{ color: "var(--accent-2)" }}>
                      {s.value}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center text-sm" style={{ color: "var(--muted)" }}>
              Your account details will appear here once you sync.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
