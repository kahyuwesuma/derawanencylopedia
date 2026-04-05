'use strict';

/**
 * DERAWAN ENCYCLOPEDIA — GALLERY API SERVER v2
 * Express backend that dynamically scans the assets folder structure
 * and exposes a REST API consumed by the frontend gallery.
 *
 * Folder convention:
 *   assets/
 *     01_DIVE SITES MARATUA/
 *       01_Channel/
 *         Chevron barracuda_channel_maratua_09_08_26_armindo.jpg
 *
 * File naming pattern (all parts optional except extension):
 *   [species][_detail][_site][_region][_DD][_MM][_YY][_photographer].[ext]
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

/* ─── CONFIG ──────────────────────────────────────────── */
const ASSETS_ROOT = path.resolve(__dirname, 'assets/api');
const SUPPORTED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.avi']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.avi']);

/* ─── CACHE ──────────────────────────────────────────── */
let galleryCache = null;
let cacheTime = 0;
const CACHE_TTL = 30_000; // 30 s

/* ─── FILE-NAME PARSER ────────────────────────────────── */
/**
 * Parse a filename like:
 *   "Chevron barracuda_channel_maratua_09_08_26_armindo.jpg"
 * into structured metadata.
 *
 * Strategy:
 *   1. Strip extension
 *   2. Split on underscore(s)
 *   3. Detect date segments (pure numbers: DD MM YY pattern)
 *   4. Detect photographer (last alpha segment after date)
 *   5. First segment = species
 *   6. Middle segments = site / location tokens
 */
function parseFilename(filename, regionHint, siteHint) {
  const ext = path.extname(filename).toLowerCase();
  const base = path.basename(filename, ext);

  // Normalise: collapse multiple underscores, trim
  const parts = base.split(/_+/).map(s => s.trim()).filter(Boolean);

  let species = '';
  let siteParts = [];
  let dateParts = [];
  let photographer = '';

  // Scan from right: look for date cluster (DD MM YY or YYYY) then photographer
  let i = parts.length - 1;

  // Photographer: last non-numeric segment (after date)
  if (i >= 0 && !/^\d+$/.test(parts[i])) {
    photographer = parts[i];
    i--;
  }

  // Date: up to 3 consecutive numeric segments
  const dateBuf = [];
  while (i >= 0 && /^\d{1,4}$/.test(parts[i]) && dateBuf.length < 3) {
    dateBuf.unshift(parts[i]);
    i--;
  }
  dateParts = dateBuf;

  // Species: first segment(s) before site tokens
  // Simple heuristic: species = first token (may contain spaces if pre-split)
  if (i >= 0) {
    species = parts[0];
    siteParts = parts.slice(1, i + 1);
  }

  // Build date string
  let dateStr = '';
  if (dateParts.length === 3) {
    const [d, m, y] = dateParts;
    const year = y.length === 2 ? '20' + y : y;
    dateStr = `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${year}`;
  } else if (dateParts.length === 1) {
    dateStr = dateParts[0];
  }

  // Capitalise helper
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';

  // Merge site from parse + folder hints
  const siteFromFile = siteParts.map(cap).join(' ');
  const location = [
    siteFromFile || cap(siteHint),
    cap(regionHint)
  ].filter(Boolean).join(' · ');

  return {
    species: cap(species) || 'Unknown',
    location: location || regionHint || '',
    date: dateStr || '',
    photographer: cap(photographer) || 'Unknown',
  };
}

/* ─── FOLDER SCANNER ──────────────────────────────────── */
/**
 * Recursively scan ASSETS_ROOT.
 * Level 1 dirs  → regions  (strips leading "NN_")
 * Level 2 dirs  → dive sites (strips leading "NN_")
 * Files inside  → gallery items
 */
function slugify(name) {
  // Remove leading "01_" numbering prefix
  return name.replace(/^\d+_/, '').trim();
}

function scanAssets() {
  const results = [];

  if (!fs.existsSync(ASSETS_ROOT)) return results;

  const regionDirs = fs.readdirSync(ASSETS_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const regionEntry of regionDirs) {
    const regionName = slugify(regionEntry.name);
    const regionPath = path.join(ASSETS_ROOT, regionEntry.name);

    const siteDirs = fs.readdirSync(regionPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const siteEntry of siteDirs) {
      const siteName = slugify(siteEntry.name);
      const sitePath = path.join(regionPath, siteEntry.name);

      let files;
      try {
        files = fs.readdirSync(sitePath, { withFileTypes: true });
      } catch { continue; }

      const fileItems = [];

      for (const fileEntry of files) {
        if (!fileEntry.isFile()) continue;
        const ext = path.extname(fileEntry.name).toLowerCase();
        if (!SUPPORTED_EXT.has(ext)) continue;

        const isVideo = VIDEO_EXT.has(ext);
        const metadata = parseFilename(fileEntry.name, regionName, siteName);

        // Build URL relative to server root (served as static)
        const relPath = path.join(
          regionEntry.name,
          siteEntry.name,
          fileEntry.name
        ).replace(/\\/g, '/');

        fileItems.push({
          filename: fileEntry.name,
          url: '/' + relPath,
          type: isVideo ? 'video' : 'image',
          metadata,
        });
      }

      if (fileItems.length > 0) {
        results.push({
          region: regionName,
          regionRaw: regionEntry.name,
          site: siteName,
          siteRaw: siteEntry.name,
          files: fileItems,
        });
      }
    }
  }

  return results;
}

/* ─── CACHE MANAGEMENT ────────────────────────────────── */
function getGallery() {
  const now = Date.now();
  if (galleryCache && (now - cacheTime) < CACHE_TTL) return galleryCache;
  galleryCache = scanAssets();
  cacheTime = now;
  return galleryCache;
}

function invalidateCache() {
  galleryCache = null;
  console.log('[gallery] cache invalidated — rescanning on next request');
}

/* ─── CHOKIDAR FILE WATCHER ──────────────────────────── */
if (fs.existsSync(ASSETS_ROOT)) {
  const watcher = chokidar.watch(ASSETS_ROOT, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 },
  });
  watcher.on('add', invalidateCache);
  watcher.on('unlink', invalidateCache);
  watcher.on('addDir', invalidateCache);
  watcher.on('unlinkDir', invalidateCache);
  console.log(`[gallery] watching ${ASSETS_ROOT} for changes…`);
}

/* ─── MIDDLEWARE ──────────────────────────────────────── */
app.use(cors());
app.use(express.json());

// Serve static assets (images/videos)
app.use('/assets', express.static(path.join(__dirname, 'assets/api'), {
  maxAge: '1h',
  etag: true,
}));

// Serve the HTML gallery page
app.use(express.static(__dirname));

/* ─── ROUTES ──────────────────────────────────────────── */

/**
 * GET /api/gallery
 * Returns full gallery data.
 * Query params:
 *   ?region=Maratua        — filter by region (case-insensitive)
 *   ?site=Channel          — filter by site
 *   ?type=image|video      — filter by file type
 *   ?search=barracuda      — search species/location/photographer
 */
app.get('/api/gallery', (req, res) => {
  try {
    let data = getGallery();
    const { region, site, type, search } = req.query;

    if (region) {
      data = data.filter(d => d.region.toLowerCase().includes(region.toLowerCase()));
    }
    if (site) {
      data = data.filter(d => d.site.toLowerCase().includes(site.toLowerCase()));
    }
    if (type) {
      data = data.map(d => ({ ...d, files: d.files.filter(f => f.type === type) }))
        .filter(d => d.files.length > 0);
    }
    if (search) {
      const q = search.toLowerCase();
      data = data.map(d => ({
        ...d,
        files: d.files.filter(f =>
          f.metadata.species.toLowerCase().includes(q) ||
          f.metadata.location.toLowerCase().includes(q) ||
          f.metadata.photographer.toLowerCase().includes(q) ||
          f.filename.toLowerCase().includes(q)
        )
      })).filter(d => d.files.length > 0);
    }

    res.json(data);
  } catch (err) {
    console.error('[api/gallery]', err);
    res.status(500).json({ error: 'Failed to scan gallery', detail: err.message });
  }
});

/**
 * GET /api/gallery/meta
 * Returns available regions, sites, and stats — useful for filter UI
 */
app.get('/api/gallery/meta', (req, res) => {
  try {
    const data = getGallery();
    const regions = [...new Set(data.map(d => d.region))].sort();
    const sites = [...new Set(data.map(d => d.site))].sort();
    const total = data.reduce((n, d) => n + d.files.length, 0);
    const images = data.reduce((n, d) => n + d.files.filter(f => f.type === 'image').length, 0);
    const videos = data.reduce((n, d) => n + d.files.filter(f => f.type === 'video').length, 0);
    res.json({ regions, sites, total, images, videos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/gallery/refresh
 * Force cache invalidation (webhook-friendly)
 */
app.post('/api/gallery/refresh', (req, res) => {
  invalidateCache();
  res.json({ ok: true, message: 'Cache cleared — next request will rescan.' });
});

/* ─── START ──────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\n  ┌─────────────────────────────────────────┐`);
  console.log(`  │  DERAWAN GALLERY API                    │`);
  console.log(`  │  http://localhost:${PORT}                  │`);
  console.log(`  │  API:  http://localhost:${PORT}/api/gallery │`);
  console.log(`  └─────────────────────────────────────────┘\n`);
});

module.exports = app;
