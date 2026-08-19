// Single source of truth for the env contract on the spec side.
// Full table: ../../.env.example
import { LauncherClient } from '../protocol/launcher-client.mjs'

export function targetHost (): string {
  return process.env.GW_TARGET_HOST ?? '127.0.0.1'
}

export function targetPort (): number {
  return Number(process.env.GW_TARGET_PORT ?? 4443)
}

export function credentials (): { user: string, pass: string } {
  return {
    user: process.env.GW_USER ?? 'demo',
    pass: process.env.GW_PASS ?? 'demo-password',
  }
}

export function expectedCertCN (): string {
  return process.env.GW_EXPECT_CERT_CN ?? 'launcher.example.internal'
}

export function packetCount (): number {
  return Number(process.env.GW_PACKET_COUNT ?? 50)
}

export function minResponses (): number {
  return Number(process.env.GW_MIN_RESPONSES ?? 49)
}

export function maxBlastMs (): number {
  return Number(process.env.GW_MAX_BLAST_MS ?? 5000)
}

export function makeClient (): LauncherClient {
  return new LauncherClient({
    host: targetHost(),
    port: targetPort(),
    // Unset ⇒ demo mode (self-signed mock cert, verification off).
    // Set to your internal CA chain ⇒ strict verification, same client.
    caPem: process.env.GW_CA_PEM,
    // SNI / hostname-verification target — the mock's cert says
    // launcher.example.internal even though it listens on 127.0.0.1.
    servername: expectedCertCN(),
  })
}
