#!/usr/bin/env node
/**
 * Version incrementer for ojowaPTM.
 *
 * Usage:
 *   node scripts/bump-version.js [major|minor|patch]   (default: patch)
 *
 * Updates:
 *   - package.json            -> version
 *   - app.json                -> expo.version
 *   - android/app/build.gradle -> versionName + versionCode (auto-incremented)
 *
 * Then commit and tag:
 *   git add -A
 *   git commit -m "Release v<new-version>"
 *   git tag v<new-version>
 *   git push origin main --tags
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const bump = (process.argv[2] || 'patch').toLowerCase();

if (!['major', 'minor', 'patch'].includes(bump)) {
  console.error(`Unknown bump type "${bump}". Use: major | minor | patch`);
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(path.join(root, file), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// --- Read current version ---
const pkg = readJson('package.json');
const [maj, min, pat] = String(pkg.version).split('.').map((n) => parseInt(n, 10));
if ([maj, min, pat].some(Number.isNaN)) {
  console.error(`Invalid current version in package.json: "${pkg.version}"`);
  process.exit(1);
}

// --- Compute next version ---
let next;
if (bump === 'major') next = `${maj + 1}.0.0`;
else if (bump === 'minor') next = `${maj}.${min + 1}.0`;
else next = `${maj}.${min}.${pat + 1}`;

// --- package.json ---
pkg.version = next;
writeJson('package.json', pkg);

// --- app.json (expo.version) ---
const app = readJson('app.json');
if (app.expo) {
  app.expo.version = next;
  writeJson('app.json', app);
}

// --- android/app/build.gradle ---
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');

const vcMatch = gradle.match(/versionCode\s+(\d+)/);
if (!vcMatch) {
  console.error('Could not find versionCode in android/app/build.gradle');
  process.exit(1);
}
const nextVersionCode = parseInt(vcMatch[1], 10) + 1;

gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${nextVersionCode}`);
gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${next}"`);
fs.writeFileSync(gradlePath, gradle, 'utf8');

console.log(`Bumped ${bump}:`);
console.log(`  version      ${next}`);
console.log(`  versionName  ${next}`);
console.log(`  versionCode  ${nextVersionCode}`);
console.log('');
console.log('Next steps:');
console.log('  git add -A');
console.log(`  git commit -m "Release v${next}"`);
console.log(`  git tag v${next}`);
console.log('  git push origin main --tags');
