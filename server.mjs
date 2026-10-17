#!/usr/bin/env node
/**
 * kaggle-workbench MCP server — stdio transport, zero runtime dependencies.
 *
 * Exposes the Kaggle REST API (https://www.kaggle.com/api/v1) as MCP tools.
 * Discovery and public-dataset download work without credentials; kernels and
 * competitions require KAGGLE_USERNAME + KAGGLE_KEY in the environment.
 * Write operations (push, create, submit) require the official `kaggle` CLI and
 * are documented in the skills rather than proxied here, so this server never
 * executes an arbitrary command.
 *
 * stdout carries JSON-RPC only. All diagnostics go to stderr.
 */

import { createWriteStream, existsSync, readFileSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';

const API_BASE = 'https://www.kaggle.com/api/v1';
const SERVER_NAME = 'kaggle-workbench-mcp';
const SERVER_VERSION = '1.3.0';
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';
const RESULT_CHAR_LIMIT = 60000;
const REQUEST_TIMEOUT_MS = 30000;

const REF_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const SORT_OPTIONS = ['relevance', 'hottest', 'active', 'updated'];

/**
 * Tools that work without any Kaggle credentials.
 */
const OPEN_TOOLS = [
  'kaggle_status',
  'kaggle_search_datasets',
  'kaggle_dataset_view',
  'kaggle_dataset_download',
];
/**
 * Tools that prefer authenticated REST and fall back to the official `kaggle` CLI,
 * which serves public listings without credentials.
 */
const AUTH_TOOLS = ['kaggle_search_kernels', 'kaggle_list_competitions'];

class AuthRequiredError extends Error {
  constructor(detail, message) {
    super(
      message ||
        'Kaggle credentials are not configured. Set the KAGGLE_USERNAME and KAGGLE_KEY ' +
          'environment variables (Account Settings -> API -> Create New Token). ' +
          'These tools need an authenticated Kaggle session.'
    );
    this.name = 'AuthRequiredError';
    this.detail = detail;
  }
}

class UserInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserInputError';
  }
}

/* ------------------------------------------------------------------ auth --- */

function credentials() {
  const username = process.env.KAGGLE_USERNAME;
  const key = process.env.KAGGLE_KEY;
  if (!username || !key) return null;
  return { username, token: Buffer.from(`${username}:${key}`, 'utf8').toString('base64') };
}

function kaggleCliVersion() {
  try {
    const result = spawnSync('kaggle', ['--version'], {
      encoding: 'utf8',
      timeout: 8000,
      windowsHide: true,
    });
    if (result.error || result.status !== 0) return { available: false, version: null };
    const version = (result.stdout || result.stderr || '').trim().split(/\r?\n/)[0] || 'unknown';
    return { available: true, version };
  } catch {
    return { available: false, version: null };
  }
}

/**
 * Official onboarding state for the Kaggle CLI.
 *
 * Kaggle CLI 2.x authenticates through OAuth and stores the session in
 * `~/.kaggle/credentials.json` (refresh_token / access_token / username).
 * The legacy `~/.kaggle/kaggle.json` username+key file is still honoured.
 * Returns presence only — never any credential value.
 */
function kaggleAuthState() {
  const kaggleDir = path.join(homedir(), '.kaggle');
  const oauthPath = path.join(kaggleDir, 'credentials.json');
  const legacyPath = path.join(kaggleDir, 'kaggle.json');

  try {
    if (existsSync(oauthPath)) {
      const data = JSON.parse(readFileSync(oauthPath, 'utf8'));
      return {
        loggedIn: Boolean(data.refresh_token),
        method: 'oauth',
        file: '~/.kaggle/credentials.json',
        accountPresent: Boolean(data.username),
      };
    }
  } catch {
    // An unreadable credentials file is treated as "not logged in".
  }

  try {
    if (existsSync(legacyPath)) {
      const data = JSON.parse(readFileSync(legacyPath, 'utf8'));
      return {
        loggedIn: Boolean(data.username && data.key),
        method: 'legacy-credentials-json',
        file: '~/.kaggle/kaggle.json',
        accountPresent: Boolean(data.username),
      };
    }
  } catch {
    // ignore
  }

  return { loggedIn: false, method: null, file: null, accountPresent: false };
}

/** The single actionable next step for a user who is not ready to call the API. */
function onboardingGuidance(cli) {
  if (!cli.available) {
    return {
      ready: false,
      step: 'pip install kaggle',
      then: 'python -m kaggle auth login',
      note: 'The official Kaggle CLI is not installed. Install it, then sign in; the login flow opens a browser and stores the session in ~/.kaggle/credentials.json.',
    };
  }
  if (!cli.loggedIn) {
    return {
      ready: false,
      step: 'python -m kaggle auth login',
      then: null,
      note: 'The Kaggle CLI is installed but not signed in. Run the login command yourself — it opens a browser for the OAuth flow, so it cannot be automated. Every CLI call, including read-only listings, fails without it.',
    };
  }
  return { ready: true, step: null, then: null, note: null };
}

/**
 * Run one fixed official `kaggle` subcommand. Only allowlisted read-only listing
 * commands are ever issued; there is no generic command passthrough.
 */
function runKaggleCli(args, timeoutMs = 25000) {
  const result = spawnSync('kaggle', args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    // The CLI's Python process writes to the pipe using the Windows locale
    // codepage, which crashes on any title containing characters outside it.
    // Force UTF-8 so non-ASCII kernel and competition names survive.
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
  });
  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') {
      throw new Error(`The kaggle CLI timed out after ${timeoutMs} ms (kaggle ${args.join(' ')}).`);
    }
    throw new Error(`The kaggle CLI could not be started: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    if (/authentication required|401|403|unauthorized/i.test(stderr)) {
      throw new AuthRequiredError(
        `kaggle ${args.join(' ')} -> ${result.status}`,
        'The Kaggle CLI is installed but not signed in. Run `python -m kaggle auth login` ' +
          'yourself — it opens a browser for the OAuth flow and cannot be automated. The ' +
          'session is stored in ~/.kaggle/credentials.json.'
      );
    }
    const detail = (stderr || result.stdout || '')
      .trim()
      .split(/\r?\n/)
      .slice(0, 2)
      .join(' ')
      .slice(0, 300);
    throw new Error(`The kaggle CLI exited with ${result.status}: ${detail || 'no output'}`);
  }
  return (result.stdout || '').trim();
}

/** Minimal RFC4180 CSV reader; returns [] when the CLI printed a non-tabular notice. */
function parseCsv(text) {
  const source = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const cleaned = rows.filter((r) => r.some((c) => c.trim() !== ''));
  const header = cleaned[0];
  // `header` is already a cell array, so a usable header needs at least two columns.
  if (cleaned.length < 2 || !header || header.length < 2) return [];

  return cleaned.slice(1).map((r) => {
    const obj = {};
    header.forEach((name, i) => {
      const key = name.trim();
      if (key) obj[key] = (r[i] ?? '').trim();
    });
    return obj;
  });
}

/* ----------------------------------------------------------------- http --- */

async function requestOnce(endpoint, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE}${endpoint}`, {
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Kaggle API request timed out after ${REQUEST_TIMEOUT_MS} ms: ${endpoint}`);
    }
    throw new Error(`Cannot reach the Kaggle API (${endpoint}): ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function apiFetch(endpoint, { auth = false } = {}) {
  const headers = { accept: 'application/json', 'user-agent': `${SERVER_NAME}/${SERVER_VERSION}` };
  const initial = credentials();

  if (auth) {
    if (!initial) throw new AuthRequiredError();
    headers.authorization = `Basic ${initial.token}`;
  }

  let response = await requestOnce(endpoint, headers);

  // An open endpoint answered 401/403 while credentials happen to be configured —
  // retry once authenticated so private datasets stay reachable.
  if (!auth && (response.status === 401 || response.status === 403) && initial) {
    headers.authorization = `Basic ${initial.token}`;
    response = await requestOnce(endpoint, headers);
  }

  if (response.status === 401 || response.status === 403) {
    const detail = `HTTP ${response.status} for ${endpoint}`;
    throw new AuthRequiredError(
      detail,
      initial
        ? `Kaggle refused ${endpoint} (HTTP ${response.status}) even with the configured ` +
          'credentials. The dataset may be private or missing, or the API token may be ' +
          'expired or out of scope.'
        : `Kaggle requires an authenticated session for ${endpoint} (HTTP ${response.status}). ` +
          'Set the KAGGLE_USERNAME and KAGGLE_KEY environment variables (Account Settings -> ' +
          'API -> Create New Token).'
    );
  }
  return response;
}

async function apiGetJson(endpoint, options) {
  const response = await apiFetch(endpoint, options);
  if (!response.ok) {
    throw new Error(`Kaggle API returned HTTP ${response.status} for ${endpoint}`);
  }
  return response.json();
}

/* -------------------------------------------------------------- mapping --- */

/**
 * The Kaggle API serialises protobuf as a flat object with `<field>Nullable` and
 * `has<Field>` duplicates of every real field. Drop the duplicates and keep the
 * plain values.
 */
function unwrapProtobuf(value) {
  if (Array.isArray(value)) return value.map(unwrapProtobuf);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (key.endsWith('Nullable')) continue;
      if (key.startsWith('has') && typeof item === 'boolean') continue;
      if (item === null) continue;
      out[key] = unwrapProtobuf(item);
    }
    return out;
  }
  return value;
}

function pick(source, keys) {
  const out = {};
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      out[key] = source[key];
    }
  }
  return out;
}

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.datasets)) return payload.datasets;
  if (payload && Array.isArray(payload.kernels)) return payload.kernels;
  if (payload && Array.isArray(payload.competitions)) return payload.competitions;
  return [];
}

function bytesLabel(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`;
}

function requireRef(value, label = 'ref') {
  if (typeof value !== 'string' || !REF_PATTERN.test(value)) {
    throw new UserInputError(
      `${label} must look like "owner/slug" using letters, digits, dot, underscore or hyphen, ` +
        'for example "heptapod/titanic".'
    );
  }
  return value;
}

function requireSearch(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new UserInputError('search must be a non-empty keyword string.');
  }
  return value.trim();
}

function requirePage(value) {
  const page = value === undefined ? 1 : Number(value);
  if (!Number.isInteger(page) || page < 1 || page > 1000) {
    throw new UserInputError('page must be an integer between 1 and 1000.');
  }
  return page;
}

/* --------------------------------------------------------------- tools ---- */

const TOOLS = [
  {
    name: 'kaggle_status',
    description:
      'Report exactly what this server can do right now and what the user must do next: ' +
      'whether KAGGLE_USERNAME and KAGGLE_KEY are set, whether the official `kaggle` CLI is ' +
      'installed, whether that CLI is signed in (OAuth session in ~/.kaggle/credentials.json), ' +
      'which tools are unlocked, and the single onboarding step when something is missing. ' +
      'Call this before any Kaggle task so you never promise results that authentication blocks.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => {
      const creds = credentials();
      const cli = { ...kaggleCliVersion(), ...kaggleAuthState() };
      const unlocked = [...OPEN_TOOLS];
      if (creds || (cli.available && cli.loggedIn)) unlocked.push(...AUTH_TOOLS);

      return {
        server: SERVER_NAME,
        serverVersion: SERVER_VERSION,
        node: process.version,
        apiBase: API_BASE,

        environmentVariables: {
          KAGGLE_USERNAME: Boolean(creds),
          KAGGLE_KEY: Boolean(creds),
          role: 'optional. Only used for the authenticated REST path of the two gated tools.',
        },
        kaggleCli: {
          installed: cli.available,
          version: cli.version,
          loggedIn: cli.loggedIn,
          authMethod: cli.method,
          credentialsFile: cli.file,
          accountConfigured: cli.accountPresent,
        },

        onboarding: onboardingGuidance(cli),

        toolsAvailableNow: unlocked,
        toolsUnavailable: TOOLS.filter((t) => !unlocked.includes(t.name)).map((t) => t.name),

        transportNote:
          'Dataset search, metadata and download work with no Kaggle sign-in at all via the ' +
          'public REST API. Kernel search and competition listing need one of two sign-in ' +
          'paths: KAGGLE_USERNAME + KAGGLE_KEY for the REST API (more fields), or the official ' +
          'CLI signed in via `python -m kaggle auth login` (fewer fields, `via` reports which ' +
          'path ran).',

        writeOperations:
          'Creating versions, pushing kernels and submitting to competitions are never proxied ' +
          'by this server. Run them yourself with the official CLI, and confirm with the user ' +
          'first because they are externally visible.',
      };
    },
  },

  {
    name: 'kaggle_search_datasets',
    description:
      'Search public Kaggle datasets by keyword. Works without credentials. Returns ref, title, ' +
      'owner, size, votes, downloads, usability rating, licence and last update for each hit, ' +
      'plus the next page number. The Kaggle API returns 20 results per page.',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Keyword or phrase, e.g. "house prices".' },
        sortBy: {
          type: 'string',
          enum: SORT_OPTIONS,
          default: 'relevance',
          description:
            'relevance (default), hottest (most downloaded), active (recently used), updated (recently refreshed).',
        },
        page: { type: 'integer', minimum: 1, maximum: 1000, default: 1 },
      },
      required: ['search'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const search = requireSearch(args.search);
      const sortBy = SORT_OPTIONS.includes(args.sortBy) ? args.sortBy : 'relevance';
      const page = requirePage(args.page);
      const payload = await apiGetJson(
        `/datasets/list?search=${encodeURIComponent(search)}&sortBy=${sortBy}&page=${page}`
      );
      const items = asArray(payload).map((raw) => unwrapProtobuf(raw));
      return {
        query: { search, sortBy, page },
        resultsPerPage: items.length,
        nextPage: items.length === 20 && page < 1000 ? page + 1 : null,
        count: items.length,
        datasets: items.map((item) => ({
          ref: item.ref,
          title: item.title,
          subtitle: item.subtitle ?? null,
          owner: item.ownerRef ?? item.ownerName ?? null,
          url: item.url ?? (item.ref ? `https://www.kaggle.com/datasets/${item.ref}` : null),
          totalBytes: item.totalBytes ?? null,
          sizeLabel: bytesLabel(item.totalBytes),
          downloadCount: item.downloadCount ?? null,
          voteCount: item.voteCount ?? null,
          usabilityRating:
            typeof item.usabilityRating === 'number' ? Math.round(item.usabilityRating * 1000) / 1000 : null,
          currentVersion: item.currentVersionNumber ?? null,
          lastUpdated: item.lastUpdated ?? null,
          licenseName: item.licenseName ?? null,
          isPrivate: item.isPrivate ?? null,
          keywordCount: item.keywordCount ?? null,
        })),
      };
    },
  },

  {
    name: 'kaggle_dataset_view',
    description:
      'Fetch the full metadata and file manifest of one Kaggle dataset. Works without ' +
      'credentials. Use it after searching to confirm the real file list, column names, ' +
      'sizes and licence before downloading a large dataset or committing to an analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Dataset ref in "owner/slug" form.' },
      },
      required: ['ref'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const ref = requireRef(args.ref);
      // The metadata and the file manifest live on two different endpoints.
      const [viewPayload, listPayload] = await Promise.all([
        apiGetJson(`/datasets/view/${ref}`),
        apiGetJson(`/datasets/list/${ref}`).catch(() => null),
      ]);
      const data = unwrapProtobuf(viewPayload);
      const detail = listPayload ? unwrapProtobuf(listPayload) : {};
      const files = Array.isArray(detail.datasetFiles) ? detail.datasetFiles : [];
      const versions = Array.isArray(data.versions) ? data.versions : [];

      return {
        ref,
        title: data.title ?? null,
        subtitle: data.subtitle ?? null,
        url: data.url ?? `https://www.kaggle.com/datasets/${ref}`,
        owner: data.ownerRef ?? data.ownerName ?? null,
        description: typeof data.description === 'string' ? data.description.slice(0, 4000) : null,
        totalBytes: data.totalBytes ?? null,
        sizeLabel: bytesLabel(data.totalBytes),
        downloadCount: data.downloadCount ?? null,
        voteCount: data.voteCount ?? null,
        viewCount: data.viewCount ?? null,
        kernelCount: data.kernelCount ?? null,
        usabilityRating:
          typeof data.usabilityRating === 'number' ? Math.round(data.usabilityRating * 1000) / 1000 : null,
        licenseName: data.licenseName ?? null,
        currentVersionNumber: data.currentVersionNumber ?? null,
        lastUpdated: data.lastUpdated ?? null,
        isPrivate: data.isPrivate ?? null,
        isFeatured: data.isFeatured ?? null,
        topics: Array.isArray(data.tags) ? data.tags.slice(0, 20) : [],
        versionCount: versions.length,
        versions: versions.slice(0, 10).map((version) => ({
          versionNumber: version.versionNumber ?? null,
          creationDate: version.creationDate ?? null,
          status: version.status ?? null,
          versionNotes: typeof version.versionNotes === 'string' ? version.versionNotes.slice(0, 500) : null,
        })),
        fileCount: files.length,
        files: files.slice(0, 300).map((file) => ({
          name: file.name ?? null,
          fileType: file.fileType ?? null,
          totalBytes: file.totalBytes ?? null,
          sizeLabel: bytesLabel(file.totalBytes),
          description: typeof file.description === 'string' ? file.description.slice(0, 500) : null,
          url: file.url ?? null,
          columns:
            Array.isArray(file.columns) && file.columns.length > 0
              ? file.columns.slice(0, 80).map((column) => ({ name: column.name ?? null, type: column.type ?? null }))
              : null,
        })),
        fileListTruncated: files.length > 300,
      };
    },
  },

  {
    name: 'kaggle_dataset_download',
    description:
      'Download a public Kaggle dataset as a zip archive into the current workspace. Works ' +
      'without credentials for public datasets. The destination is resolved inside the ' +
      'workspace directory; paths that escape it are rejected. Prefer inspecting the file ' +
      'manifest with kaggle_dataset_view before downloading a large dataset.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Dataset ref in "owner/slug" form.' },
        destDir: {
          type: 'string',
          default: 'kaggle-data',
          description: 'Directory inside the workspace to save into. Defaults to ./kaggle-data.',
        },
        fileName: {
          type: 'string',
          description: 'Optional archive name. Defaults to "<owner>-<slug>.zip".',
        },
      },
      required: ['ref'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const ref = requireRef(args.ref);
      const workspace = process.cwd();
      const requested = typeof args.destDir === 'string' && args.destDir.trim() !== '' ? args.destDir.trim() : 'kaggle-data';
      const destDir = path.resolve(workspace, requested);
      const relative = path.relative(workspace, destDir);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new UserInputError(
          `destDir must stay inside the workspace. Resolved target ${destDir} is outside ${workspace}.`
        );
      }

      const safeName =
        typeof args.fileName === 'string' && args.fileName.trim() !== ''
          ? args.fileName.trim().replace(/[\\/:*?"<>|]/g, '_')
          : `${ref.replace('/', '-')}.zip`;
      const target = path.join(destDir, safeName);

      const response = await apiFetch(`/datasets/download/${ref}`);
      if (!response.ok) {
        throw new Error(`Kaggle API returned HTTP ${response.status} while downloading ${ref}`);
      }

      await mkdir(destDir, { recursive: true });
      const webStream = Readable.fromWeb(response.body);
      const fileStream = createWriteStream(target);
      await new Promise((resolve, reject) => {
        fileStream.on('error', reject);
        webStream.on('error', reject);
        fileStream.on('finish', resolve);
        webStream.pipe(fileStream);
      });

      const info = await stat(target);
      return {
        ref,
        savedTo: path.relative(workspace, target),
        absolutePath: target,
        bytes: info.size,
        sizeLabel: bytesLabel(info.size),
        contentType: response.headers.get('content-type'),
        nextSteps:
          'Extract the archive and inspect the schema before analysis. Next-page listing of ' +
          'contents is available with kaggle_dataset_view.',
      };
    },
  },

  {
    name: 'kaggle_search_kernels',
    description:
      'Search public Kaggle notebooks (kernels) by keyword, so you can reuse proven approachs ' +
      'and feature engineering before writing your own. Uses the authenticated REST API when ' +
      'KAGGLE_USERNAME and KAGGLE_KEY are set, otherwise falls back to the official `kaggle` CLI ' +
      'when it is installed.',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Keyword or phrase to match against kernel titles.' },
        page: { type: 'integer', minimum: 1, maximum: 1000, default: 1 },
        sortBy: {
          type: 'string',
          enum: ['relevance', 'voteCount', 'dateCreated'],
          default: 'relevance',
          description: 'Sort order accepted by the Kaggle kernels list endpoint.',
        },
      },
      required: ['search'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const search = requireSearch(args.search);
      const page = requirePage(args.page);
      const sortBy = ['relevance', 'voteCount', 'dateCreated'].includes(args.sortBy) ? args.sortBy : 'relevance';
      const query = { search, sortBy, page };

      if (credentials()) {
        const payload = await apiGetJson(
          `/kernels/list?search=${encodeURIComponent(search)}&page=${page}&sortBy=${sortBy}`,
          { auth: true }
        );
        const items = asArray(payload).map((raw) => unwrapProtobuf(raw));
        return {
          query,
          via: 'rest',
          count: items.length,
          kernels: items.map((item) => ({
            ref: item.ref,
            title: item.title ?? null,
            author: item.authorRef ?? item.ownerName ?? null,
            url: item.url ?? (item.ref ? `https://www.kaggle.com/code/${item.ref}` : null),
            totalVotes: item.totalVotes ?? null,
            language: item.language ?? null,
            kernelType: item.kernelType ?? item.scriptType ?? null,
            lastRunTime: item.lastRunTime ?? null,
            isPrivate: item.isPrivate ?? null,
          })),
          caution:
            'Read the notebook before reusing its approach. Vote count is popularity, not a ' +
            'correctness guarantee.',
        };
      }

      const cli = { ...kaggleCliVersion(), ...kaggleAuthState() };
      if (!cli.available) {
        throw new AuthRequiredError(
          null,
          'Kaggle credentials are not set and the official `kaggle` CLI is not installed. ' +
            onboardingGuidance(cli).note
        );
      }
      if (!cli.loggedIn) {
        throw new AuthRequiredError(
          null,
          'Kaggle credentials are not set and the `kaggle` CLI is not signed in. ' +
            onboardingGuidance(cli).note
        );
      }

      const rows = parseCsv(runKaggleCli(['kernels', 'list', '-s', search, '--csv']));
      const enriched = rows.map((row) => {
        const ref = row.ref ?? '';
        const slug = ref.includes('/') ? ref.split('/')[1] : ref;
        return {
          ref,
          title: row.title || null,
          author: row.author || null,
          url: ref ? `https://www.kaggle.com/code/${ref}` : null,
          totalVotes: row.totalVotes ? Number(row.totalVotes) : null,
          lastRunTime: row.lastRunTime || null,
          slug,
        };
      });
      if (sortBy === 'voteCount') {
        enriched.sort((a, b) => (b.totalVotes ?? -1) - (a.totalVotes ?? -1));
      } else if (sortBy === 'dateCreated') {
        enriched.sort((a, b) => String(b.lastRunTime || '').localeCompare(String(a.lastRunTime || '')));
      }
      const start = (page - 1) * 20;
      const items = enriched.slice(start, start + 20);

      return {
        query,
        via: 'kaggle-cli',
        cliVersion: cli.version,
        totalMatches: enriched.length,
        count: items.length,
        kernels: items,
        caution:
          'Read the notebook before reusing its approach. Vote count is popularity, not a ' +
          'correctness guarantee. This result came from the official CLI, which exposes fewer ' +
          'fields than the authenticated REST API.',
      };
    },
  },

  {
    name: 'kaggle_list_competitions',
    description:
      'List Kaggle competitions with deadlines, rewards and team counts, so you can judge ' +
      'whether a competition is still open and worth the remaining time. Uses the ' +
      'authenticated REST API when KAGGLE_USERNAME and KAGGLE_KEY are set, otherwise falls ' +
      'back to the official `kaggle` CLI when it is installed.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, maximum: 1000, default: 1 },
        search: { type: 'string', description: 'Optional keyword filter applied to competition titles.' },
      },
      required: [],
      additionalProperties: false,
    },
    handler: async (args) => {
      const page = requirePage(args.page);
      const search = typeof args.search === 'string' && args.search.trim() !== '' ? args.search.trim() : null;

      if (credentials()) {
        const payload = await apiGetJson(`/competitions/list?page=${page}`, { auth: true });
        let items = asArray(payload).map((raw) => unwrapProtobuf(raw));
        if (search) {
          const needle = search.toLowerCase();
          items = items.filter((item) => String(item.title ?? '').toLowerCase().includes(needle));
        }
        return {
          page,
          filter: search,
          via: 'rest',
          count: items.length,
          competitions: items.map((item) => ({
            ref: item.ref,
            title: item.title ?? null,
            url: item.url ?? (item.ref ? `https://www.kaggle.com/competitions/${item.ref}` : null),
            category: item.category ?? null,
            rewardQuantity: item.rewardQuantity ?? item.reward ?? null,
            rewardCurrency: item.rewardCurrency ?? null,
            enabledDate: item.enabledDate ?? null,
            deadline: item.deadline ?? null,
            teamCount: item.teamCount ?? null,
            userRank: item.userRank ?? null,
            userHasEntered: item.userHasEntered ?? null,
            isPrivate: item.isPrivate ?? null,
          })),
          caution:
            'Deadlines are reported by the Kaggle API in UTC. Convert before telling the user how ' +
            'long they have left.',
        };
      }

      const cli = { ...kaggleCliVersion(), ...kaggleAuthState() };
      if (!cli.available || !cli.loggedIn) {
        throw new AuthRequiredError(
          null,
          'Kaggle credentials are not set and the official `kaggle` CLI is ' +
            (cli.available ? 'not signed in' : 'not installed') + '. ' +
            onboardingGuidance(cli).note
        );
      }

      const cliArgs = ['competitions', 'list'];
      if (search) cliArgs.push('-s', search);
      cliArgs.push('--csv');
      const rows = parseCsv(runKaggleCli(cliArgs));
      const enriched = rows.map((row) => {
        const url = row.ref || '';
        const slug = url.split('/').filter(Boolean).pop() || url;
        return {
          ref: slug,
          title: slug,
          url: url || null,
          deadline: row.deadline ? row.deadline.replace(' ', 'T') + 'Z' : null,
          category: row.category || null,
          reward: row.reward || null,
          teamCount: row.teamCount ? Number(row.teamCount) : null,
          userHasEntered: row.userHasEntered === 'True',
          userRank: row.userRank ? Number(row.userRank) : null,
        };
      });
      const start = (page - 1) * 20;
      const items = enriched.slice(start, start + 20);

      return {
        page,
        filter: search,
        via: 'kaggle-cli',
        cliVersion: cli.version,
        totalMatches: enriched.length,
        count: items.length,
        competitions: items,
        caution:
          'Deadlines are reported in UTC by Kaggle; convert before telling the user how long ' +
          'they have left. Coming from the CLI, reward is a display string and userRank is 0 ' +
          'when the account has not entered.',
      };
    },
  },
];

/* ------------------------------------------------------------- protocol --- */

function textResult(payload, isError = false) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  const clipped =
    text.length > RESULT_CHAR_LIMIT
      ? `${text.slice(0, RESULT_CHAR_LIMIT)}\n\n[truncated at ${RESULT_CHAR_LIMIT} characters; narrow your query for the full result]`
      : text;
  return { content: [{ type: 'text', text: clipped }], isError };
}

async function dispatchTool(name, args) {
  const tool = TOOLS.find((item) => item.name === name);
  if (!tool) {
    return textResult(`Unknown tool: ${name}. Available: ${TOOLS.map((item) => item.name).join(', ')}`, true);
  }
  try {
    const payload = await tool.handler(args ?? {});
    return textResult(payload, false);
  } catch (error) {
    if (error instanceof AuthRequiredError || error instanceof UserInputError) {
      return textResult({ error: error.name, message: error.message, detail: error.detail ?? null }, true);
    }
    return textResult({ error: 'ToolExecutionError', message: error.message }, true);
  }
}

async function handle(message) {
  const { method, id, params } = message;

  switch (method) {
    case 'initialize':
      return {
        result: {
          protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : DEFAULT_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      };

    case 'tools/list':
      return {
        result: {
          tools: TOOLS.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        },
      };

    case 'tools/call':
      return { result: await dispatchTool(params?.name, params?.arguments) };

    case 'ping':
      return { result: {} };

    default:
      if (id === undefined || id === null) return null;
      return { error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

/**
 * stdin can close while a request is still awaiting the Kaggle API. Exit only once
 * every dispatched request has settled, so a client that pipes its requests and then
 * closes stdin still receives the responses.
 */
let inFlight = 0;
let stdinEnded = false;

function settle() {
  inFlight -= 1;
  if (stdinEnded && inFlight === 0) process.exit(0);
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newlineIndex = buffer.indexOf('\n');
  while (newlineIndex !== -1) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (line !== '') {
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
        newlineIndex = buffer.indexOf('\n');
        continue;
      }
      inFlight += 1;
      Promise.resolve(handle(parsed))
        .then((outcome) => {
          if (!outcome) return;
          if (parsed.id === undefined || parsed.id === null) return;
          write({ jsonrpc: '2.0', id: parsed.id, ...outcome });
        })
        .catch((error) => {
          if (parsed.id === undefined || parsed.id === null) return;
          write({
            jsonrpc: '2.0',
            id: parsed.id,
            error: { code: -32603, message: `Internal error: ${error.message}` },
          });
        })
        .finally(settle);
    }
    newlineIndex = buffer.indexOf('\n');
  }
});

process.stdin.on('end', () => {
  stdinEnded = true;
  if (inFlight === 0) process.exit(0);
});
process.on('uncaughtException', (error) => {
  process.stderr.write(`[kaggle-workbench] uncaught: ${error.stack ?? error.message}\n`);
  process.exit(1);
});
