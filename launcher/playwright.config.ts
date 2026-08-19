import { defineConfig } from '@playwright/test'

// Unset GW_TARGET_HOST ⇒ boot the mock launcher gateway alongside the tests
// (locally AND on the Checkly runner — env is read at Playwright load time).
// Set it ⇒ the same specs dial a real gateway and no mock is started; that's
// how the deployed suite is retargeted at a firewalled production endpoint
// without touching code (construct environmentVariables or account env vars).
const targetHost = process.env.GW_TARGET_HOST
const port = Number(process.env.GW_TARGET_PORT ?? 4443)

export default defineConfig({
  timeout: 30_000,
  projects: [
    {
      // Referenced verbatim as pwProjects in __checks__/launcher-suite.check.ts —
      // a mismatch there deploys fine but runs zero tests.
      name: 'launcher-protocol',
      testDir: './tests',
    },
  ],
  webServer: targetHost
    ? undefined
    : {
        command: 'node server/launcher-gateway.mjs', // cwd = this config's directory
        port, // raw TCP connect poll — correct readiness probe for a non-HTTP server
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
})
