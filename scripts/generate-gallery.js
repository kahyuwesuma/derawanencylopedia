const fs = require('fs');
const path = require('path');

const ASSETS_ROOT = path.resolve(__dirname, '../public/assets');

function slugify(name) {
  return name.replace(/^\d+_/, '').trim();
}

function parseFilename(filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const parts = base.split(/_+/);

  return {
    species: parts[0] || '',
    photographer: parts[parts.length - 1] || ''
  };
}

function scan() {
  const result = [];

  const regions = fs.readdirSync(ASSETS_ROOT);

  for (const region of regions) {
    const regionPath = path.join(ASSETS_ROOT, region);
    if (!fs.statSync(regionPath).isDirectory()) continue;

    const sites = fs.readdirSync(regionPath);

    for (const site of sites) {
      const sitePath = path.join(regionPath, site);
      if (!fs.statSync(sitePath).isDirectory()) continue;

      const files = fs.readdirSync(sitePath);

      const fileItems = files.map(f => ({
        url: `/assets/${region}/${site}/${f}`,
        filename: f,
        metadata: parseFilename(f)
      }));

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

console.log('✅ gallery.json generated');