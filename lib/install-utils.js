const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MANIFEST_FILE = '.ag-skills.json';

// Deterministic content hash of a skill directory (relative paths + file bytes).
function hashSkillDir(dirPath) {
  const hash = crypto.createHash('sha256');
  const walk = (current) => {
    const entries = fs.readdirSync(current).sort();
    for (const entry of entries) {
      const full = path.join(current, entry);
      const stat = fs.statSync(full);
      const rel = path.relative(dirPath, full).split(path.sep).join('/');
      if (stat.isDirectory()) {
        walk(full);
      } else if (stat.isFile()) {
        hash.update(rel);
        hash.update('\0');
        hash.update(fs.readFileSync(full));
        hash.update('\0');
      }
    }
  };
  walk(dirPath);
  return hash.digest('hex');
}

function manifestPath(targetDir) {
  return path.join(targetDir, MANIFEST_FILE);
}

function loadManifest(targetDir) {
  const file = manifestPath(targetDir);
  if (!fs.existsSync(file)) {
    return { version: 1, skills: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && parsed.skills && typeof parsed.skills === 'object') {
      return { version: 1, ...parsed };
    }
  } catch (err) {
    // Corrupt manifest: fall through to a fresh one; install/update will rewrite it.
  }
  return { version: 1, skills: {} };
}

function saveManifest(targetDir, manifest) {
  fs.writeFileSync(manifestPath(targetDir), `${JSON.stringify(manifest, null, 2)}\n`);
}

function recordInstall(manifest, skillId, hash, source) {
  manifest.skills[skillId] = {
    hash,
    source: source || 'vault',
    installedAt: new Date().toISOString(),
  };
}

function removeRecord(manifest, skillId) {
  delete manifest.skills[skillId];
}

module.exports = {
  MANIFEST_FILE,
  hashSkillDir,
  loadManifest,
  manifestPath,
  recordInstall,
  removeRecord,
  saveManifest,
};
