#!/usr/bin/env node

const { Command } = require('commander');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const os = require('os');
const readline = require('readline');
const { listSkillIds, readSkill, suggestSimilar, tokenize, unique } = require('../lib/skill-utils');
const {
  MANIFEST_FILE,
  hashSkillDir,
  loadManifest,
  recordInstall,
  removeRecord,
  saveManifest,
} = require('../lib/install-utils');
const { version } = require('../package.json');

const program = new Command();

// Resolve paths
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const SKILLS_SOURCE_DIR = path.join(PACKAGE_ROOT, 'skills');
const CATALOG_PATH = path.join(PACKAGE_ROOT, 'catalog.json');
const BUNDLES_PATH = path.join(PACKAGE_ROOT, 'bundles.json');
const ALIASES_PATH = path.join(PACKAGE_ROOT, 'aliases.json');

// Supported install platforms. Skills use the same SKILL.md format on both;
// only the install destination differs.
const PLATFORMS = {
  antigravity: {
    label: 'Antigravity',
    globalDir: path.join(os.homedir(), '.gemini', 'antigravity', 'skills'),
    localDir: path.join(process.cwd(), '.agent', 'skills'),
  },
  claude: {
    label: 'Claude Code',
    globalDir: path.join(os.homedir(), '.claude', 'skills'),
    localDir: path.join(process.cwd(), '.claude', 'skills'),
  },
};

// Kept for backward compatibility with existing scripts/tests.
const GLOBAL_SKILLS_DIR = PLATFORMS.antigravity.globalDir;
const LOCAL_SKILLS_DIR = PLATFORMS.antigravity.localDir;

// Allow overriding the install location for both scopes via an env var.
// The override is a destination only; the skill source stays guarded under SKILLS_SOURCE_DIR.
function resolveTargetDir(global, platform = 'antigravity') {
  if (process.env.AG_SKILLS_DIR) {
    const raw = process.env.AG_SKILLS_DIR.replace(/^~(?=$|[/\\])/, os.homedir());
    return path.resolve(raw);
  }
  const config = PLATFORMS[platform] || PLATFORMS.antigravity;
  return global ? config.globalDir : config.localDir;
}

function platformFromOptions(options) {
  return options && options.claude ? 'claude' : 'antigravity';
}

function platformLabel(platform) {
  return (PLATFORMS[platform] || PLATFORMS.antigravity).label;
}

function scopeLabel(options, platform) {
  if (process.env.AG_SKILLS_DIR) return 'AG_SKILLS_DIR override';
  return `${options && options.global ? 'Global' : 'Local'}, ${platformLabel(platform)}`;
}

program
  .name('ag-skills')
  .description('Manage Antigravity & Claude Code Skills')
  .version(version);

function loadJson(filePath, label) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    if (label) {
      console.warn(chalk.yellow(`Warning: ${label} is present but could not be parsed (${err.message}).`));
    }
    return null;
  }
}

function loadCatalog() {
  // No label: a corrupt catalog.json already warns via the _fallback path below; avoid a double warning.
  const catalog = loadJson(CATALOG_PATH);
  if (catalog && Array.isArray(catalog.skills)) {
    return catalog;
  }

  const skillIds = listSkillIds(SKILLS_SOURCE_DIR);
  const skills = skillIds.map(skillId => {
    const skill = readSkill(SKILLS_SOURCE_DIR, skillId);
    const tags = unique([...(skill.tags || []), ...tokenize(skillId)]);
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      tags,
      category: 'general',
    };
  });

  return {
    skills,
    total: skills.length,
    _fallback: true,
  };
}

function loadBundles() {
  const bundles = loadJson(BUNDLES_PATH, 'bundles.json');
  if (bundles && bundles.bundles) return bundles;
  return { bundles: {}, common: [] };
}

function loadAliases() {
  const aliases = loadJson(ALIASES_PATH, 'aliases.json');
  if (aliases && aliases.aliases) return aliases.aliases;
  return {};
}

// Reverse alias map: skill id -> [aliases]
function aliasesBySkill(aliases) {
  const map = new Map();
  for (const [alias, skillId] of Object.entries(aliases)) {
    if (!map.has(skillId)) map.set(skillId, []);
    map.get(skillId).push(alias);
  }
  return map;
}

function sanitizeSkillId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || !/^[a-z0-9-]+$/.test(normalized)) return null;
  return normalized;
}

function resolveSkillId(input, aliases) {
  const sanitized = sanitizeSkillId(input);
  if (!sanitized) return null;
  return aliases[sanitized] || sanitized;
}

function resolveSkillPath(skillId) {
  const resolved = path.resolve(SKILLS_SOURCE_DIR, skillId);
  if (!resolved.startsWith(SKILLS_SOURCE_DIR + path.sep)) return null;
  return resolved;
}

function truncate(value, limit) {
  if (!value) return '';
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 3)}...`;
}

function scoreSkill(skill, query, queryTokens) {
  const aliasText = (skill.aliases || []).join(' ');
  const haystack = `${skill.id} ${skill.name || ''} ${skill.description || ''} ${(skill.tags || []).join(' ')} ${(skill.triggers || []).join(' ')} ${aliasText}`.toLowerCase();
  let score = haystack.includes(query) ? 5 : 0;

  for (const token of queryTokens) {
    if (skill.id.toLowerCase().includes(token)) score += 3;
    if (aliasText.toLowerCase().includes(token)) score += 2;
    if (haystack.includes(token)) score += 2;
  }

  return score;
}

function collectOption(value, previous) {
  const items = Array.isArray(previous) ? previous : [];
  const parts = String(value)
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  return items.concat(parts);
}

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return 20;
  return parsed;
}

function checkDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return { exists: false, isDir: false, writable: false };
  }

  try {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return { exists: true, isDir: false, writable: false };
    }
    fs.accessSync(dirPath, fs.constants.W_OK);
    return { exists: true, isDir: true, writable: true };
  } catch (err) {
    return { exists: true, isDir: true, writable: false };
  }
}

// Print a "did you mean" hint for a skill name that could not be resolved.
function printSuggestions(input, aliases) {
  const candidates = [...listSkillIds(SKILLS_SOURCE_DIR), ...Object.keys(aliases || {})];
  const suggestions = suggestSimilar(String(input || '').toLowerCase(), candidates);
  if (suggestions.length) {
    console.log(chalk.gray(`Did you mean: ${suggestions.join(', ')}?`));
  }
}

function listInstalledIds(targetDir) {
  return fs.readdirSync(targetDir)
    .filter(entry => !entry.startsWith('.') && entry !== MANIFEST_FILE)
    .filter(entry => {
      try {
        return fs.statSync(path.join(targetDir, entry)).isDirectory();
      } catch (err) {
        return false;
      }
    })
    .sort();
}

async function copySkill(skillId, targetDir, manifest) {
  const sourcePath = resolveSkillPath(skillId);
  const destPath = path.join(targetDir, skillId);
  await fs.copy(sourcePath, destPath, { overwrite: true });
  recordInstall(manifest, skillId, hashSkillDir(sourcePath));
}

program
  .command('list')
  .description('List all available skills in the vault')
  .option('-c, --category <category>', 'Filter by category')
  .option('-t, --tag <tag>', 'Filter by tag (repeatable)', collectOption, [])
  .option('-j, --json', 'Output as JSON')
  .action((options) => {
    try {
      const catalog = loadCatalog();
      let skills = catalog.skills || [];

      if (options.category) {
        const wanted = options.category.toLowerCase().trim();
        skills = skills.filter(skill => (skill.category || 'general').toLowerCase() === wanted);
      }
      if (options.tag && options.tag.length) {
        const tagSet = new Set(options.tag.map(tag => tag.toLowerCase().trim()).filter(Boolean));
        skills = skills.filter(skill => (skill.tags || []).some(tag => tagSet.has(String(tag).toLowerCase())));
      }

      if (options.json) {
        console.log(JSON.stringify(skills.map(skill => ({
          id: skill.id,
          description: skill.description || '',
          category: skill.category || 'general',
          tags: skill.tags || [],
        })), null, 2));
        return;
      }

      if (!skills.length) {
        console.log(chalk.yellow('No skills match the given filters.'));
        return;
      }

      console.log(chalk.bold('\nAvailable Skills:\n'));
      skills.forEach(skill => {
        const category = skill.category && skill.category !== 'general' ? chalk.gray(` [${skill.category}]`) : '';
        console.log(`- ${chalk.cyan(skill.id)}${category}`);
      });
      console.log(chalk.green(`\nTotal: ${skills.length} skills`));
    } catch (err) {
      console.error(chalk.red('Error listing skills:'), err.message);
    }
  });

program
  .command('search <query>')
  .description('Search skills by name, description, tags, and aliases')
  .option('-l, --limit <number>', 'Limit results', parseLimit, 20)
  .option('-j, --json', 'Output as JSON')
  .action((query, options) => {
    const catalog = loadCatalog();
    const aliasMap = aliasesBySkill(loadAliases());
    const queryText = query.toLowerCase().trim();
    if (!queryText) {
      console.error(chalk.red('Error: Please provide a search query.'));
      process.exit(1);
    }

    if (catalog._fallback && !options.json) {
      console.warn(chalk.yellow('Warning: catalog.json not found; using fallback metadata.'));
    }

    const queryTokens = unique(tokenize(queryText));
    const results = (catalog.skills || [])
      .map(skill => ({
        skill: { ...skill, aliases: aliasMap.get(skill.id) || [] },
        score: scoreSkill({ ...skill, aliases: aliasMap.get(skill.id) || [] }, queryText, queryTokens),
      }))
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score || a.skill.id.localeCompare(b.skill.id))
      .slice(0, options.limit || 20);

    if (options.json) {
      console.log(JSON.stringify(results.map(result => ({
        id: result.skill.id,
        description: result.skill.description || '',
        category: result.skill.category || 'general',
        tags: result.skill.tags || [],
        aliases: result.skill.aliases,
        score: result.score,
      })), null, 2));
      return;
    }

    if (!results.length) {
      console.log(chalk.yellow('No matching skills found.'));
      printSuggestions(queryText, loadAliases());
      return;
    }

    console.log(chalk.bold(`\nSearch results (${results.length}):\n`));
    for (const result of results) {
      const description = truncate(result.skill.description || '', 100);
      const tags = (result.skill.tags || []).slice(0, 6).join(', ');
      console.log(`- ${chalk.cyan(result.skill.id)}${description ? ` - ${description}` : ''}`);
      if (tags) {
        console.log(`  ${chalk.gray(`tags: ${tags}`)}`);
      }
      if (result.skill.aliases.length) {
        console.log(`  ${chalk.gray(`alias: ${result.skill.aliases.join(', ')}`)}`);
      }
    }
  });

program
  .command('info <skillName>')
  .description('Show details of a skill without installing it')
  .option('-j, --json', 'Output as JSON')
  .action((skillName, options) => {
    const aliases = loadAliases();
    const resolved = resolveSkillId(skillName, aliases);
    if (!resolved) {
      console.error(chalk.red(`Invalid skill name: '${skillName}'`));
      process.exit(1);
    }

    const sourcePath = resolveSkillPath(resolved);
    if (!sourcePath || !fs.existsSync(path.join(sourcePath, 'SKILL.md'))) {
      console.error(chalk.red(`Skill '${resolved}' not found in vault.`));
      printSuggestions(resolved, aliases);
      process.exit(1);
    }

    const catalog = loadCatalog();
    const entry = (catalog.skills || []).find(skill => skill.id === resolved) || {};
    const skill = readSkill(SKILLS_SOURCE_DIR, resolved);
    const aliasMap = aliasesBySkill(aliases);
    const bundles = loadBundles();
    const inBundles = Object.entries(bundles.bundles || {})
      .filter(([, bundle]) => Array.isArray(bundle.skills) && bundle.skills.includes(resolved))
      .map(([name]) => name);
    const files = fs.readdirSync(sourcePath).sort();

    if (options.json) {
      console.log(JSON.stringify({
        id: resolved,
        name: skill.name,
        description: skill.description || entry.description || '',
        category: entry.category || 'general',
        tags: entry.tags || skill.tags || [],
        triggers: entry.triggers || [],
        aliases: aliasMap.get(resolved) || [],
        bundles: inBundles,
        files,
      }, null, 2));
      return;
    }

    console.log(chalk.bold(`\n${chalk.cyan(resolved)}\n`));
    if (skill.description || entry.description) {
      console.log(skill.description || entry.description);
      console.log('');
    }
    console.log(`Category: ${entry.category || 'general'}`);
    const tags = entry.tags || skill.tags || [];
    if (tags.length) console.log(`Tags: ${tags.join(', ')}`);
    if ((entry.triggers || []).length) console.log(`Triggers: ${entry.triggers.join(', ')}`);
    const skillAliases = aliasMap.get(resolved) || [];
    if (skillAliases.length) console.log(`Aliases: ${skillAliases.join(', ')}`);
    if (inBundles.length) console.log(`Bundles: ${inBundles.join(', ')}`);
    console.log(`Files: ${files.join(', ')}`);

    const body = skill.content.replace(/^---[\s\S]*?---\r?\n/, '');
    const previewLines = body.split(/\r?\n/).filter(line => line.trim()).slice(0, 12);
    if (previewLines.length) {
      console.log(chalk.bold('\nPreview:\n'));
      previewLines.forEach(line => console.log(chalk.gray(`  ${truncate(line, 110)}`)));
    }
    console.log('');
    console.log(chalk.gray(`Install with: ag-skills install ${resolved}`));
  });

program
  .command('bundles [bundleName]')
  .description('List curated bundles, or show the skills in one bundle')
  .option('-j, --json', 'Output as JSON')
  .action((bundleName, options) => {
    const data = loadBundles();
    const entries = Object.entries(data.bundles || {}).sort((a, b) => a[0].localeCompare(b[0]));

    if (!entries.length) {
      console.log(chalk.yellow('No bundles found. Run npm run build:catalog to generate them.'));
      return;
    }

    if (bundleName) {
      const key = bundleName.toLowerCase().trim();
      const bundle = data.bundles[key];
      if (!bundle) {
        console.error(chalk.red(`Bundle '${key}' not found.`));
        console.log(chalk.gray(`Available bundles: ${entries.map(([name]) => name).join(', ')}`));
        process.exit(1);
      }
      if (options.json) {
        console.log(JSON.stringify({ name: key, ...bundle }, null, 2));
        return;
      }
      console.log(chalk.bold(`\n${key}`) + chalk.gray(` (${(bundle.skills || []).length} skills)`));
      if (bundle.description) console.log(bundle.description);
      console.log('');
      (bundle.skills || []).forEach(skill => console.log(`- ${chalk.cyan(skill)}`));
      console.log('');
      console.log(chalk.gray(`Install with: ag-skills install --bundle ${key}`));
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    console.log(chalk.bold('\nAvailable Bundles:\n'));
    for (const [name, bundle] of entries) {
      console.log(`- ${chalk.cyan(name)} ${chalk.gray(`(${(bundle.skills || []).length} skills)`)}`);
      if (bundle.description) console.log(`  ${bundle.description}`);
    }
    if (data.common && data.common.length) {
      console.log('');
      console.log(chalk.bold('Curated common skills:'));
      console.log(`  ${data.common.join(', ')}`);
    }
    console.log('');
    console.log(chalk.gray('Show a bundle with: ag-skills bundles <name>'));
  });

// Interactive picker used when `install` is run with no selector on a TTY.
async function interactiveSelect(catalog, aliasMap) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (question) => new Promise(resolve => rl.question(question, resolve));

  try {
    const query = (await ask('Search skills: ')).toLowerCase().trim();
    if (!query) return [];

    const queryTokens = unique(tokenize(query));
    const results = (catalog.skills || [])
      .map(skill => ({
        skill,
        score: scoreSkill({ ...skill, aliases: aliasMap.get(skill.id) || [] }, query, queryTokens),
      }))
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score || a.skill.id.localeCompare(b.skill.id))
      .slice(0, 10);

    if (!results.length) {
      console.log(chalk.yellow('No matching skills found.'));
      return [];
    }

    console.log('');
    results.forEach((result, index) => {
      const description = truncate(result.skill.description || '', 80);
      console.log(`${chalk.bold(String(index + 1).padStart(2))}. ${chalk.cyan(result.skill.id)}${description ? ` - ${description}` : ''}`);
    });
    console.log('');

    const answer = (await ask('Select numbers to install (e.g. 1,3) or "a" for all listed: ')).trim().toLowerCase();
    if (!answer) return [];
    if (answer === 'a' || answer === 'all') return results.map(result => result.skill.id);

    const picked = new Set();
    for (const part of answer.split(/[\s,]+/)) {
      const index = Number.parseInt(part, 10);
      if (!Number.isNaN(index) && index >= 1 && index <= results.length) {
        picked.add(results[index - 1].skill.id);
      }
    }
    return Array.from(picked);
  } finally {
    rl.close();
  }
}

program
  .command('install [skillName]')
  .description('Install a skill to your workspace or globally')
  .option('-g, --global', 'Install to the global skills directory')
  .option('-c, --claude', 'Target Claude Code (~/.claude/skills or ./.claude/skills)')
  .option('-a, --all', 'Install ALL skills')
  .option('-t, --tag <tag>', 'Install skills by tag (repeatable)', collectOption, [])
  .option('-b, --bundle <bundle>', 'Install a curated bundle')
  .option('-f, --force', 'Overwrite skills that are already installed')
  .action(async (skillName, options) => {
    const platform = platformFromOptions(options);
    const targetDir = resolveTargetDir(options.global, platform);
    const aliases = loadAliases();
    const hasSkillName = typeof skillName === 'string' && skillName.trim().length > 0;
    const bundleName = options.bundle ? options.bundle.toLowerCase().trim() : '';
    const hasBundle = Boolean(bundleName);
    const hasTags = Array.isArray(options.tag) && options.tag.length > 0;
    const hasAll = Boolean(options.all);
    const selectedInputs = [hasSkillName, hasAll, hasBundle, hasTags].filter(Boolean);

    if (selectedInputs.length > 1) {
      console.error(chalk.red('Error: Choose only one of skill name, --all, --tag, or --bundle'));
      process.exit(1);
    }

    try {
      let skillsToInstall = [];

      if (selectedInputs.length === 0) {
        if (process.stdin.isTTY && process.stdout.isTTY) {
          skillsToInstall = await interactiveSelect(loadCatalog(), aliasesBySkill(aliases));
          if (!skillsToInstall.length) {
            console.log(chalk.yellow('Nothing selected.'));
            return;
          }
        } else {
          console.error(chalk.red('Error: Please specify a skill name or use --all/--tag/--bundle'));
          process.exit(1);
        }
      }

      await fs.ensureDir(targetDir);
      console.log(chalk.gray(`Target: ${targetDir} (${scopeLabel(options, platform)})`));

      if (hasAll) {
        console.warn(chalk.yellow('Warning: Installing all skills increases token usage and activation noise.'));
        skillsToInstall = listSkillIds(SKILLS_SOURCE_DIR);
      } else if (hasBundle) {
        const bundles = loadBundles();
        const bundle = bundles.bundles[bundleName];
        if (!bundle) {
          console.error(chalk.red(`Bundle '${bundleName}' not found.`));
          const available = Object.keys(bundles.bundles).sort();
          if (available.length) {
            console.log(chalk.gray(`Available bundles: ${available.join(', ')}`));
          } else {
            console.log(chalk.gray('Run npm run build:catalog to generate bundles.'));
          }
          process.exit(1);
        }
        if (!Array.isArray(bundle.skills) || bundle.skills.length === 0) {
          console.error(chalk.red(`Bundle '${bundleName}' has no skills.`));
          process.exit(1);
        }
        skillsToInstall = bundle.skills;
      } else if (hasTags) {
        const catalog = loadCatalog();
        const tagSet = new Set(options.tag.map(tag => tag.toLowerCase().trim()).filter(Boolean));
        skillsToInstall = (catalog.skills || [])
          .filter(skill => (skill.tags || []).some(tag => tagSet.has(String(tag).toLowerCase())))
          .map(skill => skill.id);

        if (!skillsToInstall.length) {
          console.error(chalk.red(`No skills found for tags: ${Array.from(tagSet).join(', ')}`));
          process.exit(1);
        }
      } else if (hasSkillName) {
        const resolved = resolveSkillId(skillName.trim(), aliases);
        if (!resolved) {
          console.error(chalk.red(`Invalid skill name: '${skillName}'`));
          process.exit(1);
        }
        skillsToInstall = [resolved];
      }

      skillsToInstall = unique(skillsToInstall);
      if (!skillsToInstall.length) {
        console.log(chalk.yellow('No skills to install.'));
        return;
      }

      const manifest = loadManifest(targetDir);
      let installedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;

      for (const skill of skillsToInstall) {
        const safeSkill = sanitizeSkillId(skill);
        if (!safeSkill) {
          console.error(chalk.red(`Invalid skill name: '${skill}'`));
          failedCount += 1;
          continue;
        }
        const sourcePath = resolveSkillPath(safeSkill);
        if (!sourcePath || !await fs.pathExists(sourcePath)) {
          console.error(chalk.red(`Skill '${safeSkill}' not found in vault.`));
          printSuggestions(safeSkill, aliases);
          failedCount += 1;
          continue;
        }

        const destPath = path.join(targetDir, safeSkill);
        if (await fs.pathExists(destPath)) {
          if (!options.force) {
            console.warn(chalk.yellow(`• Skipped (already installed): ${safeSkill}`));
            skippedCount += 1;
            continue;
          }
          await fs.remove(destPath);
        }

        await copySkill(safeSkill, targetDir, manifest);
        console.log(`${chalk.green('✔ Installed:')} ${safeSkill}`);
        installedCount += 1;
      }

      if (installedCount > 0) {
        saveManifest(targetDir, manifest);
      }

      console.log('');
      console.log(`Installed: ${installedCount}, skipped: ${skippedCount}, not found/invalid: ${failedCount}`);

      if (installedCount > 0) {
        console.log(chalk.bold.green('Installation complete!'));
        console.log('Restart your agent session to see changes.');
        if (skippedCount > 0) {
          console.log(chalk.gray('Use --force to overwrite already-installed skills.'));
        }
        if (failedCount > 0) {
          console.error(chalk.red(`${failedCount} requested skill(s) could not be installed.`));
          process.exitCode = 1;
        }
      } else if (failedCount > 0) {
        console.error(chalk.red('No skills were installed.'));
        process.exitCode = 1;
      } else {
        console.log(chalk.yellow('Nothing to do — all requested skills are already installed.'));
      }
    } catch (err) {
      console.error(chalk.red('Installation failed:'), err.message);
      process.exit(1);
    }
  });

program
  .command('uninstall [skillName]')
  .description('Remove installed skills from your workspace or globally')
  .option('-g, --global', 'Uninstall from the global skills directory')
  .option('-c, --claude', 'Target Claude Code (~/.claude/skills or ./.claude/skills)')
  .option('-a, --all', 'Remove ALL installed skills')
  .action(async (skillName, options) => {
    const platform = platformFromOptions(options);
    const targetDir = resolveTargetDir(options.global, platform);
    const aliases = loadAliases();
    const hasSkillName = typeof skillName === 'string' && skillName.trim().length > 0;

    if (!hasSkillName && !options.all) {
      console.error(chalk.red('Error: Please specify a skill name or use --all'));
      process.exit(1);
    }

    try {
      if (!await fs.pathExists(targetDir)) {
        console.error(chalk.red(`No skills directory found at: ${targetDir}`));
        process.exitCode = 1;
        return;
      }

      let skillsToRemove = [];
      if (options.all) {
        skillsToRemove = listInstalledIds(targetDir);
      } else {
        const resolved = resolveSkillId(skillName.trim(), aliases);
        if (!resolved) {
          console.error(chalk.red(`Invalid skill name: '${skillName}'`));
          process.exit(1);
        }
        if (!await fs.pathExists(path.join(targetDir, resolved))) {
          console.error(chalk.red(`Skill '${resolved}' is not installed.`));
          const installed = listInstalledIds(targetDir);
          const suggestions = suggestSimilar(resolved, installed);
          if (suggestions.length) {
            console.log(chalk.gray(`Did you mean: ${suggestions.join(', ')}?`));
          }
          process.exitCode = 1;
          return;
        }
        skillsToRemove = [resolved];
      }

      if (!skillsToRemove.length) {
        console.log(chalk.yellow('No skills to uninstall.'));
        return;
      }

      const manifest = loadManifest(targetDir);
      let removedCount = 0;

      for (const skill of skillsToRemove) {
        const safeSkill = sanitizeSkillId(skill);
        if (!safeSkill) continue;
        await fs.remove(path.join(targetDir, safeSkill));
        removeRecord(manifest, safeSkill);
        console.log(`${chalk.green('✔ Removed:')} ${safeSkill}`);
        removedCount += 1;
      }

      saveManifest(targetDir, manifest);
      console.log('');
      console.log(chalk.bold.green(`Uninstalled ${removedCount} skill(s).`));
    } catch (err) {
      console.error(chalk.red('Uninstall failed:'), err.message);
      process.exit(1);
    }
  });

program
  .command('installed')
  .description('List skills installed in your workspace')
  .option('-g, --global', 'List globally installed skills')
  .option('-c, --claude', 'Target Claude Code (~/.claude/skills or ./.claude/skills)')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    const platform = platformFromOptions(options);
    const targetDir = resolveTargetDir(options.global, platform);

    try {
      if (!await fs.pathExists(targetDir)) {
        console.log(chalk.yellow(`No skills directory found at: ${targetDir}`));
        return;
      }

      const filteredSkills = listInstalledIds(targetDir);

      if (filteredSkills.length === 0) {
        console.log(chalk.yellow('No skills installed.'));
        return;
      }

      // Drift status against the vault: up-to-date, outdated, or not-in-vault.
      const vaultIds = new Set(fs.existsSync(SKILLS_SOURCE_DIR) ? listSkillIds(SKILLS_SOURCE_DIR) : []);
      const entries = filteredSkills.map(skill => {
        let status = 'unknown';
        if (!vaultIds.has(skill)) {
          status = 'not-in-vault';
        } else {
          try {
            const vaultHash = hashSkillDir(resolveSkillPath(skill));
            const installedHash = hashSkillDir(path.join(targetDir, skill));
            status = vaultHash === installedHash ? 'up-to-date' : 'outdated';
          } catch (err) {
            status = 'unknown';
          }
        }
        return { id: skill, status };
      });

      if (options.json) {
        console.log(JSON.stringify({ location: targetDir, skills: entries }, null, 2));
        return;
      }

      console.log(chalk.bold(`\nInstalled Skills (${scopeLabel(options, platform)}):\n`));
      for (const entry of entries) {
        let marker = '';
        if (entry.status === 'outdated') marker = chalk.yellow(' (outdated — run ag-skills update)');
        else if (entry.status === 'not-in-vault') marker = chalk.gray(' (not in vault)');
        console.log(`- ${chalk.green(entry.id)}${marker}`);
      }
      console.log(chalk.gray(`\nLocation: ${targetDir}`));

      const outdated = entries.filter(entry => entry.status === 'outdated').length;
      if (outdated > 0) {
        console.log(chalk.yellow(`${outdated} skill(s) differ from the vault. Run: ag-skills update`));
      }
    } catch (err) {
      console.error(chalk.red('Error listing installed skills:'), err.message);
    }
  });

program
  .command('update [skillName]')
  .description('Update installed skills from the vault')
  .option('-g, --global', 'Update globally installed skills')
  .option('-c, --claude', 'Target Claude Code (~/.claude/skills or ./.claude/skills)')
  .action(async (skillName, options) => {
    const platform = platformFromOptions(options);
    const targetDir = resolveTargetDir(options.global, platform);
    const aliases = loadAliases();

    try {
      if (!await fs.pathExists(targetDir)) {
        console.error(chalk.red(`No installation found at: ${targetDir}`));
        process.exitCode = 1;
        return;
      }

      let skillsToUpdate = [];
      if (skillName) {
        const resolved = resolveSkillId(skillName, aliases);
        if (!resolved) {
          console.error(chalk.red(`Invalid skill name: '${skillName}'`));
          process.exitCode = 1;
          return;
        }
        if (await fs.pathExists(path.join(targetDir, resolved))) {
          skillsToUpdate.push(resolved);
        } else {
          console.error(chalk.red(`Skill '${skillName}' is not installed.`));
          const suggestions = suggestSimilar(resolved, listInstalledIds(targetDir));
          if (suggestions.length) {
            console.log(chalk.gray(`Did you mean: ${suggestions.join(', ')}?`));
          }
          process.exitCode = 1;
          return;
        }
      } else {
        skillsToUpdate = listInstalledIds(targetDir);
      }

      if (skillsToUpdate.length === 0) {
        console.log(chalk.yellow('No skills to update.'));
        return;
      }

      console.log(chalk.bold(`Checking ${skillsToUpdate.length} skill(s)...\n`));

      const manifest = loadManifest(targetDir);
      let updatedCount = 0;
      let unchangedCount = 0;
      let missingCount = 0;

      for (const skill of skillsToUpdate) {
        const safeSkill = sanitizeSkillId(skill);
        if (!safeSkill) {
          console.warn(chalk.yellow(`Warning: invalid skill name '${skill}'. Skipping.`));
          continue;
        }

        const sourcePath = resolveSkillPath(safeSkill);
        const destPath = path.join(targetDir, safeSkill);

        if (!sourcePath || !await fs.pathExists(sourcePath)) {
          console.warn(chalk.yellow(`⚠ Warning: Skill '${safeSkill}' no longer exists in vault. Skipping.`));
          missingCount += 1;
          continue;
        }

        // Only copy when content actually differs.
        let changed = true;
        try {
          changed = hashSkillDir(sourcePath) !== hashSkillDir(destPath);
        } catch (err) {
          changed = true;
        }

        if (!changed) {
          unchangedCount += 1;
          continue;
        }

        await fs.copy(sourcePath, destPath, { overwrite: true });
        recordInstall(manifest, safeSkill, hashSkillDir(sourcePath));
        console.log(`${chalk.green('✔ Updated:')} ${safeSkill}`);
        updatedCount += 1;
      }

      if (updatedCount > 0) {
        saveManifest(targetDir, manifest);
      }

      console.log('');
      console.log(`Updated: ${updatedCount}, already up-to-date: ${unchangedCount}, missing from vault: ${missingCount}`);
      if (updatedCount > 0) {
        console.log(chalk.bold.green('Update complete!'));
      } else {
        console.log(chalk.green('Everything is up-to-date.'));
      }
    } catch (err) {
      console.error(chalk.red('Update failed:'), err.message);
      process.exit(1);
    }
  });

function reportDir(label, dirPath) {
  const status = checkDir(dirPath);
  const state = status.exists && status.isDir
    ? chalk.green(status.writable ? 'OK' : 'NOT WRITABLE')
    : chalk.gray('missing (created on first install)');
  console.log(`${label}: ${dirPath} (${state})`);
}

program
  .command('doctor')
  .description('Check install paths and catalog metadata')
  .action(() => {
    console.log(chalk.bold('\nEnvironment Check:\n'));

    let vaultCount = 0;
    if (fs.existsSync(SKILLS_SOURCE_DIR)) {
      vaultCount = listSkillIds(SKILLS_SOURCE_DIR).length;
      console.log(`Vault directory: ${SKILLS_SOURCE_DIR} (${chalk.green('OK')}, ${vaultCount} skills)`);
    } else {
      console.log(`Vault directory: ${SKILLS_SOURCE_DIR} (${chalk.red('MISSING')})`);
    }

    const catalogExists = fs.existsSync(CATALOG_PATH);
    console.log(`catalog.json: ${catalogExists ? chalk.green('OK') : chalk.red('MISSING')}`);

    const bundlesExists = fs.existsSync(BUNDLES_PATH);
    console.log(`bundles.json: ${bundlesExists ? chalk.green('OK') : chalk.red('MISSING')}`);

    const aliasesExists = fs.existsSync(ALIASES_PATH);
    console.log(`aliases.json: ${aliasesExists ? chalk.green('OK') : chalk.red('MISSING')}`);

    // Lightweight drift check: catalog count vs vault count.
    if (catalogExists && vaultCount > 0) {
      const catalog = loadJson(CATALOG_PATH);
      if (catalog && typeof catalog.total === 'number' && catalog.total !== vaultCount) {
        console.log(chalk.yellow(`Catalog drift: catalog.json lists ${catalog.total} skills but the vault has ${vaultCount}. Run npm run build:catalog.`));
      }
    }

    for (const [platform, config] of Object.entries(PLATFORMS)) {
      console.log('');
      console.log(chalk.bold(`${config.label} (${platform === 'antigravity' ? 'default' : `--${platform}`}):`));
      reportDir('  Local skills dir', config.localDir);
      reportDir('  Global skills dir', config.globalDir);

      // Orphan check: installed skills that no longer exist in the vault.
      for (const dir of [config.localDir, config.globalDir]) {
        if (!fs.existsSync(dir)) continue;
        try {
          const installed = listInstalledIds(dir);
          const vaultIds = new Set(listSkillIds(SKILLS_SOURCE_DIR));
          const orphans = installed.filter(skill => !vaultIds.has(skill));
          if (orphans.length) {
            console.log(chalk.yellow(`  Not in vault (${dir}): ${orphans.join(', ')}`));
          }
        } catch (err) {
          // Ignore unreadable dirs; the writable check above already flags them.
        }
      }
    }

    if (process.env.AG_SKILLS_DIR) {
      const overrideDir = resolveTargetDir(false);
      const overrideStatus = checkDir(overrideDir);
      const label = overrideStatus.exists && overrideStatus.isDir
        ? chalk.green(overrideStatus.writable ? 'OK' : 'NOT WRITABLE')
        : chalk.red('MISSING');
      console.log('');
      console.log(`AG_SKILLS_DIR override: ${overrideDir} (${label})`);
      console.log(chalk.gray('Active install/update target (overrides local/global).'));
    }

    if (!catalogExists || !bundlesExists || !aliasesExists) {
      console.log('');
      console.log(chalk.gray('Run npm run build:catalog to regenerate catalog files.'));
    }
  });

program
  .command('stats')
  .description('Show catalog statistics')
  .action(() => {
    const catalog = loadCatalog();
    const bundles = loadBundles();
    const total = catalog.total || (catalog.skills || []).length;

    if (catalog._fallback) {
      console.warn(chalk.yellow('Warning: catalog.json not found; stats are based on minimal metadata.'));
    }

    const categoryCounts = new Map();
    for (const skill of catalog.skills || []) {
      const category = skill.category || 'general';
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    }

    const sortedCategories = Array.from(categoryCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    console.log(chalk.bold('\nCatalog Stats:\n'));
    console.log(`Total skills: ${total}`);
    if (catalog.generatedAt) {
      console.log(`Catalog generated at: ${catalog.generatedAt}`);
    }
    console.log('');

    console.log('Category counts:');
    sortedCategories.forEach(([category, count]) => {
      console.log(`- ${category}: ${count}`);
    });

    if (bundles.common && bundles.common.length) {
      console.log('');
      console.log(`Common skills (curated): ${bundles.common.join(', ')}`);
    }
  });

function main() {
  program.parse(process.argv);
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    loadJson,
    sanitizeSkillId,
    resolveSkillId,
    resolveSkillPath,
    resolveTargetDir,
    platformFromOptions,
    scoreSkill,
    truncate,
    parseLimit,
    collectOption,
    PLATFORMS,
  };
}
