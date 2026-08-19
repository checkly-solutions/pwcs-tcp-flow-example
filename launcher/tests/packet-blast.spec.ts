// The acceptance contract: send 50 packets, require at least 49 back.
// Login, blast N framed PINGs back-to-back, and validate the response
// stream — count, sequence integrity, no duplicates, latency budget.
import { test, expect } from '@playwright/test'
import { makeClient, credentials, packetCount, minResponses, maxBlastMs } from './helpers'

test('packet blast: send 50, expect at least 49 sequenced responses', async () => {
  const client = makeClient()
  await client.connect()

  const { user, pass } = credentials()
  const login = await client.login(user, pass)
  expect(login.verb).toBe('OK')

  const count = packetCount()
  const started = Date.now()
  for (let seq = 0; seq < count; seq++) {
    client.send('PING', { seq })
  }

  // Collect PONGs until we have them all or the stream goes idle for 2s.
  // TCP will segment/coalesce these 50 frames arbitrarily — reassembly is
  // the FrameDecoder's job, which is exactly the part a real capture-replay
  // implementation has to get right.
  const received = new Set<number>()
  try {
    while (received.size < count) {
      const message = await client.next(2_000)
      if (message.verb !== 'PONG') continue
      const seq = Number(message.fields.seq)
      expect(seq, 'response seq must be one we sent').toBeGreaterThanOrEqual(0)
      expect(seq, 'response seq must be one we sent').toBeLessThan(count)
      expect(received.has(seq), `duplicate response for seq=${seq}`).toBe(false)
      received.add(seq)
    }
  } catch (err) {
    // Idle cutoff — score what came back. Anything else is a real failure.
    if (!(err instanceof Error) || !err.message.includes('no message within')) throw err
  }
  const elapsedMs = Date.now() - started

  const summary = `${received.size}/${count} responses in ${elapsedMs}ms `
    + `(~${Math.round(received.size / (elapsedMs / 1000))} frames/sec)`
  console.log(`packet blast: ${summary}`)
  test.info().annotations.push({ type: 'packet-blast', description: summary })

  expect(received.size, `expected at least ${minResponses()} of ${count} responses`)
    .toBeGreaterThanOrEqual(minResponses())
  expect(elapsedMs, 'blast latency budget').toBeLessThan(maxBlastMs())

  await client.close()
})
