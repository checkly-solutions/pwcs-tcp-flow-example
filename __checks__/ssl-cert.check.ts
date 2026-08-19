// Post-deploy certificate validation: after a cert rollout, verify the
// endpoint actually serving it is good — expiry runway, trusted chain,
// hostname match. The launcher suite additionally does in-protocol cert
// inspection (getPeerCertificate) on the gateway itself.
//
// Set SSL_TARGET_HOST in your .env to point this at your own endpoint. Note
// this one is read by the CLI at DEPLOY time (it configures the monitor),
// unlike the GW_* vars, which the specs read at RUN time on the location.
//
// Severable: delete this file to drop the monitor on next deploy.
import { Frequency, SslAssertionBuilder, SslMonitor } from 'checkly/constructs'
import { BASE_TAGS, LOCATIONS } from './env'

const SSL_TARGET_HOST = process.env.SSL_TARGET_HOST ?? 'www.checklyhq.com'

new SslMonitor('ssl-cert', {
  name: `SSL — ${SSL_TARGET_HOST} certificate health`,
  tags: [...BASE_TAGS, 'kind:cert'],
  frequency: Frequency.EVERY_12H,
  locations: [...LOCATIONS],
  request: {
    hostname: SSL_TARGET_HOST,
    port: 443,
    sslConfig: {
      alertDaysBeforeExpiry: 30,
    },
    assertions: [
      SslAssertionBuilder.certificate('daysUntilExpiry').greaterThan(21),
      SslAssertionBuilder.connection('chainTrusted').equals(true),
      SslAssertionBuilder.connection('hostnameVerified').equals(true),
    ],
  },
})
