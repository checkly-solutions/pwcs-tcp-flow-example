// The ceiling of the TcpMonitor construct today — one connect, one raw
// payload, one response-data assertion, and no TLS knob at all (TcpRequest
// is hostname/port/ipFamily/data/assertions). Raw-TCP send/assert, pointed
// at a public TCP echo service. Everything past this line is why the
// Playwright suite in launcher-suite.check.ts exists.
//
// Severable: delete this file to drop the monitor on next deploy.
import { Frequency, TcpAssertionBuilder, TcpMonitor } from 'checkly/constructs'
import { BASE_TAGS, LOCATIONS } from './env'

new TcpMonitor('tcp-baseline', {
  name: 'TCP Baseline — raw data send/assert (tcpbin.com echo)',
  tags: [...BASE_TAGS, 'kind:baseline'],
  frequency: Frequency.EVERY_10M,
  locations: [...LOCATIONS],
  degradedResponseTime: 2_000,
  maxResponseTime: 5_000,
  request: {
    hostname: 'tcpbin.com',
    port: 4242, // plain TCP — the construct cannot speak TLS (4243 is the TLS echo)
    data: 'TCP-BASELINE-PROBE\n',
    assertions: [
      TcpAssertionBuilder.responseData().contains('TCP-BASELINE-PROBE'),
      TcpAssertionBuilder.responseTime().lessThan(2_000),
    ],
  },
})
