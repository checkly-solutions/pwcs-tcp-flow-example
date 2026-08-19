// Type surface for launcher-client.mjs so the TypeScript specs get full
// checking. The runtime stays plain .mjs + JSDoc so it drops into any
// Node project.
import type { PeerCertificate } from 'node:tls'

export interface LauncherMessage {
  verb: string
  fields: Record<string, string>
}

export interface LauncherClientOptions {
  host: string
  port: number
  caPem?: string
  servername?: string
  timeoutMs?: number
}

export declare class LauncherClient {
  constructor (options: LauncherClientOptions)
  host: string
  port: number
  caPem?: string
  servername?: string
  timeoutMs: number
  peerCertificate: PeerCertificate | null
  connect (): Promise<PeerCertificate>
  login (user: string, pass: string): Promise<LauncherMessage>
  send (verb: string, fields?: Record<string, string | number>): void
  next (timeoutMs?: number): Promise<LauncherMessage>
  close (): Promise<void>
}
