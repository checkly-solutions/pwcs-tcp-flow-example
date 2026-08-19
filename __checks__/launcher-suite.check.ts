// The core of this project: a Playwright Check Suite that TLS-authenticates,
// runs the launcher LOGIN handshake, and validates raw packet sequences —
// the workflow the TcpMonitor construct (see tcp-baseline.check.ts) cannot
// express. Self-contained: the mock gateway boots on the runner via the
// webServer block in launcher/playwright.config.ts.
//
// Notes on this construct type (checkly v8):
// - No retryStrategy / doubleCheck.
// - Runs from public locations (allowlist Checkly's published static IPs at
//   your firewall) or from a Private Location via the group block below.
// - Deploy prints a "webServer configuration detected" warning; it's answered
//   by the `include` patterns below, which bundle the server files that the
//   spec import graph can't see.
import { PlaywrightCheck, Frequency, Engine } from 'checkly/constructs'
import { BASE_TAGS, LOCATIONS } from './env'

// To run the suite from inside your network, pin it to a Private Location
// through a group (Checkly Agent >= 6.0.3, 2 CPU / 4 GB per container),
// then add `group: launcherGroup` to the check below:
// import { CheckGroupV2 } from 'checkly/constructs'
// const launcherGroup = new CheckGroupV2('launcher-protocol-group', {
//   name: 'Launcher Gateway — Private Location',
//   privateLocations: ['your-private-location-slug'],
// })

new PlaywrightCheck('launcher-protocol-suite', {
  name: 'Launcher Gateway — TLS Login & Packet Protocol Suite',
  tags: [...BASE_TAGS, 'kind:suite'],
  frequency: Frequency.EVERY_10M,
  locations: [...LOCATIONS],
  engine: Engine.node('24'), // explicit: matches local dev (v24), stable require(esm) for the .mjs protocol layer
  // Relative to THIS file:
  playwrightConfigPath: '../launcher/playwright.config.ts',
  // MUST equal projects[].name in launcher/playwright.config.ts verbatim —
  // a mismatch deploys green and silently runs zero tests.
  pwProjects: ['launcher-protocol'],
  // Relative to the playwright config's directory (launcher/). server/** is
  // mandatory (spawned by webServer.command, not imported anywhere);
  // protocol/** keeps the server's own imports independent of the spec graph.
  include: ['server/**', 'protocol/**'],
  // How to retarget the deployed suite at a real gateway behind your
  // firewall — no code change, no redeploy needed if set at account level:
  // environmentVariables: [
  //   { key: 'GW_TARGET_HOST', value: 'gateway.example.internal' },
  //   { key: 'GW_EXPECT_CERT_CN', value: 'gateway.example.internal' },
  //   { key: 'GW_USER', value: '{{GW_MONITOR_USER}}' },
  //   { key: 'GW_PASS', value: '{{GW_MONITOR_PASS}}' }, // secret, stored in Checkly
  // ],
})
