// The firewall-whitelist half of the story: Checkly runners can open raw TLS
// sockets to arbitrary external host:port combinations — which is what lets
// this same suite reach a production gateway once its firewall allows
// Checkly's published static IPs (https://www.checklyhq.com/docs/monitoring/allowlisting/).
//
// tcpbin.com is a public TCP echo service (TLS on 4243, newline-delimited) —
// deliberately spoken to without our codec, since it's not our protocol.
// Severable: delete this file or set GW_SKIP_EXTERNAL=1 if the third party
// is down; the core suite does not depend on it.
import tls from 'node:tls'
import { test, expect } from '@playwright/test'

test.skip(process.env.GW_SKIP_EXTERNAL === '1', 'skipped via GW_SKIP_EXTERNAL')

test('runner opens raw TLS sockets to arbitrary external endpoints', async () => {
  const marker = 'checkly-egress-proof'
  const echoed = await new Promise<string>((resolve, reject) => {
    const socket = tls.connect({ host: 'tcpbin.com', port: 4243, rejectUnauthorized: false }, () => {
      socket.write(`${marker}\n`)
    })
    socket.setTimeout(15_000, () => socket.destroy(new Error('tcpbin.com echo timeout')))
    let data = ''
    socket.on('data', chunk => {
      data += chunk.toString('utf8')
      if (data.includes('\n')) {
        socket.end()
        resolve(data)
      }
    })
    socket.on('error', reject)
  })
  expect(echoed).toContain(marker)
})
