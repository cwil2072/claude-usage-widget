#!/usr/bin/env node
const axios = require('axios');

const CLAUDE_BASE_URL = 'https://claude.ai';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function parseArgs(argv) {
  const options = {
    sessionKey: process.env.CLAUDE_SESSION_KEY || '',
    organizationId: process.env.CLAUDE_ORGANIZATION_ID || '',
    json: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--session-key' || arg === '-s') {
      options.sessionKey = argv[i + 1] || '';
      i += 1;
    } else if (arg === '--organization-id' || arg === '--org' || arg === '-o') {
      options.organizationId = argv[i + 1] || '';
      i += 1;
    }
  }

  return options;
}

function printHelp() {
  console.log(`Claude Usage CLI

Usage:
  node cli.js --session-key <sessionKey> [--organization-id <orgId>] [--json]
  npm run cli -- --session-key <sessionKey> [--organization-id <orgId>] [--json]

Options:
  -s, --session-key       Claude sessionKey cookie value
  -o, --organization-id   Claude organization UUID/ID (optional; auto-resolved if missing)
      --json              Output raw usage JSON
  -h, --help              Show help

Environment variables:
  CLAUDE_SESSION_KEY
  CLAUDE_ORGANIZATION_ID
`);
}

function getHeaders(sessionKey) {
  return {
    Cookie: `sessionKey=${sessionKey}`,
    'User-Agent': USER_AGENT
  };
}

async function resolveOrganizationId(sessionKey, preferredOrganizationId) {
  const response = await axios.get(`${CLAUDE_BASE_URL}/api/organizations`, {
    headers: getHeaders(sessionKey)
  });

  const organizations = Array.isArray(response.data) ? response.data : [];
  if (organizations.length === 0) {
    throw new Error('No organizations returned by Claude API');
  }

  if (preferredOrganizationId) {
    const match = organizations.find(org =>
      org.uuid === preferredOrganizationId || org.id === preferredOrganizationId
    );
    if (match) {
      return match.uuid || match.id;
    }
  }

  return organizations[0].uuid || organizations[0].id;
}

function formatTime(resetsAt) {
  if (!resetsAt) return 'n/a';
  const resetTime = new Date(resetsAt).toLocaleString();
  return `${resetsAt} (${resetTime})`;
}

function printSummary(data, organizationId) {
  const session = data.five_hour || {};
  const weekly = data.seven_day || {};
  const sonnet = data.seven_day_sonnet || {};

  console.log(`Organization: ${organizationId}`);
  console.log(`Fetched: ${new Date().toISOString()}`);
  console.log('');
  console.log(`Current Session: ${(session.utilization || 0).toFixed(1)}%`);
  console.log(`  Resets at: ${formatTime(session.resets_at)}`);
  console.log(`Weekly All Models: ${(weekly.utilization || 0).toFixed(1)}%`);
  console.log(`  Resets at: ${formatTime(weekly.resets_at)}`);
  console.log(`Weekly Sonnet: ${(sonnet.utilization || 0).toFixed(1)}%`);
  console.log(`  Resets at: ${formatTime(sonnet.resets_at)}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (!options.sessionKey) {
    console.error('Missing session key. Pass --session-key or set CLAUDE_SESSION_KEY.');
    process.exit(1);
  }

  try {
    const organizationId = await resolveOrganizationId(options.sessionKey, options.organizationId);
    const response = await axios.get(
      `${CLAUDE_BASE_URL}/api/organizations/${organizationId}/usage`,
      { headers: getHeaders(options.sessionKey) }
    );

    if (options.json) {
      console.log(JSON.stringify({
        organizationId,
        fetchedAt: new Date().toISOString(),
        usage: response.data
      }, null, 2));
      return;
    }

    printSummary(response.data, organizationId);
  } catch (error) {
    if (error.response) {
      console.error(`Claude API error: ${error.response.status} ${error.response.statusText}`);
      process.exit(2);
    }
    console.error(`Request failed: ${error.message}`);
    process.exit(2);
  }
}

main();
