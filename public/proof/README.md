# Evidence screenshots

Screenshots referenced by `proof_image` in `data/sites.json`, served to the
proof page as packaged extension resources — no network request, and no host
page CSP to satisfy.

- **Filename**: the domain, e.g. `or-ad.com.webp`. Set `"proof_image":
  "or-ad.com.webp"` on that site's entry.
- **Format**: WebP, quality ~80, width 1200–1600. Budget roughly 30–80 KB each;
  these are committed to the repo.
- **Content**: the closure itself — the blocking page, modal, or disabled
  checkout — captured *during* Shabbat in Israel. A weekday screenshot of a
  normal storefront proves nothing.
- **Crop out** anything personal: logged-in state, cart contents, browser
  chrome showing other tabs.

Optional. Most listings rest on `evidence_text` alone, and the proof page says
plainly when no screenshot was captured rather than hiding the section.

`npm run validate` fails if `proof_image` names a file that is not here.
