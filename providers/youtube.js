import { AppError } from "../errors.js";
import { splitArtistTitle } from "./clean.js";

const API = "https://www.googleapis.com/youtube/v3";

export function isConfigured() {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

function getPlaylistId(url) {
  try {
    return new URL(url).searchParams.get("list");
  } catch {
    return null;
  }
}

async function call(endpoint, params) {
  const qs = new URLSearchParams({ ...params, key: process.env.YOUTUBE_API_KEY });
  const res = await fetch(`${API}/${endpoint}?${qs}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = data?.error?.errors?.[0]?.reason;
    if (reason === "playlistNotFound") {
      throw new AppError(404, "Playlist não encontrada. Ela precisa ser pública ou não listada.");
    }
    if (reason === "quotaExceeded") {
      throw new AppError(429, "A cota diária da API do YouTube acabou. Tente novamente amanhã.");
    }
    if (reason === "keyInvalid" || reason === "API_KEY_INVALID") {
      throw new AppError(500, "A chave da API do YouTube é inválida. Confira o arquivo .env.");
    }
    throw new AppError(502, `Erro na API do YouTube: ${data?.error?.message || res.status}`);
  }
  return data;
}

export async function listItems(url) {
  if (!isConfigured()) {
    throw new AppError(500, "Falta YOUTUBE_API_KEY no arquivo .env.", "NOT_CONFIGURED");
  }
  const playlistId = getPlaylistId(url);
  if (!playlistId) {
    throw new AppError(400, 'Esse link do YouTube não tem uma playlist (faltou o "list=" na URL).');
  }

  let name = null;
  try {
    const meta = await call("playlists", { part: "snippet", id: playlistId });
    name = meta.items?.[0]?.snippet?.title ?? null;
  } catch {
    // o nome é opcional
  }

  const items = [];
  let pageToken = "";
  do {
    const data = await call("playlistItems", {
      part: "snippet",
      playlistId,
      maxResults: "50",
      ...(pageToken && { pageToken }),
    });

    for (const it of data.items ?? []) {
      const s = it.snippet;
      if (!s || s.title === "Deleted video" || s.title === "Private video") continue;
      const videoId = s.resourceId?.videoId;
      const { artist, title } = splitArtistTitle(s.title, s.videoOwnerChannelTitle);
      items.push({
        title,
        artist,
        raw: s.title,
        id: videoId,
        url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined,
      });
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return { name, items };
}
