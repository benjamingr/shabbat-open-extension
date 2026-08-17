/* Popup: shows the current tab's Shabbat status and exposes settings. */
import './popup.css'

import { sites } from '../lib/dataset.ts'
import { hostFromUrl, matchSite } from '../lib/domain.ts'
import { getSettings } from '../lib/settings.ts'
import { getShabbatWindow } from '../lib/shabbat.ts'
import { CONFIDENCE_LABEL_HE, isStrong, STATUS_LABEL_HE } from '../lib/site.ts'
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
  if (sel && prev) prev.textContent = `${sel.value} שימו לב · האתר סגור בשבת ${sel.value}`
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

function clamp(value: string, lo: number, hi: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, Math.round(n)))
}

async function save(): Promise<void> {
  const patch: Record<string, unknown> = {}
  for (const name of FIELDS) {
    const el = field(name)
    if (!el) continue
    if (el instanceof HTMLInputElement && el.type === 'checkbox') patch[name] = el.checked
    else if (el instanceof HTMLInputElement && el.type === 'number') {
      const n = clamp(el.value, 0, 120)
      patch[name] = n
      el.value = String(n)
    } else patch[name] = el.value
  }
  await chrome.storage.sync.set(patch)
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
  if (nowEl) {
    nowEl.textContent = win.active
      ? 'כעת שבת בישראל'
      : 'מסמן אתרים ישראליים שסגורים בשבת'
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const body = document.getElementById('status-body')
  if (!body) return
  body.replaceChildren()

  const host = hostFromUrl(tab?.url)
  const site = matchSite(host, sites)

  if (!site) {
    const line = document.createElement('div')
    line.className = 'status-line'
    line.textContent = host
      ? 'האתר הנוכחי אינו ברשימת האתרים שומרי השבת.'
      : 'אין אתר פעיל.'
    body.append(line)

    const row = document.createElement('div')
    row.className = 'pill-row'
    row.append(win.active ? pill('active', 'כעת שבת') : pill('none', 'לא ברשימה'))
    body.append(row)
    return
  }

  const name = document.createElement('div')
  name.className = 'site-name'
  name.textContent = site.name || site.domain
  body.append(name)

  const line = document.createElement('div')
  line.className = 'status-line'
  line.textContent = STATUS_LABEL_HE[site.status]
  body.append(line)

  const row = document.createElement('div')
  row.className = 'pill-row'
  row.append(
    isStrong(site) ? pill('closed', 'סגור בשבת') : pill('observant', 'מצהיר ששומר שבת'),
  )
  row.append(pill('confidence', CONFIDENCE_LABEL_HE[site.confidence]))
  if (win.active) row.append(pill('active', 'כעת שבת'))
  body.append(row)

  if (site.evidence_url) {
    const a = document.createElement('a')
    a.className = 'evidence'
    a.href = site.evidence_url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.textContent = 'מקור / עדות'
    if (site.evidence_text) a.title = site.evidence_text
    body.append(a)
  }
}

async function main(): Promise<void> {
  await loadFields()
  await render()

  for (const name of FIELDS) {
    const el = field(name)
    if (!el) continue
    el.addEventListener('change', () => void save())
    if (name === 'alertSymbol') el.addEventListener('input', updateSymbolPreview)
  }
}

// The module script is deferred, so the DOM is already parsed by the time this runs.
void main()
