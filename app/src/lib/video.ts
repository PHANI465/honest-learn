/**
 * YouTube's privacy-enhanced domain doesn't set tracking cookies until play.
 * rel=0 limits suggestions at the end to the same channel; we only use videos a reviewer has checked
 * (made-for-kids status, embeddable) with scripts/check-videos.mjs.
 */
export function embedUrl(videoId: string): string {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error("invalid video id");
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1&iv_load_policy=3`;
}
