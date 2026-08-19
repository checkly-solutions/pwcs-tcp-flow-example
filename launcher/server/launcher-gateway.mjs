// Mock "launcher gateway" — stands in for the server behind the launcher/
// viewer client. TLS-terminated TCP speaking the toy framed protocol in
// ../protocol/codec.mjs:
//
//   pre-login:  LOGIN user=… pass=…  →  OK session=<12-hex> | ERR code=AUTH_FAILED
//               anything else        →  ERR code=NOT_AUTHENTICATED
//   post-login: PING seq=n           →  PONG seq=n   (GW_DROP_RATE simulates loss)
//               BYE                  →  connection closed
//               anything else        →  ERR code=UNKNOWN_VERB
//
// In production monitoring this process does not exist — the deployed suite
// either boots it on the Checkly runner (self-contained example) or skips it
// entirely when GW_TARGET_HOST points at a real gateway.

import tls from 'node:tls'
import { randomBytes } from 'node:crypto'
import selfsigned from 'selfsigned'
import { encodeFrame, FrameDecoder, formatMessage, parseMessage } from '../protocol/codec.mjs'

const PORT = Number(process.env.GW_TARGET_PORT ?? 4443)
const USER = process.env.GW_USER ?? 'demo'
const PASS = process.env.GW_PASS ?? 'demo-password'
const DROP_RATE = Number(process.env.GW_DROP_RATE ?? 0)
const CERT_CN = 'launcher.example.internal'

// Fresh self-signed cert on every boot: nothing on disk, nothing to bundle,
// nothing to expire. The client pins a CA only when GW_CA_PEM is set.
const pems = selfsigned.generate([{ name: 'commonName', value: CERT_CN }], {
  days: 365,
  keySize: 2048,
})

const server = tls.createServer({ key: pems.private, cert: pems.cert }, socket => {
  const decoder = new FrameDecoder()
  let authenticated = false

  const reply = (verb, fields) => socket.write(encodeFrame(formatMessage(verb, fields)))

  socket.on('data', chunk => {
    let payloads
    try {
      payloads = decoder.feed(chunk)
    } catch {
      socket.destroy()
      return
    }
    for (const payload of payloads) {
      const { verb, fields } = parseMessage(payload)
      if (!authenticated) {
        if (verb !== 'LOGIN') {
          reply('ERR', { code: 'NOT_AUTHENTICATED' })
        } else if (fields.user === USER && fields.pass === PASS) {
          authenticated = true
          reply('OK', { session: randomBytes(6).toString('hex') })
        } else {
          reply('ERR', { code: 'AUTH_FAILED' })
        }
        continue
      }
      switch (verb) {
        case 'PING':
          if (DROP_RATE > 0 && Math.random() < DROP_RATE) break // simulated loss
          reply('PONG', { seq: fields.seq })
          break
        case 'BYE':
          socket.end()
          break
        default:
          reply('ERR', { code: 'UNKNOWN_VERB' })
      }
    }
  })
  socket.on('error', () => socket.destroy())
})

// Playwright's webServer readiness probe polls with plain TCP connects that
// drop mid-handshake — expected noise, not a problem.
server.on('tlsClientError', () => {})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`launcher-gateway listening on 127.0.0.1:${PORT} (cn=${CERT_CN}, drop_rate=${DROP_RATE})`)
})
