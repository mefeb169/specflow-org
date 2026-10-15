// Pass 1 of discovery: deterministic, no AI. Produces a map of what exists (paths + facts), not content.
import fs from 'node:fs';
import path from 'node:path';
import { posix, readJson } from './state.mjs';
import { UI_STACK } from './lifecycle.mjs';

const IGNORE = new Set(['node_modules', '.git', 'vendor', 'dist', 'build', 'target', '.venv', 'venv', '__pycache__', '.next', '.nuxt', '.gradle', '.idea', '.dart_tool', 'Pods', 'coverage', '.sdlc', '.turbo', 'obj', '.terraform']);
const MAX_FILES = 6000;
const CAP = 60;

const MANIFESTS = /^(package\.json|pyproject\.toml|requirements.*\.txt|go\.mod|.*\.csproj|.*\.sln|pom\.xml|build\.gradle(\.kts)?|Cargo\.toml|Gemfile|composer\.json|pubspec\.yaml|Package\.swift|Makefile)$/i;
const MONOREPO = /^(pnpm-workspace\.yaml|go\.work|lerna\.json|nx\.json|turbo\.json|.*\.sln)$/i;
const INSTRUCTIONS = [
  /^claude(\.local)?\.md$/i, /^agents\.md$/i, /^gemini\.md$/i, /^\.cursorrules$/i, /^\.windsurfrules$/i, /^contributing\.md$/i,
  /^\.github\/copilot-instructions\.md$/i, /^\.github\/instructions\/.+\.md$/i, /^\.cursor\/rules\//i,
  /^\.claude\/(skills|commands|agents)\/.+/i, /^\.claude\/settings(\.local)?\.json$/i,
];
const CONTRACTS = /(^|\/)(openapi[^/]*\.(ya?ml|json)|swagger[^/]*\.(ya?ml|json)|[^/]+\.graphql|[^/]+\.proto|[^/]+\.avsc|asyncapi[^/]*\.(ya?ml|json))$/i;
const DATA = /(^|\/)(migrations?|prisma|alembic|db\/migrate|flyway)(\/|$)|\.sql$|schema\.prisma$|(^|\/)(models|entities)\//i;
const TESTS = /(^|\/)(tests?|__tests__|spec|e2e|cypress)(\/|$)|(^|\/)(jest|vitest|playwright|cypress|karma)\.config\.[a-z]+$|(^|\/)(pytest\.ini|tox\.ini|conftest\.py)$/i;
const CI = /^(\.github\/workflows\/.+|\.gitlab-ci\.yml|azure-pipelines\.yml|Jenkinsfile|\.circleci\/config\.yml|bitbucket-pipelines\.yml)$/i;
const INFRA = /(^|\/)(Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|k8s|kubernetes|helm|charts)(\/|$)|\.tf$|(^|\/)serverless\.ya?ml$/i;
const DOCS = /(^|\/)(readme[^/]*|docs?\/.+\.md|adr\/.+\.md|architecture[^/]*\.md|prd[^/]*\.md)$/i;

function walk(base, maxDepth, stopAtRepos) {
  const files = [];
  const nestedRepos = [];
  (function rec(dir, depth) {
    if (files.length >= MAX_FILES) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (IGNORE.has(e.name) || depth >= maxDepth) continue;
        if (stopAtRepos && fs.existsSync(path.join(full, '.git'))) { nestedRepos.push(full); continue; }
        rec(full, depth + 1);
      } else {
        files.push(posix(path.relative(base, full)));
      }
    }
  })(base, 0);
  return { files, nestedRepos };
}

const cap = (a) => a.slice(0, CAP);
const hasGit = (d) => fs.existsSync(path.join(d, '.git'));

/** Find git repos under root (depth<=4). Does not descend into a repo once found. */
export function discoverRepos(root) {
  const found = [];
  (function rec(dir, depth) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || IGNORE.has(e.name) || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (hasGit(full)) { found.push(full); continue; }
      if (depth < 3) rec(full, depth + 1);
    }
  })(root, 0);
  return found;
}

function candidateCommands(dir, files) {
  const c = { test: null, build: null, lint: null };
  const set = (k, v, src) => { if (!c[k]) c[k] = { cmd: v, source: src }; };
  const pkg = files.includes('package.json') ? readJson(path.join(dir, 'package.json'), {}) : null;
  if (pkg?.scripts) {
    const runner = files.includes('pnpm-lock.yaml') ? 'pnpm' : files.includes('yarn.lock') ? 'yarn' : 'npm';
    for (const k of ['test', 'build', 'lint']) if (pkg.scripts[k]) set(k, k === 'test' && runner === 'npm' ? 'npm test' : `${runner} run ${k}`, 'package.json');
  }
  if (files.includes('go.mod')) { set('test', 'go test ./...', 'go.mod'); set('build', 'go build ./...', 'go.mod'); }
  if (files.includes('Cargo.toml')) { set('test', 'cargo test', 'Cargo.toml'); set('build', 'cargo build', 'Cargo.toml'); }
  if (files.includes('pom.xml')) { set('test', 'mvn test', 'pom.xml'); set('build', 'mvn package', 'pom.xml'); }
  if (files.some((f) => /^[^/]+\.(sln|csproj)$/i.test(f))) { set('test', 'dotnet test', 'dotnet project'); set('build', 'dotnet build', 'dotnet project'); }
  if (files.some((f) => /^(pytest\.ini|tox\.ini)$/.test(f)) || files.includes('pyproject.toml')) set('test', 'pytest', 'pyproject/pytest config');
  return c;
}

function stackOf(dir, files, manifests) {
  const s = new Set();
  for (const m of manifests) {
    const b = path.basename(m.file).toLowerCase();
    if (b === 'package.json') {
      s.add('node');
      const pkg = readJson(path.join(dir, m.file), {});
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const k of ['react', 'next', 'vue', 'nuxt', '@angular/core', 'svelte', 'express', '@nestjs/core', 'fastify', 'react-native', 'expo', 'typescript', 'prisma', 'jest', 'vitest', 'playwright']) if (deps[k]) s.add(k);
    } else if (b === 'go.mod') s.add('go');
    else if (b === 'cargo.toml') s.add('rust');
    else if (b === 'pom.xml' || b.startsWith('build.gradle')) s.add('jvm');
    else if (b.endsWith('.csproj') || b.endsWith('.sln')) s.add('dotnet');
    else if (b === 'pyproject.toml' || b.startsWith('requirements')) s.add('python');
    else if (b === 'gemfile') s.add('ruby');
    else if (b === 'composer.json') s.add('php');
    else if (b === 'pubspec.yaml') s.add('dart/flutter');
    else if (b === 'package.swift') s.add('swift');
  }
  if (files.some((f) => /\.tf$/.test(f))) s.add('terraform');
  return [...s];
}

const DS_FILES = /(^|\/)(tailwind\.config\.[a-z]+|components\.json|(theme|tokens)\.[a-z]+|[^/]+\.tokens\.json|(variables|tokens|theme)\.(s?css|less))$|(^|\/)\.storybook\/|(^|\/)theme\/[^/]+/i;
const DS_DEPS = ['@mui/material', '@chakra-ui/react', 'antd', 'bootstrap', 'styled-components', '@emotion/react', 'vuetify', '@angular/material'];
const VISUAL_DEPS = ['playwright', '@playwright/test', 'cypress', 'storybook'];
const VISUAL_FILES = /(^|\/)(playwright\.config\.[a-z]+|cypress\.config\.[a-z]+)$|(^|\/)\.storybook\//i;

function uiInfo(dir, files, manifests, stack) {
  const deps = new Set();
  for (const m of manifests.filter((x) => path.basename(x.file) === 'package.json')) {
    const pkg = readJson(path.join(dir, m.file), {});
    for (const k of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) deps.add(k);
  }
  const design_system = cap(files.filter((f) => DS_FILES.test(f)));
  for (const d of deps) if (DS_DEPS.includes(d) || d.startsWith('@radix-ui/')) design_system.push(`dependency:${d}`);
  const visual_test_tools = [...new Set([
    ...[...deps].filter((d) => VISUAL_DEPS.includes(d) || d.startsWith('@storybook/')).map((d) => (d.startsWith('@storybook/') ? 'storybook' : d)),
    ...files.filter((f) => VISUAL_FILES.test(f)).map((f) => (/storybook/i.test(f) ? 'storybook' : path.basename(f).split('.')[0])),
  ])];
  return { is_ui: stack.some((s) => UI_STACK.includes(s)) || design_system.length > 0, design_system, visual_test_tools };
}

export function scanRepo(root, repoPath, name, isRoot) {
  const dir = path.resolve(root, repoPath);
  const { files } = walk(dir, 4, true);
  const by = (re, fn = (f) => f) => cap(files.filter((f) => re.test(f)).map(fn));
  const manifests = cap(files.filter((f) => MANIFESTS.test(path.basename(f))).map((file) => {
    const m = { file };
    if (path.basename(file) === 'package.json') {
      const pkg = readJson(path.join(dir, file), {});
      m.scripts = Object.keys(pkg.scripts || {});
      if (pkg.workspaces) m.workspaces = pkg.workspaces;
    }
    return m;
  }));
  const opts = readJson(path.join(dir, '.specify', 'init-options.json'), null);
  const rootFiles = files.filter((f) => !f.includes('/'));
  return {
    name, path: repoPath, git: hasGit(dir), file_count: files.length, truncated: files.length >= MAX_FILES,
    manifests,
    stack: stackOf(dir, files, manifests),
    ui: uiInfo(dir, files, manifests, stackOf(dir, files, manifests)),
    monorepo: cap(files.filter((f) => MONOREPO.test(path.basename(f)))).concat(manifests.filter((m) => m.workspaces).map((m) => `${m.file}#workspaces`)),
    instructions: cap(files.filter((f) => INSTRUCTIONS.some((r) => r.test(f) || r.test(path.basename(f))))),
    docs: by(DOCS),
    contracts: by(CONTRACTS),
    data: by(DATA),
    tests: by(TESTS),
    ci: by(CI),
    infra: by(INFRA),
    speckit: { present: fs.existsSync(path.join(dir, '.specify')), version: opts?.speckit_version || null, integration: opts?.integration || null, specs: fs.existsSync(path.join(dir, 'specs')) ? fs.readdirSync(path.join(dir, 'specs')).filter((d) => fs.statSync(path.join(dir, 'specs', d)).isDirectory()) : [] },
    command_candidates: candidateCommands(dir, rootFiles.concat(files)),
    is_root: isRoot,
  };
}

export function scanWorkspace(root) {
  const children = discoverRepos(root);
  const repos = [];
  const used = new Set();
  const uniq = (n) => { let k = n, i = 2; while (used.has(k)) k = `${n}-${i++}`; used.add(k); return k; };
  const rootIsRepo = hasGit(root);
  if (rootIsRepo || children.length === 0) repos.push(scanRepo(root, '.', uniq(path.basename(root) || 'root'), true));
  for (const c of children) repos.push(scanRepo(root, posix(path.relative(root, c)), uniq(path.basename(c)), false));
  return {
    scanned_at: new Date().toISOString(), root, root_is_repo: rootIsRepo,
    workspace_instructions: ['CLAUDE.md', 'AGENTS.md', '.claude'].filter((f) => fs.existsSync(path.join(root, f))),
    workspace_speckit: { present: fs.existsSync(path.join(root, '.specify')), version: readJson(path.join(root, '.specify', 'init-options.json'), {}).speckit_version || null },
    repos,
  };
}
