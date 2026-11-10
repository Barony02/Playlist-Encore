// Limpa titulos "sujos" do YouTube e tenta separar artista e musica.

const BRACKET_NOISE =
  /[(\[]\s*(?:official|oficial|lyric|lyrics|letra|audio|áudio|video|vídeo|music video|visuali[sz]er|hd|hq|4k|remaster(?:ed)?|clipe)\b[^)\]]*[)\]]/gi;

const LOOSE_NOISE =
  /\b(?:official\s+(?:music\s+)?(?:video|audio)|lyric\s+video|v[ií]deo\s+oficial|clipe\s+oficial)\b/gi;

export function cleanTitle(s = "") {
  return s
    .replace(BRACKET_NOISE, "")
    .replace(LOOSE_NOISE, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s\-–—|]+$/, "")
    .trim();
}

export function cleanChannel(s = "") {
  return s
    .replace(/\s*-\s*topic$/i, "")
    .replace(/vevo$/i, "")
    .replace(/\s*official$/i, "")
    .trim();
}

export function splitArtistTitle(rawTitle, channel = "") {
  const cleaned = cleanTitle(rawTitle);
  const m = cleaned.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { artist: cleanChannel(channel), title: cleaned };
}
