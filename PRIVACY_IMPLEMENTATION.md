# Exo Zenth privacy implementation

Implemented November 17, 2026 from the approved Phase 1 audit and Phase 2 decisions.

## Installed services

- Cloudflare Pages delivers the static site. A root `404.html` replaces its implicit homepage fallback for unknown URLs. Existing `_redirects` are preserved.
- GA4 `G-N4HV60F9CG` loads only after Accept on `exozenth.com` or `www.exozenth.com`. The shared controller is included on all 22 HTML source files, including canonical pages, URL variants, privacy, contact and the 404 page.
- Consent Mode v2's four storage/advertising defaults are queued denied before Google loads. Accept grants analytics storage only; advertising signals remain denied. Google signals and advertising personalization are disabled in the GA4 configuration.
- Custom `outbound_link_click` events contain only `link_url` and `page_path`. Mail/email links and form contents are excluded. Account-side enhanced measurement settings were not inspected.
- YouTube uses `youtube-nocookie.com`; neither its iframe URL nor its API script loads before Accept. The initial video is cued without autoplay. Clicking a preset starts it muted. Native player controls permit manual unmute. Spotify iframe URLs are assigned only after Accept.
- Space Mono, DM Sans and Bebas Neue are self-hosted as WOFF2 assets; their OFL licenses are in `assets/fonts/`.
- Contact is a native HTML POST to `https://formspree.io/f/mkjrrvzj`, with email, optional name, request type, message and a `_gotcha` honeypot. No form script or CAPTCHA is installed in site source. Formspree's account-side security behavior still requires a real submission check.
- Public privacy email links are wrapped in Cloudflare `email_off` tags. No global email-obfuscation setting was changed.
- No Meta Pixel, campaign attribution record, or analytics debug storage is installed.

## Consent and security

`assets/consent.js` and `assets/consent.css` adapt DrumZombie's implementation with Exo-specific names and a native, keyboard-accessible dialog. The only site-created persistent record is `exozenth_consent_v1` in local storage, holding a choice and an expiry 183 days later.

Only `navigator.globalPrivacyControl === true` triggers the GPC path. GPC writes Reject, suppresses the automatic dialog, disables Accept in Cookie settings, and displays the approved explanation. Reject removes accessible first-party GA/Meta cookies and legacy/provider campaign/debug records, then reloads. These cleanup names are not evidence that Exo installs those older integrations. Clearing site storage in another tab also forces re-evaluation.

Tracking scripts are independent of the dialog. Blocking GA4 does not prevent Accept/Reject or Cookie settings from working. The CSP permits only the installed Google tag, YouTube API, YouTube/Spotify frames, and GA4 collection destinations. Firefox checks identified `https://www.google.com/g/collect` as an additional GA4 collection endpoint; only that path is allowed on that host. External player subdocuments enforce their own provider policies.

The Cloudflare wildcard CORS header is detached. Same-origin scripts/fonts and a normal cross-origin form navigation do not need it. CSP blocks unsolicited analytics script injection, including Cloudflare Insights if later enabled at the hosting layer. No Cloudflare dashboard setting was changed.

## Checks and evidence

- `node tests/privacy-static.mjs`: checks all 22 HTML files, local assets, policy structure, contact endpoint, fonts, CSP, denied defaults, exact-boolean GPC, unavailable storage, expired/invalid records and production-host boundaries.
- `node tests/privacy-browser.mjs`: isolated regular Chrome/Edge profiles. Default mode fulfills first-party requests from local source at the production origin; it is explicitly not production verification. Tests pre-consent page coverage, Accept, outbound payload, players, withdrawal, simulated GPC, blocked GA4, preview hosts, no-JavaScript contact markup and a missing route.
- `node tests/privacy-firefox.mjs`: native Firefox WebDriver BiDi, Strict protection, separate normal/private profiles. GPC is read from the browser, never simulated. Default mode uses local first-party response fulfillment.
- Adding `--live` to either browser command checks actual production without local fulfillment. Browser results identify their mode. Cookie values are omitted; names, domains and expirations are recorded. Edge's Bing/MSN startup cookies are separated from site/provider cookies.
- Mobile and desktop screenshots are written to the OS temporary directory by the Chrome/Edge checks.

The local and production evidence files are separate. The privacy cookie table must only label values as observed on production once actual deployment checks have run. No claim of a no-JavaScript submission success should be made from markup inspection alone.

## Differences from DrumZombie

Exo has a distinct consent key, GA4 property and privacy page. It has no Meta, campaign/debug storage, SoundCloud embeds, server redirect function or mailing-list signup. Exo's dedicated contact form is new; DrumZombie's reference had a privacy email and a mailing-list form but no `/contact/` page. Exo videos require a click to play and start muted rather than automatically playing after Accept. Both sites keep streaming links available without optional consent.
