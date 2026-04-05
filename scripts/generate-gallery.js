const fs = require('fs');
const path = require('path');

const ASSETS_ROOT = path.resolve(__dirname, '../public/assets/api');

// ✅ hanya gambar
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function slugify(name) {
  return name.replace(/^\d+_/, '').trim();
}

function parseFilename(filename, region, site) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const parts = base.split(/_+/).filter(Boolean);

  let species = parts[0] || 'Unknown';
  let photographer = parts[parts.length - 1] || 'Unknown';

  return {
    species,
    photographer,
    location: `${slugify(site)} • ${slugify(region)}`
  };
}

function scan() {
  const result = [];

  if (!fs.existsSync(ASSETS_ROOT)) return result;

  const regions = fs.readdirSync(ASSETS_ROOT);

  for (const region of regions) {
    const regionPath = path.join(ASSETS_ROOT, region);
    if (!fs.statSync(regionPath).isDirectory()) continue;

    const sites = fs.readdirSync(regionPath);

    for (const site of sites) {
      const sitePath = path.join(regionPath, site);
      if (!fs.statSync(sitePath).isDirectory()) continue;

      const files = fs.readdirSync(sitePath);

      const fileItems = files
        .filter(f => {
          const ext = path.extname(f).toLowerCase();
          return IMAGE_EXT.has(ext);
        })
        .map(f => ({
          url: `/assets/api/${region}/${site}/${f}`,
          filename: f,
          type: 'image',
          metadata: parseFilename(f, region, site)
        }));

      // ✅ skip kalau kosong
      if (fileItems.length === 0) continue;

      result.push({
        region: slugify(region),
        site: slugify(site),
        files: fileItems
      });
    }
  }

  return result;
}

const output = scan();

fs.writeFileSync(
  path.resolve(__dirname, '../public/gallery.json'),
  JSON.stringify(output, null, 2)
);

console.log(`✅ gallery.json generated (${output.length} sites)`);