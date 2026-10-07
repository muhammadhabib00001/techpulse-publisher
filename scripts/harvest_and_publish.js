/**
 * GenAlpha Magazines - Competitor Intelligence Pipeline Runner
 * 
 * Selects high-demand explainer & information-gap topics harvested from
 * tier-1 global competitors (Reuters, BBC, Spiegel, Le Monde, El País, etc.),
 * filters against YMYL/harm policies, invokes the automated publisher engine,
 * synchronizes all 8 multilingual editions, and triggers search indexing.
 * 
 * Usage:
 *   node scripts/harvest_and_publish.js [--count N] [--category <cat>] [--harvest] [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const KEYWORDS_DIR = path.join(DATA_DIR, 'keywords');
const PUBLISHED_TOPICS_FILE = path.join(DATA_DIR, 'published_topics.json');
const ARTICLES_FILE = path.join(DATA_DIR, 'articles.json');
const PIPELINE_LOG_FILE = path.join(KEYWORDS_DIR, 'pipeline_log.json');

// Parse CLI args
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    count: 1,
    category: null,
    lang: 'en',
    harvest: false,
    dryRun: false,
    topic: null
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') {
      parsed.count = parseInt(args[i + 1], 10) || 1;
      i++;
    } else if (args[i] === '--category') {
      parsed.category = args[i + 1];
      i++;
    } else if (args[i] === '--lang') {
      parsed.lang = args[i + 1];
      i++;
    } else if (args[i] === '--topic') {
      parsed.topic = args[i + 1];
      i++;
    } else if (args[i] === '--harvest') {
      parsed.harvest = true;
    } else if (args[i] === '--dry-run') {
      parsed.dryRun = true;
    }
  }
  return parsed;
}

const CLI_OPTS = parseArgs();

// Negative / Blocklist Filters for strict compliance (Anti-YMYL & Brand Safety)
const BLOCKED_WORDS = [
  'porn', 'pornhub', 'sexually', 'abuse', 'rape', 'suicide', 'pedophile',
  'death row', 'execution', 'plague', 'inmate', 'murder', 'killer', 'stabbing',
  'crypto pump', 'get rich', 'miracle cure', 'weight loss scam', 'personal loan'
];

// Topic Category Categorizer
function inferCategory(title) {
  const t = title.toLowerCase();
  if (/nobel|physics|telescope|particle|quantum|space|planet|nasa|esa|biology|climate|ecosystem|bird|species|wildlife/i.test(t)) {
    return 'science';
  }
  if (/chip|semiconductor|ai|software|cyber|tech|apple|google|meta|microsoft|computing|algorithm|robot/i.test(t)) {
    return 'technology';
  }
  if (/market|trade|economy|inflation|bank|tariff|treasury|gdp|recession|stock|invest|euro|dollar|bond/i.test(t)) {
    return 'business';
  }
  if (/election|parliament|senate|congress|minister|treaty|diplomat|vote|president|trump|biden|macron|scholz|un|nato/i.test(t)) {
    return 'politics';
  }
  if (/summit|accord|un |international|border|treaty|sovereign|geopolitic|global/i.test(t)) {
    return 'world';
  }
  return 'world'; // default high-authority category
}

// Check if topic is safe and suitable for high-ranking explainer
function isTopicSafe(title) {
  if (!title || title.length < 15) return false;
  const lower = title.toLowerCase();
  for (const blocked of BLOCKED_WORDS) {
    if (lower.includes(blocked)) return false;
  }
  return true;
}

// Normalize topic into an SEO-optimized Explainer title
function formatExplainerTopic(seedTopic) {
  let cleaned = seedTopic
    .replace(/^['"“‘]+|['"”’]+$/g, '')
    .replace(/['"“‘]([^'"]+)['"”’]/g, '$1')
    .replace(/['"]/g, '')
    .replace(/[—–]/g, ': ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

// Load previously published topics to prevent duplicate coverage
function getPublishedSlugsAndTopics() {
  const set = new Set();
  try {
    if (fs.existsSync(PUBLISHED_TOPICS_FILE)) {
      const records = JSON.parse(fs.readFileSync(PUBLISHED_TOPICS_FILE, 'utf8'));
      records.forEach(r => {
        if (r.slug) set.add(r.slug.toLowerCase());
        if (r.title) set.add(r.title.toLowerCase());
        if (r.topic) set.add(r.topic.toLowerCase());
      });
    }
    if (fs.existsSync(ARTICLES_FILE)) {
      const articles = JSON.parse(fs.readFileSync(ARTICLES_FILE, 'utf8'));
      articles.forEach(a => {
        if (a.slug) set.add(a.slug.toLowerCase());
        if (a.title) set.add(a.title.toLowerCase());
      });
    }
  } catch (e) {
    console.warn('[WARN] Could not load published records:', e.message);
  }
  return set;
}

async function run() {
  console.log('================================================================');
  console.log('  GenAlpha Magazines - Competitor Intelligence Publishing Engine');
  console.log('================================================================');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Desired publish count: ${CLI_OPTS.count}`);
  if (CLI_OPTS.category) console.log(`Category filter: ${CLI_OPTS.category}`);

  // Optional: Run fresh live harvest from competitor RSS feeds
  if (CLI_OPTS.harvest) {
    console.log('\n[HARVEST] Triggering live competitor feed harvest...');
    const harvestRes = spawnSync('node', ['scripts/keyword_intelligence_harvester.js'], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      shell: false
    });
    if (harvestRes.status !== 0) {
      console.warn('[WARN] Live harvest exited with code', harvestRes.status);
    }
  }

  // Load harvested keyword clusters
  const clusterFiles = fs.readdirSync(KEYWORDS_DIR)
    .filter(f => f.startsWith('clusters_') && f.endsWith('.json'))
    .filter(f => {
      if (!CLI_OPTS.lang || CLI_OPTS.lang === 'all') return true;
      return f === `clusters_${CLI_OPTS.lang}.json`;
    });
  let allCandidates = [];
  const publishedHistory = getPublishedSlugsAndTopics();

  clusterFiles.forEach(cf => {
    try {
      const filePath = path.join(KEYWORDS_DIR, cf);
      const clusters = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      clusters.forEach(item => {
        const seed = item.seedTopic;
        if (!isTopicSafe(seed)) return;

        const cat = inferCategory(seed);
        if (CLI_OPTS.category && cat !== CLI_OPTS.category) return;

        // Check against published history
        const seedLower = seed.toLowerCase();
        let alreadyCovered = false;
        for (const pub of publishedHistory) {
          if (seedLower.includes(pub) || pub.includes(seedLower)) {
            alreadyCovered = true;
            break;
          }
        }
        if (alreadyCovered) return;

        // Calculate editorial priority score
        let score = 50;
        if (cat === 'science') score += 35; // High evergreen & Google Discover appeal
        if (cat === 'technology') score += 30;
        if (cat === 'business') score += 25;
        if (cat === 'world') score += 20;
        if (cat === 'politics') score += 15;
        if (/nobel|discovery|breakthrough|space|treaty|accord/i.test(seed)) score += 25;

        allCandidates.push({
          topic: formatExplainerTopic(seed),
          originalSeed: seed,
          category: cat,
          lang: item.lang || 'en',
          score,
          searchIntents: item.searchIntents || []
        });
      });
    } catch (e) {
      console.warn(`[WARN] Error reading ${cf}:`, e.message);
    }
  });

  // Sort candidates by score descending
  allCandidates.sort((a, b) => b.score - a.score);

  console.log(`\nIdentified ${allCandidates.length} eligible competitor-gap topics.`);
  if (allCandidates.length === 0 && !CLI_OPTS.topic) {
    console.log('No new candidates matching filters. System is up to date.');
    return;
  }

  // Pick topics to publish
  let toPublish = [];
  if (CLI_OPTS.topic) {
    toPublish.push({
      topic: CLI_OPTS.topic,
      category: CLI_OPTS.category || inferCategory(CLI_OPTS.topic),
      score: 100
    });
  } else {
    toPublish = allCandidates.slice(0, CLI_OPTS.count);
  }

  console.log('\n--- Selected Topics for Publication ---');
  toPublish.forEach((t, i) => {
    console.log(`[${i + 1}] Category: [${t.category.toUpperCase()}] | Score: ${t.score} | Topic: "${t.topic}"`);
  });

  if (CLI_OPTS.dryRun) {
    console.log('\n[DRY RUN] Skipping actual publication generation.');
    return;
  }

  const publishResults = [];

  for (let idx = 0; idx < toPublish.length; idx++) {
    const item = toPublish[idx];
    console.log(`\n================================================================`);
    console.log(`[PIPELINE ${idx + 1}/${toPublish.length}] Publishing: "${item.topic}"`);
    console.log(`Category: ${item.category}`);
    console.log(`================================================================`);

    const pubArgs = [
      'scripts/publisher.js',
      '--topic', item.topic,
      '--category', item.category
    ];

    const pubStart = Date.now();
    const pubRes = spawnSync('node', pubArgs, {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      shell: false
    });

    const duration = ((Date.now() - pubStart) / 1000).toFixed(1);
    const success = pubRes.status === 0;

    console.log(`[RESULT] Exit code: ${pubRes.status} in ${duration}s`);
    publishResults.push({
      topic: item.topic,
      category: item.category,
      success,
      durationSec: parseFloat(duration),
      timestamp: new Date().toISOString()
    });

    // Record newly published topic to prevent re-selection
    publishedHistory.add(item.topic.toLowerCase());
  }

  // Log to pipeline ledger
  try {
    let logEntries = [];
    if (fs.existsSync(PIPELINE_LOG_FILE)) {
      logEntries = JSON.parse(fs.readFileSync(PIPELINE_LOG_FILE, 'utf8'));
    }
    logEntries.push(...publishResults);
    fs.writeFileSync(PIPELINE_LOG_FILE, JSON.stringify(logEntries, null, 2), 'utf8');
    console.log(`\n[LOG] Pipeline log updated at data/keywords/pipeline_log.json`);
  } catch (e) {
    console.warn('[WARN] Could not update pipeline log:', e.message);
  }

  console.log('\n================================================================');
  console.log('  Competitor Publishing Pipeline Execution Complete');
  console.log('================================================================');
}

run().catch(err => {
  console.error('[FATAL] Pipeline error:', err);
  process.exit(1);
});
