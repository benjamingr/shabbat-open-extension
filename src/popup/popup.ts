/* Popup: shows the current tab's Shabbat status and exposes settings. */
import './popup.css'

import { applyStaticStrings, t } from '../i18n/index.ts'
import { sites } from '../lib/dataset.ts'
import { hostFromUrl, matchSite } from '../lib/domain.ts'
import { proofPageUrl } from '../lib/proof.ts'
import { getSettings, setSettings } from '../lib/settings.ts'
import { getShabbatWindow } from '../lib/shabbat.ts'
import { confidenceLabel, isStrong, meetsConfidence, statusLabel } from '../lib/site.ts'
import type { Settings } from '../types.ts'

type Field = 'alertSymbol' | 'minConfidence' | 'enabled'
const FIELDS: Field[] = ['alertSymbol', 'minConfidence', 'enabled']

type Input = HTMLInputElement | HTMLSelectElement

function field(id: Field): Input | null {
  return document.getElementById(id) as Input | null
}

function updateSymbolPreview(): void {
  const sel = field('alertSymbol')
  const prev = document.getElementById('symbolPreview')
  if (sel && prev) prev.textContent = t('settings.alertSymbolPreview', { symbol: sel.value })
}

async function loadFields(): Promise<void> {
  const settings = await getSettings()
  for (const name of FIELDS) {
    const el = field(name)
    if (!el) continue
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = !!settings[name]
    else el.value = String(settings[name])
  }
  updateSymbolPreview()
}

async function save(): Promise<void> {
  const patch: Record<string, unknown> = {}
  for (const name of FIELDS) {
    const el = field(name)
    if (!el) continue
    if (el instanceof HTMLInputElement && el.type === 'checkbox') patch[name] = el.checked
    else patch[name] = el.value
  }
  await setSettings(patch as Partial<Settings>)
  await render()
}

function pill(cls: string, text: string): HTMLElement {
  const el = document.createElement('span')
  el.className = 'pill ' + cls
  el.textContent = text
  return el
}

async function render(): Promise<void> {
  const settings: Settings = await getSettings()
  const win = getShabbatWindow(new Date(), settings.candleOffsetMin, settings.havdalahOffsetMin)

  const nowEl = document.getElementById('shabbat-now')
  if (nowEl) nowEl.textContent = t(win.active ? 'app.shabbatNow' : 'app.tagline')

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const body = document.getElementById('status-body')
  if (!body) return
  body.replaceChildren()

  const host = hostFromUrl(tab?.url)
  const site = matchSite(host, sites)

  if (!site) {
    const line = document.createElement('div')
    line.className = 'status-line'
    line.textContent = t(host ? 'popup.notListed' : 'popup.noTab')
    body.append(line)

    const row = document.createElement('div')
    row.className = 'pill-row'
    row.append(
      win.active
        ? pill('active', t('popup.pillActive'))
        : pill('none', t('popup.pillNone')),
    )
    body.append(row)
    return
  }

  const name = document.createElement('div')
  name.className = 'site-name'
  name.textContent = site.name || site.domain
  body.append(name)

  const line = document.createElement('div')
  line.className = 'status-line'
  line.textContent = statusLabel(site.status)
  body.append(line)

  const row = document.createElement('div')
  row.className = 'pill-row'
  row.append(
    isStrong(site)
      ? pill('closed', t('popup.pillClosed'))
      : pill('observant', t('popup.pillObservant')),
  )
  row.append(pill('confidence', confidenceLabel(site.confidence)))
  if (win.active) row.append(pill('active', t('popup.pillActive')))
  body.append(row)

  // The popup always reports what the dataset knows, even for a site the badge and
  // banner are suppressing — otherwise "why is there no badge here?" has no answer.
  if (!meetsConfidence(site, settings.minConfidence)) {
    const note = document.createElement('div')
    note.className = 'status-line'
    note.textContent = t('popup.belowThreshold')
    body.append(note)
  }

  const a = document.createElement('a')
  a.className = 'evidence'
  a.href = proofPageUrl(site)
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.textContent = t('popup.evidence')
  if (site.evidence_text) a.title = site.evidence_text
  body.append(a)
}

async function main(): Promise<void> {
  applyStaticStrings()
  await loadFields()
  await render()

  document.getElementById('open-options')?.addEventListener('click', () => {
    void chrome.runtime.openOptionsPage()
  })

  for (const name of FIELDS) {
    const el = field(name)
    if (!el) continue
    el.addEventListener('change', () => void save())
    if (name === 'alertSymbol') el.addEventListener('input', updateSymbolPreview)
  }
}

// The module script is deferred, so the DOM is already parsed by the time this runs.
void main()
