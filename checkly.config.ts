import { defineConfig } from 'checkly'
import { BASE_TAGS, LOCATIONS } from './__checks__/env'

/**
 * PWCS TCP Flow Example
 *
 * Proves a Checkly Playwright Check Suite can monitor a proprietary
 * TLS-authenticated TCP login protocol: connect, handshake, send/receive
 * raw packet sequences, and validate the responses — not just reachability.
 */
export default defineConfig({
  projectName: 'PWCS TCP Flow Example',
  logicalId: 'pwcs-tcp-flow-example',
  checks: {
    activated: true,
    muted: false,
    locations: [...LOCATIONS],
    tags: [...BASE_TAGS],
    checkMatch: '**/__checks__/**/*.check.ts',
    ignoreDirectoriesMatch: ['node_modules/**'],
    // browserChecks.testMatch deliberately UNSET — a glob here would auto-create
    // duplicate Browser Checks from the launcher/tests/*.spec.ts files.
    // No runtimeId — the Playwright suite brings its own engine (see the construct);
    // TCP/SSL monitors have no runtime.
  },
  cli: {
    runLocation: 'us-east-1',
    reporters: ['list'],
    retries: 0,
  },
})
