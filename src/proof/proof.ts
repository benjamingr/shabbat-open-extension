/*
 * Evidence page for one listing.
 *
 * An extension page rather than a link straight to the site, because the strongest
 * evidence — a screenshot of the closure page — only exists during Shabbat, which is
 * precisely when the reader is least likely to be looking. The live site is still
 * offered, as the check anyone can repeat.
 */
import './proof.css'

import '../lib/browser-polyfill.ts'
import { applyDocumentLang, applyStaticStrings, formatDate, setLang, t } from '../i18n/index.ts'
import { getDataset } from '../lib/dataset.ts'
import { normalizeHost } from '../lib/domain.ts'
import { appealFormUrl } from '../lib/forms.ts'
import { packagedProofImageUrl, remoteProofImageUrl } from '../lib/proof.ts'
import { getSettings } from '../lib/settings.ts'
import { confidenceLabel, isStrong, statusLabel } from '../lib/site.ts'
import type { Dataset, Site } from '../types.ts'

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null
}

function show(node: Element | null, visible: boolean): void {
  node?.classList.toggle('hidden', !visible)
}

function pill(cls: string, text: string): HTMLElement {
  const node = document.createElement('span')
  node.className = 'pill ' + cls
  node.textContent = text
  return node
}

function render(site: Site, data: Dataset): void {
  document.title = t('proof.titleFor', { name: site.name })

  const name = el('site-name')
  if (name) name.textContent = site.name
  const domain = el('site-domain')
  if (domain) domain.textContent = site.domain

  const pills = el('pills')
  if (pills) {
    pills.replaceChildren(
      isStrong(site)
        ? pill('closed', t('popup.pillClosed'))
        : pill('observant', t('popup.pillObservant')),
      pill('confidence', confidenceLabel(site.confidence)),
    )
  }

  // textContent throughout: every field here comes from a hand-edited JSON file.
  const quote = el('evidence-text')
  if (quote) quote.textContent = site.evidence_text

  const mechanism = el('mechanism')
  if (mechanism && site.mechanism) {
    mechanism.textContent = t('proof.mechanism', { mechanism: site.mechanism })
    show(mechanism, true)
  }

  const link = el<HTMLAnchorElement>('evidence-link')
  if (link) {
    link.href = site.evidence_url
    link.textContent = t('proof.openSite')
  }

  const card = el('screenshot-card')
  const image = el<HTMLImageElement>('screenshot')
  if (site.proof_image && image) {
    image.alt = t('proof.screenshotAlt', { name: site.name })
    showScreenshot(image, site)
  } else {
    // The section still appears, saying plainly that no screenshot was captured —
    // quietly hiding it would read as though one had been.
    show(image, false)
    show(el('screenshot-missing'), true)
  }
  show(card, true)

  const statusDefinition = el('status-definition')
  if (statusDefinition) statusDefinition.textContent = data.status_definitions[site.status]

  const confidenceDefinition = el('confidence-definition')
  if (confidenceDefinition) {
    confidenceDefinition.textContent = data.confidence_definitions[site.confidence]
  }

  const verified = el('verified-on')
  if (verified) verified.textContent = t('proof.verifiedOn', { date: formatDate(site.verified) })

  const appeal = el<HTMLAnchorElement>('appeal')
  if (appeal) appeal.href = appealFormUrl(site.domain, site.verified)

  show(el('content'), true)
}

/**
 * Prefer the packaged screenshot; fall back to the one in the repository.
 *
 * A listing that arrived by update has its screenshot in the repo but not in this build,
 * so the packaged URL 404s. Rather than probe first, the packaged URL is simply tried —
 * it is free and it is right for every listing that shipped — and `onerror` swaps in the
 * remote one. If that fails too, the page says no screenshot was captured, which is the
 * same thing it says for a listing that never had one.
 */
function showScreenshot(image: HTMLImageElement, site: Site): void {
  const packaged = packagedProofImageUrl(site)
  const remote = remoteProofImageUrl(site)

  image.addEventListener('error', () => {
    if (remote && image.src !== remote) {
      image.src = remote
      return
    }
    show(image, false)
    show(el('screenshot-missing'), true)
  })

  image.src = packaged ?? remote ?? ''
}

async function main(): Promise<void> {
  // Read before anything is written to the page: the whole page is rendered once.
  setLang((await getSettings()).lang)
  applyDocumentLang()
  applyStaticStrings()

  const data = await getDataset()
  const wanted = normalizeHost(new URLSearchParams(location.search).get('domain') ?? '')
  const site = data.sites.find((candidate) => normalizeHost(candidate.domain) === wanted)

  if (!site) {
    show(el('notfound'), true)
    return
  }
  render(site, data)
}

void main()
