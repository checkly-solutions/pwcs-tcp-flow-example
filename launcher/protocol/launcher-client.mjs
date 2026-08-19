// LauncherClient — the artifact to adapt for the real launcher/viewer protocol.
//
// A generic TLS protocol client over node:tls: connect, authenticate with a
// LOGIN command, send/receive framed messages. Deliberately knows nothing
// about test orchestration (packet blasts live in the specs) so it stays a
// drop-in protocol client for any Node project, no TS toolchain required.

import tls from 'node:tls'
import { encodeFrame, FrameDecoder, formatMessage, parseMessage } from './codec.mjs'

export class LauncherClient {
  /** @type {import('node:tls').TLSSocket | null} */
  #socket = null
  #decoder = new FrameDecoder()
  /** @type {Array<{ verb: string, fields: Record<string, string> }>} */
  #inbox = []
  /** @type {Array<{ resolve: Function, reject: Function, timer: NodeJS.Timeout }>} */
  #waiters = []
  /** @type {Error | null} */
  #closedWith = null

  /**
   * @param {{ host: string, port: number, caPem?: string, servername?: string, timeoutMs?: number }} options
   */
  constructor ({ host, port, caPem, servername, timeoutMs = 10_000 }) {
    this.host = host
    this.port = port
    this.caPem = caPem
    this.servername = servername
    this.timeoutMs = timeoutMs
    /** @type {import('node:tls').PeerCertificate | null} */
    this.peerCertificate = null
  }

  /** Open the TLS connection and capture the peer certificate. */
  connect () {
    return new Promise((resolve, reject) => {
      const socket = tls.connect({
        host: this.host,
        port: this.port,
        // SNI + hostname verification target. The mock cert's CN is
        // launcher.example.internal even though it listens on 127.0.0.1.
        servername: this.servername,
        // Demo: the mock gateway boots with a self-signed cert, so
        // verification is off unless a CA is pinned. In production: export
        // your internal CA chain into GW_CA_PEM and verification is strict —
        // same client, zero code change.
        rejectUnauthorized: Boolean(this.caPem),
        ca: this.caPem ? [this.caPem] : undefined,
      }, () => {
        this.peerCertificate = socket.getPeerCertificate()
        resolve(this.peerCertificate)
      })
      socket.setTimeout(this.timeoutMs, () => socket.destroy(new Error(`socket timeout after ${this.timeoutMs}ms`)))
      socket.on('data', chunk => {
        for (const payload of this.#decoder.feed(chunk)) {
          this.#deliver(parseMessage(payload))
        }
      })
      socket.on('error', err => {
        this.#closedWith = err
        this.#flushWaiters(err)
        reject(err)
      })
      socket.on('close', () => {
        this.#closedWith ??= new Error('connection closed')
        this.#flushWaiters(this.#closedWith)
      })
      this.#socket = socket
    })
  }

  /**
   * Send LOGIN and return the gateway's parsed reply — OK or ERR. Callers
   * assert on the reply shape; a rejected login is a protocol answer, not
   * a transport failure.
   * @param {string} user @param {string} pass
   */
  async login (user, pass) {
    this.send('LOGIN', { user, pass })
    return this.next()
  }

  /** @param {string} verb @param {Record<string, string|number>} [fields] */
  send (verb, fields) {
    if (!this.#socket) throw new Error('not connected')
    this.#socket.write(encodeFrame(formatMessage(verb, fields)))
  }

  /**
   * Next inbound message, FIFO. Rejects after timeoutMs.
   * @param {number} [timeoutMs]
   * @returns {Promise<{ verb: string, fields: Record<string, string> }>}
   */
  next (timeoutMs = this.timeoutMs) {
    const queued = this.#inbox.shift()
    if (queued) return Promise.resolve(queued)
    if (this.#closedWith) return Promise.reject(this.#closedWith)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiters = this.#waiters.filter(w => w.timer !== timer)
        reject(new Error(`no message within ${timeoutMs}ms`))
      }, timeoutMs)
      this.#waiters.push({ resolve, reject, timer })
    })
  }

  /** Polite shutdown: BYE, then drop the socket. */
  async close () {
    if (!this.#socket) return
    try {
      this.send('BYE')
    } catch { /* socket may already be gone */ }
    this.#socket.end()
    this.#socket = null
  }

  /** @param {{ verb: string, fields: Record<string, string> }} message */
  #deliver (message) {
    const waiter = this.#waiters.shift()
    if (waiter) {
      clearTimeout(waiter.timer)
      waiter.resolve(message)
    } else {
      this.#inbox.push(message)
    }
  }

  /** @param {Error} err */
  #flushWaiters (err) {
    for (const waiter of this.#waiters.splice(0)) {
      clearTimeout(waiter.timer)
      waiter.reject(err)
    }
  }
}
