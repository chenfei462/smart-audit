# Deployment Guide

## Recommended topology

- Reverse proxy or gateway in front of the AuditLens web service
- AuditLens application node with local `data/platform.db`
- Optional managed database sources reachable only from approved networks
- Optional outbound AI access from server side only

## Environment split

- Public demo environment: used only for briefing, roadshow, and PoC opportunity capture
- Government PoC environment: single-tenant deployment in government cloud or private environment

Do not use the public demo environment to process real government business data.

## Runtime config

`config/runtime.local.json` controls deployment policy in addition to host and port. It must not contain secret values.
`config/runtime.local.env` carries local runtime secrets that are injected into the process. In hosted environments, inject the same variables through the platform secret manager instead.

Required or operationally important fields:

- `environmentMode`: one of `local`, `public_demo`, or `government_poc`
- `platformDataDir`: writable base directory for runtime data such as `platform.db`
- `secureCookies`: set to `true` behind HTTPS
- `allowPublicRegistration`: keep `false` for public demo and PoC environments
- `aiEnabled`: `true` for public demo when AI explanation is allowed, `false` for PoC by default
- `publicDemoMode`: `true` for public demo, `false` for private PoC
- `multimodalProvider`: use `local` for the local OCR / ASR bridge
- `ocrEnabled` / `speechEnabled`: enable local OCR and speech recognition
- `ocrApiUrl` / `speechApiUrl`: local bridge endpoints, defaulting to `http://127.0.0.1:8090/ocr` and `http://127.0.0.1:8090/speech`

Secret environment variables:

- `AUDITLENS_SESSION_SECRET`: base64 string used for persistent session signing
- `AUDITLENS_AI_API_KEY`: optional AI provider key, required only when AI is enabled
- `AUDITLENS_OCR_API_KEY` / `AUDITLENS_SPEECH_API_KEY`: optional multimodal bearer tokens
- `AUDITLENS_CONNECTOR_SECRET_<PROFILE_ID>`: connector credential secret, with UUID hyphens converted to underscores and the whole profile id uppercased

## Startup

1. Build the service with `cargo build --release`.
2. Set the working directory to the repo root so `data/` and `static/` resolve correctly.
3. For local quick-start, run `scripts/start-local.cmd`.
4. If you start components separately, first run `scripts/start-multimodal.cmd`, then start the web service.
5. Put the service behind HTTPS before exposing it to users.
6. For `government_poc`, set `secureCookies=true` and make the reverse proxy forward `X-Forwarded-Proto=https`.

## Windows ports (8081/8090) troubleshooting

Some Windows environments reserve or exclude port ranges and may reject binding to `8081` / `8090` with:

- `os error 10013`
- `WinError 10013`

AuditLens local scripts probe fallback ports:

- Web: `8081 -> 18080 -> 28080`
- Multimodal bridge: `8090 -> 18090 -> 28090`

To inspect excluded ranges:

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

If all candidate ports are unavailable, `scripts/init-local.cmd` will fail with a clear message and the command above.

## First-run flow

1. Run `scripts/init-local.cmd` or `scripts/init-local.ps1` to create `config/runtime.local.json` and `config/runtime.local.env`.
2. Start the web service.
3. If the environment is empty, initialize the first tenant admin once.
4. For public demo, keep self-registration disabled after initialization.
5. Configure AI only if the deployment policy allows it.
6. Create `auditor` and `viewer` accounts for the organization.

## Government rollout path

### Public demo

- `environmentMode=public_demo`
- `secureCookies=false`
- `allowPublicRegistration=false`
- `publicDemoMode=true`
- `aiEnabled=true` only if the customer accepts internet AI during early briefing
- `ocrEnabled=true` / `speechEnabled=true` only if the demo machine has the local bridge installed
- Use only desensitized sample data
- Generic file import, batch import, connector import, and evidence upload are disabled by code

### Government PoC

- `environmentMode=government_poc`
- `secureCookies=true`
- `allowPublicRegistration=false`
- `publicDemoMode=false`
- `aiEnabled=false` by default
- `ocrEnabled=true` / `speechEnabled=true` when local OCR / ASR evidence collection is required
- Start with desensitized sample data, then import a controlled real-data subset in the private environment
- Non-local HTTP access is rejected unless the proxy forwards `X-Forwarded-Proto=https`

## Reverse proxy templates

Nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:18080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
}
```

IIS URL Rewrite should forward to the actual `runtime.local.json` port and preserve:

- `Host`
- `X-Forwarded-For`
- `X-Forwarded-Proto=https`

## Security notes

- Do not expose database credentials to non-admin roles.
- Route all AI calls through the server; end users must not see provider keys.
- Back up `data/platform.db` before upgrades.
- Treat `config/runtime.local.json` as deployment policy only and `config/runtime.local.env` as sensitive because it contains the session secret and any injected API keys.
- Do not expose the admin bootstrap flow once a public-facing environment has been initialized.
