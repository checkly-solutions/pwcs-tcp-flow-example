# PWCS TCP Flow Example

Monitoring a proprietary TCP protocol with a Checkly Playwright Check Suite:
TLS-authenticate, run the login handshake as raw packets, send 50 sequenced
packets, require at least 49 back — not just "the port is open." The specs are
pure `node:tls` (no browser); a mock gateway boots via Playwright's `webServer`,
so the suite runs identically on a laptop, on Checkly's cloud runners, and on a
Private Location inside your network.

| Requirement | Proven in |
|---|---|
| TLS-authenticate, then drive login commands as raw packets | `login-success.spec.ts` + `launcher/protocol/launcher-client.mjs` |
| Send 50 packets, require ≥49 back — sequenced, no duplicates, latency budget | `packet-blast.spec.ts` |
| Payload-level validation: TCP/TLS up but auth broken must go red | `login-rejected.spec.ts` |
| Runners can reach arbitrary non-HTTP endpoints | `external-tls-egress.spec.ts` |
| Raw-TCP baseline for contrast (TcpMonitor has no TLS option) | `__checks__/tcp-baseline.check.ts` |
| Post-deploy certificate validation | `__checks__/ssl-cert.check.ts` + `getPeerCertificate()` asserts in `login-success.spec.ts` |

## Run it

```bash
cp .env.example .env   # fill CHECKLY_API_KEY + CHECKLY_ACCOUNT_ID (or `npx checkly login`)
npm install
npm run test:local     # 4 specs against the mock, ~1s
npm run test:cloud     # same suite on Checkly's cloud runners
npm run deploy         # creates the 3 checks: suite (10 min), TCP baseline (10 min), SSL (12 h)
```

The checkly CLI reads `.env` from the project root automatically; values
exported in your shell win.

## Layout

| Path | Role |
|---|---|
| `launcher/protocol/launcher-client.mjs` | Generic TLS protocol client (connect/login/send/next) — **the file to adapt** |
| `launcher/protocol/codec.mjs` | Length-prefixed framing + `VERB key=value` grammar; `FrameDecoder` handles TCP segmentation |
| `launcher/server/launcher-gateway.mjs` | Mock gateway: self-signed TLS at boot, login state machine, `GW_DROP_RATE` loss knob |
| `launcher/tests/` | The four specs |
| `__checks__/` | The Checkly constructs |

## Point it at a real gateway

No code changes — set env vars on the construct (`environmentVariables` in
`__checks__/launcher-suite.check.ts`) or account-wide (`npx checkly env add`):

| Var | Default | Effect |
|---|---|---|
| `GW_TARGET_HOST` | *(unset ⇒ mock)* | Set ⇒ webServer skipped, specs dial this host |
| `GW_TARGET_PORT` | `4443` | Gateway port |
| `GW_USER` / `GW_PASS` | `demo` / `demo-password` | Store real creds as Checkly **secrets** |
| `GW_EXPECT_CERT_CN` | `launcher.example.internal` | Asserted peer-cert CN; also the SNI servername |
| `GW_CA_PEM` | *(unset ⇒ no verify)* | Your CA chain ⇒ strict TLS verification, same client |

Full table incl. blast thresholds: `.env.example`. A local `.env` feeds CLI
commands only — the deployed check reads construct/account env vars.

The SSL monitor is separate: set `SSL_TARGET_HOST` in `.env` to point
`__checks__/ssl-cert.check.ts` at your own endpoint. That one is read at
**deploy** time (it configures the monitor), so it needs a redeploy to change.

**Where it runs from:** public locations by default — allowlist
[Checkly's static IPs](https://www.checklyhq.com/docs/monitoring/allowlisting/)
at the firewall. To run from inside the network instead, pin the suite to a
[Private Location](https://www.checklyhq.com/docs/platform/private-locations/overview)
via a group — uncomment the block in `__checks__/launcher-suite.check.ts`
(Checkly Agent ≥ 6.0.3, 2 CPU / 4 GB per container).

Then adapt the protocol:

1. Capture a real login exchange (Wireshark) between launcher and gateway.
2. Swap `codec.mjs`'s framing/grammar for the real wire format; keep the `FrameDecoder` feed/extract shape.
3. Make `LauncherClient.login()` send the real auth sequence.
4. Set `GW_TARGET_*`, pin your CA via `GW_CA_PEM`, move creds to Checkly secrets.
5. Delete `launcher/server/` and the `webServer` block (or keep them for local dev).
6. Scale out in TypeScript: loop over endpoints — one suite per gateway.

## Prove it fails

```bash
./demo.sh working          # local, all green
./demo.sh break            # 20% packet loss → "expected at least 49 of 50 responses"
./demo.sh break-auth       # gateway UP, TLS UP, auth BROKEN — reachability stays green, specs go red
./demo.sh working --cloud  # green on Checkly's cloud runners (recorded session)
./demo.sh break   --cloud  # red on cloud runners, shareable result link
```

All verbs are local or session-scoped. To break the **deployed** suite:
`npx checkly env add GW_DROP_RATE 0.2` → red on the next run; undo with
`npx checkly env rm GW_DROP_RATE`.

## Limitations

- No `retryStrategy` / `doubleCheck` on this construct type.
- `tcp-baseline.check.ts` and the egress spec hit third-party `tcpbin.com` —
  severable: delete the file / set `GW_SKIP_EXTERNAL=1`.

## Troubleshooting

- **"webServer configuration detected" on deploy** — expected; answered by `include: ['server/**', 'protocol/**']`, which bundles what the spec import graph can't see.
- **Suite green but 0 tests ran** — `pwProjects` must equal the Playwright project `name` (`launcher-protocol`) verbatim for this configuration.  Modify the configs to change for your setup.
- **`Cannot find package '<x>'` on a cloud/Private Location run, but fine locally** — packages the suite needs at run time must be in `devDependencies`. That's why `selfsigned` lives there.
- **tcpbin.com red** — the third-party echo service is down, not your gateway; severable as above.
- **`EADDRINUSE` on 4443** — something else owns the port; set `GW_TARGET_PORT`.
