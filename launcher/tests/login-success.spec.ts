// A scripted login check every 10 minutes, from two continents, without a
// human. TLS-authenticate the channel, then prove the auth plane answers a
// real LOGIN command with a real session.
import { test, expect } from '@playwright/test'
import { makeClient, credentials, expectedCertCN } from './helpers'

test('launcher login handshake succeeds over TLS', async () => {
  const client = makeClient()

  // TLS connect + in-protocol certificate validation (the same lens the
  // dedicated SslMonitor applies to public endpoints, here applied to the
  // gateway the launcher actually dials).
  const cert = await client.connect()
  expect(cert.subject.CN).toBe(expectedCertCN())
  expect(new Date(cert.valid_from).getTime()).toBeLessThanOrEqual(Date.now())
  expect(new Date(cert.valid_to).getTime()).toBeGreaterThan(Date.now())

  const { user, pass } = credentials()
  const reply = await client.login(user, pass)
  expect(reply.verb).toBe('OK')
  expect(reply.fields.session).toMatch(/^[0-9a-f]{12}$/)

  await client.close()
})
