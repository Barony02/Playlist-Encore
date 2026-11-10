import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "./errors.js";
import * as youtube from "./providers/youtube.js";
import * as apple from "./providers/apple.js";
import * as spotify from "./providers/spotify.js";
import { itemsFromCsv } from "./providers/csv.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const providers = { youtube, apple, spotify };

function detect(input) {
  if (/^spotify:playlist:/i.test(input)) return "spotify";
  let host;
  try {
    host = new URL(input).hostname;
  } catch {
    return null;
  }
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return "youtube";
  if (/(^|\.)music\.apple\.com$/.test(host)) return "apple";
  if (/(^|\.)spotify\.com$/.test(host)) return "spotify";
  return null;
}

function sendError(res, e) {
  if (e instanceof AppError) {
    return res.status(e.status).json({ error: e.message, code: e.code });
  }
  console.error(e);
  res.status(500).json({ error: "Algo deu errado no servidor. Veja o terminal para detalhes." });
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (_req, res) => {
  res.json({
    youtube: youtube.isConfigured(),
    apple: apple.isConfigured(),
    spotify: { configured: spotify.isConfigured(), loggedIn: spotify.isLoggedIn() },
  });
});

app.get("/api/playlist", async (req, res) => {
  const input = String(req.query.url || "").trim();
  if (!input) return res.status(400).json({ error: "Cole o link de uma playlist." });

  const provider = detect(input);
  if (!provider) {
    return res
      .status(400)
      .json({ error: "Link não reconhecido. Use um link de playlist do YouTube, Spotify ou Apple Music." });
  }

  try {
    const result = await providers[provider].listItems(input);
    res.json({ provider, ...result });
  } catch (e) {
    sendError(res, e);
  }
});

app.post("/api/csv", express.text({ type: "*/*", limit: "5mb" }), (req, res) => {
  try {
    const result = itemsFromCsv(String(req.body || ""));
    res.json({ provider: "csv", ...result });
  } catch (e) {
    sendError(res, e);
  }
});

app.get("/auth/spotify/login", (_req, res) => {
  try {
    res.redirect(spotify.loginUrl());
  } catch (e) {
    sendError(res, e);
  }
});

app.get("/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error || !code) return res.redirect("/?spotify=erro");
  try {
    await spotify.handleCallback(String(code), String(state));
    res.redirect("/?spotify=ok");
  } catch (e) {
    console.error(e);
    res.redirect("/?spotify=erro");
  }
});

app.listen(PORT, () => {
  console.log(`Playlist Encore rodando em http://127.0.0.1:${PORT}`);
});
