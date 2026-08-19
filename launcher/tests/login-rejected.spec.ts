// Payload-level validation a reachability monitor can never do: here TCP and
// TLS both SUCCEED — to a port/status check the gateway looks perfectly
// healthy — and the protocol still rejects the login. Distinguishing
// "gateway up" from "auth plane broken" requires speaking the protocol.
import { test, expect } from '@playwright/test'
import { makeClient, credentials } from './helpers'

test('login with bad credentials is rejected at the protocol level', async () => {
  const client = makeClient()
  await client.connect()

  const reply = await client.login(credentials().user, 'wrong-password-on-purpose')
  expect(reply.verb).toBe('ERR')
  expect(reply.fields.code).toBe('AUTH_FAILED')

  await client.close()
})
