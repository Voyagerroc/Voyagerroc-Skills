const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function parseFrontmatter(content) {
  const sanitized = content.replace(/^\uFEFF/, '');
  const lines = sanitized.split(/\r?\n/);
  if (!lines.length || lines[0].trim() !== '---') {
    return { data: {}, body: content, errors: [], hasFrontmatter: false };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return {
      data: {},
      body: content,
      errors: ['Missing closing frontmatter delimiter (---).'],
      hasFrontmatter: true,
    };
  }

  const errors = [];
  const fmText = lines.slice(1, endIndex).join('\n');
  let data = {};

  try {
    const doc = yaml.parseDocument(fmText, { prettyErrors: false });
    if (doc.errors && doc.errors.length) {
      errors.push(...doc.errors.map(error => error.message));
    }
    data = doc.toJS();
  } catch (err) {
    errors.push(err.message);
    data = {};
  }

  if (!isPlainObject(data)) {
    errors.push('Frontmatter must be a YAML mapping/object.');
    data = {};
  }

  const body = lines.slice(endIndex + 1).join('\n');
  return { data, body, errors, hasFrontmatter: true };
}

function tokenize(value) {
  if (!value) return [];
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map(token => token.trim())
    .filter(Boolean);
}

function unique(list) {
  const seen = new Set();
  const result = [];
  for (const item of list) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

function readSkill(skillDir, skillId) {
  const skillPath = path.join(skillDir, skillId, 'SKILL.md');
  let content;
  try {
    content = fs.readFileSync(skillPath, 'utf8');
  } catch (err) {
    return {
      id: skillId,
      name: skillId,
      description: '',
      tags: [],
      path: skillPath,
      content: '',
      errors: [`Failed to read SKILL.md: ${err.message}`],
      missing: true,
    };
  }

  const { data, errors } = parseFrontmatter(content);
  const name = typeof data.name === 'string' && data.name.trim()
    ? data.name.trim()
    : skillId;
  const description = typeof data.description === 'string'
    ? data.description.trim()
    : '';

  let tags = [];
  if (Array.isArray(data.tags)) {
    tags = data.tags.map(tag => String(tag).trim());
  } else if (typeof data.tags === 'string' && data.tags.trim()) {
    const parts = data.tags.includes(',')
      ? data.tags.split(',')
      : data.tags.split(/\s+/);
    tags = parts.map(tag => tag.trim());
  } else if (isPlainObject(data.metadata) && data.metadata.tags) {
    const rawTags = data.metadata.tags;
    if (Array.isArray(rawTags)) {
      tags = rawTags.map(tag => String(tag).trim());
    } else if (typeof rawTags === 'string' && rawTags.trim()) {
      const parts = rawTags.includes(',')
        ? rawTags.split(',')
        : rawTags.split(/\s+/);
      tags = parts.map(tag => tag.trim());
    }
  }

  tags = tags.filter(Boolean);

  return {
    id: skillId,
    name,
    description,
    tags,
    path: skillPath,
    content,
    errors: errors || [],
    missing: false,
  };
}

function listSkillIds(skillsDir) {
  return fs.readdirSync(skillsDir)
    .filter(entry => {
      if (entry.startsWith('.')) return false;
      const dir = path.join(skillsDir, entry);
      if (!fs.statSync(dir).isDirectory()) return false;
      return fs.existsSync(path.join(dir, 'SKILL.md'));
    })
    .sort();
}

function levenshtein(a, b) {
  const s = String(a);
  const t = String(b);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i += 1) {
    const curr = [i];
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[t.length];
}

// Suggest the closest candidates to `input` (edit distance and substring match).
function suggestSimilar(input, candidates, limit = 3) {
  const query = String(input || '').toLowerCase();
  if (!query) return [];

  const threshold = Math.max(2, Math.floor(query.length * 0.4));
  const scored = [];
  for (const candidate of candidates) {
    const lower = String(candidate).toLowerCase();
    // Distance to the whole id, or to its closest hyphen-separated token
    // (so "kubernets" still suggests "kubernetes-architect").
    let distance = levenshtein(query, lower);
    for (const token of lower.split('-')) {
      if (token) distance = Math.min(distance, levenshtein(query, token) + 1);
    }
    const contains = lower.includes(query) || query.includes(lower);
    if (contains || distance <= threshold) {
      scored.push({ candidate, distance: contains ? Math.min(distance, 1) : distance });
    }
  }

  return scored
    .sort((a, b) => a.distance - b.distance || String(a.candidate).localeCompare(String(b.candidate)))
    .slice(0, limit)
    .map(entry => entry.candidate);
}

module.exports = {
  listSkillIds,
  levenshtein,
  parseFrontmatter,
  readSkill,
  suggestSimilar,
  tokenize,
  unique,
};
