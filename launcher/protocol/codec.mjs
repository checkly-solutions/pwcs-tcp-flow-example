// Wire format shared by the mock launcher gateway and the LauncherClient.
//
// Frame: 4-byte big-endian uint32 length prefix + UTF-8 payload.
// Payload grammar: "VERB key=value key2=value2" (values must not contain
// spaces — sessions are hex, seqs are integers, codes are identifiers).
//
// This stands in for your proprietary protocol. To adapt:
// replace encode/decode with your real framing (from a Wireshark capture)
// and formatMessage/parseMessage with your real message grammar. The
// FrameDecoder shape — feed raw TCP chunks, get complete frames back —
// carries over unchanged, and is the part that matters: TCP segments and
// coalesces at will, so 50 back-to-back frames rarely arrive as 50 reads.

const LENGTH_PREFIX_BYTES = 4
const MAX_FRAME_BYTES = 1024 * 1024

/** @param {string} payload @returns {Buffer} */
export function encodeFrame (payload) {
  const body = Buffer.from(payload, 'utf8')
  if (body.length > MAX_FRAME_BYTES) {
    throw new Error(`frame exceeds ${MAX_FRAME_BYTES} bytes`)
  }
  const frame = Buffer.allocUnsafe(LENGTH_PREFIX_BYTES + body.length)
  frame.writeUInt32BE(body.length, 0)
  body.copy(frame, LENGTH_PREFIX_BYTES)
  return frame
}

/**
 * Incremental frame extractor. Feed it raw socket chunks; it returns every
 * complete payload it can extract and buffers the remainder.
 */
export class FrameDecoder {
  #buffer = Buffer.alloc(0)

  /** @param {Buffer} chunk @returns {string[]} complete payloads */
  feed (chunk) {
    this.#buffer = Buffer.concat([this.#buffer, chunk])
    const payloads = []
    while (this.#buffer.length >= LENGTH_PREFIX_BYTES) {
      const length = this.#buffer.readUInt32BE(0)
      if (length > MAX_FRAME_BYTES) {
        throw new Error(`incoming frame of ${length} bytes exceeds limit`)
      }
      if (this.#buffer.length < LENGTH_PREFIX_BYTES + length) break
      payloads.push(this.#buffer.subarray(LENGTH_PREFIX_BYTES, LENGTH_PREFIX_BYTES + length).toString('utf8'))
      this.#buffer = this.#buffer.subarray(LENGTH_PREFIX_BYTES + length)
    }
    return payloads
  }
}

/** @param {string} verb @param {Record<string, string|number>} [fields] @returns {string} */
export function formatMessage (verb, fields = {}) {
  const parts = [verb]
  for (const [key, value] of Object.entries(fields)) {
    parts.push(`${key}=${value}`)
  }
  return parts.join(' ')
}

/** @param {string} payload @returns {{ verb: string, fields: Record<string, string> }} */
export function parseMessage (payload) {
  const [verb, ...rest] = payload.split(' ')
  /** @type {Record<string, string>} */
  const fields = {}
  for (const part of rest) {
    const eq = part.indexOf('=')
    if (eq > 0) fields[part.slice(0, eq)] = part.slice(eq + 1)
  }
  return { verb, fields }
}
