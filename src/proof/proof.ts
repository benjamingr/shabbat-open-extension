/*
 * Evidence page for one listing.
 *
 * An extension page rather than a link straight to the site, because the strongest
 * evidence — a screenshot of the closure page — only exists during Shabbat, which is
 * precisely when the reader is least likely to be looking. The live site is still
 * offered, as the check anyone can repeat.
 */
import './proof.css'

import { applyStaticStrings, t } from '../i18n/index.ts'
import { dataset, sites } from '../lib/dataset.ts'
import { normalizeHost } from '../lib/domain.ts'
import { appealFormUrl } from '../lib/forms.ts'
import { confidenceLabel, isStrong, statusLabel } from '../lib/site.ts'
import type { Site } from '../types.ts'

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

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('he-IL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

function render(site: Site): void {
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
    // A packaged resource, so no network request and no host-page CSP to satisfy.
    image.src = chrome.runtime.getURL(`proof/${site.proof_image}`)
    image.alt = t('proof.screenshotAlt', { name: site.name })
  } else {
    // The section still appears, saying plainly that no screenshot was captured —
    // quietly hiding it would read as though one had been.
    show(image, false)
    show(el('screenshot-missing'), true)
  }
  show(card, true)

  const statusDefinition = el('status-definition')
  if (statusDefinition) statusDefinition.textContent = dataset.status_definitions[site.status]

  const confidenceDefinition = el('confidence-definition')
  if (confidenceDefinition) {
    confidenceDefinition.textContent = dataset.confidence_definitions[site.confidence]
  }

  const verified = el('verified-on')
  if (verified) verified.textContent = t('proof.verifiedOn', { date: formatDate(site.verified) })

  const appeal = el<HTMLAnchorElement>('appeal')
  if (appeal) appeal.href = appealFormUrl(site.domain, site.verified)

  show(el('content'), true)
}

function main(): void {
  applyStaticStrings()

  const wanted = normalizeHost(new URLSearchParams(location.search).get('domain') ?? '')
  const site = sites.find((candidate) => normalizeHost(candidate.domain) === wanted)

  if (!site) {
    show(el('notfound'), true)
    return
  }
  render(site)
}

main()
