const fs = require('fs');
const path = require('path');

function pageSource(file) {
  const html = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);
  const base = path.basename(file, '.html');
  let extra = '';
  for (const ext of ['.js', '.css']) {
    const sibling = path.join(dir, base + ext);
    if (fs.existsSync(sibling)) extra += '\n' + fs.readFileSync(sibling, 'utf8');
  }
  return html + extra;
}

module.exports = { pageSource };
