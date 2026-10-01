// Fingerprint of everything in assets/quest/. The service worker names its art
// cache after it, so phones drop stale art whenever any file changes.
// Usage: node tools/art-hash.js  -> prints the 8-char hash for sw.js (ART constant).
const fs = require("fs"), path = require("path"), crypto = require("crypto");
function artHash(dir = path.join(__dirname, "..", "assets", "quest")) {
  const h = crypto.createHash("sha1");
  for (const f of fs.readdirSync(dir).sort()) { h.update(f + "\0"); h.update(fs.readFileSync(path.join(dir, f))); }
  return h.digest("hex").slice(0, 8);
}
if (require.main === module) console.log(artHash());
module.exports = { artHash };
