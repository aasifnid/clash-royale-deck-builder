import type { ReactEventHandler } from "react";

// Card art is loaded from Supercell's asset CDN. On mobile, with ~120 images requested at once,
// some requests drop and the browser never retries, leaving blank cards. This re-fires a failed
// image up to a couple times with a short backoff.
export const retryImageOnError: ReactEventHandler<HTMLImageElement> = (e) => {
  const img = e.currentTarget;
  const tries = Number(img.dataset.tries ?? "0");
  if (tries >= 3) return;
  img.dataset.tries = String(tries + 1);
  const src = img.src;
  img.src = ""; // clearing then restoring forces the browser to re-request
  window.setTimeout(() => {
    img.src = src;
  }, 600 * (tries + 1));
};
