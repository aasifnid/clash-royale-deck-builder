import type { ReactEventHandler } from "react";

/** RoyaleAPI's community CDN mirrors card art by slug. Used as a fallback when Supercell's
 *  official asset CDN doesn't host a card's art yet — which happens for just-released cards
 *  (the /cards API returns an art URL before the image itself is live). */
export function fallbackCardArt(key: string): string {
  return `https://cdn.royaleapi.com/static/img/cards/${key}.png`;
}

// Card art is loaded from Supercell's asset CDN. On mobile, with ~120 images requested at once,
// some requests drop and the browser never retries, leaving blank cards. This re-fires a failed
// image up to a couple times with a short backoff, then — if the element carries a data-fallback
// URL — switches to that (the RoyaleAPI CDN) to cover art the official CDN never serves.
export const retryImageOnError: ReactEventHandler<HTMLImageElement> = (e) => {
  const img = e.currentTarget;
  const tries = Number(img.dataset.tries ?? "0");
  const fallback = img.dataset.fallback;

  // After a couple of same-URL retries (for transient mobile drops), fall back to the CDN mirror.
  if (fallback && img.src !== fallback && tries >= 2) {
    img.dataset.tries = String(tries + 1);
    img.src = fallback;
    return;
  }

  if (tries >= 3) return;
  img.dataset.tries = String(tries + 1);
  const src = img.src;
  img.src = ""; // clearing then restoring forces the browser to re-request
  window.setTimeout(() => {
    img.src = src;
  }, 600 * (tries + 1));
};
