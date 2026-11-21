/*
 * Options page.
 *
 * Deliberately not a second home for the settings: alertSymbol, minConfidence, and the
 * master toggle stay in the popup, one click away from the site they apply to. This page
 * holds only what a popup cannot — a list to manage, a data panel, the update setting,
 * and text to read.
 */
import './options.css'

import '../lib/browser-polyfill.ts'
import {
  applyDocumentLang,
  applyStaticStrings,
  formatDate,
  formatDateTime,
  setLang,
  t,
} from '../i18n/index.ts'
import { getDataset, onDatasetChanged } from '../lib/dataset.ts'
import { getUpdateState, refreshNow } from '../lib/remote.ts'
import { getSettings, onSettingsChanged, setSettings, undismissDomain } from '../lib/settings.ts'
import { statusLabel } from '../lib/site.ts'
import type { Dataset, SiteStatus } from '../types.ts'

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null
}

async function renderDismissed(): Promise<void> {
  const list = el<HTMLUListElement>('dismissed-list')
  const empty = el('dismissed-empty')
  if (!list || !empty) return

  const { dismissedDomains } = await getSettings()
  list.replaceChildren()
  empty.classList.toggle('hidden', dismissedDomains.length > 0)

  for (const domain of [...dismissedDomains].sort()) {
    const item = document.createElement('li')

    const name = document.createElement('span')
    name.className = 'domain'
    name.textContent = domain

    const restore = document.createElement('button')
    restore.type = 'button'
    restore.className = 'restore'
    restore.textContent = t('options.restore')
    restore.addEventListener('click', () => {
      void undismissDomain(domain).then(renderDismissed)
    })

    item.append(name, restore)
    list.append(item)
  }
}

function stat(label: string, value: string): HTMLElement {
  const wrap = document.createElement('div')
  const dt = document.createElement('dt')
  dt.textContent = label
  const dd = document.createElement('dd')
  dd.textContent = value
  wrap.append(dt, dd)
  return wrap
}

function renderDataPanel(data: Dataset): void {
  const stats = el<HTMLDListElement>('data-stats')
  if (stats) {
    stats.replaceChildren(
      stat(t('options.statSites'), String(data.sites.length)),
      stat(t('options.statRemoved'), String(data.removed.length)),
      stat(t('options.statAudited'), formatDate(data.audited_at)),
    )
  }

  const breakdown = el<HTMLUListElement>('status-breakdown')
  if (!breakdown) return

  const counts = new Map<SiteStatus, number>()
  for (const site of data.sites) counts.set(site.status, (counts.get(site.status) ?? 0) + 1)

  breakdown.replaceChildren()
  // Sorted by size rather than by status order: the panel answers "what is in the list",
  // not "which status outranks which".
  for (const [status, count] of [...counts].sort((a, b) => b[1] - a[1])) {
    const item = document.createElement('li')

    const label = document.createElement('span')
    label.textContent = statusLabel(status)

    const value = document.createElement('span')
    value.className = 'count'
    value.textContent = String(count)

    item.append(label, value)
    breakdown.append(item)
  }
}

/**
 * The update panel: where the list in use came from, and how to force a check.
 *
 * `source` is the honest answer to "is this the list that shipped?" — worth stating
 * plainly, because a user comparing two machines will otherwise see different site counts
 * on the same version and have nothing to go on.
 */
async function renderUpdatePanel(): Promise<void> {
  const state = await getUpdateState()

  const stats = el<HTMLDListElement>('update-stats')
  if (stats) {
    stats.replaceChildren(
      stat(
        t('options.statSource'),
        t(state.source === 'remote' ? 'options.sourceRemote' : 'options.sourceBundled'),
      ),
      stat(t('options.statRevision'), String(state.revision)),
      stat(
        t('options.statChecked'),
        state.checkedAt === null ? t('options.updateNever') : formatDateTime(state.checkedAt),
      ),
    )
  }

  // Shown rather than swallowed: a check that has been failing for a week is the
  // difference between an old list and a list the user thinks is current.
  const error = el('update-error')
  if (error) {
    error.textContent = state.lastError ? t('options.updateError', { error: state.lastError }) : ''
    error.classList.toggle('hidden', !state.lastError)
  }

  const toggle = el<HTMLInputElement>('autoUpdate')
  if (toggle) toggle.checked = (await getSettings()).autoUpdate
}

async function main(): Promise<void> {
  await paint()

  el<HTMLInputElement>('autoUpdate')?.addEventListener('change', (event) => {
    const checked = (event.currentTarget as HTMLInputElement).checked
    void setSettings({ autoUpdate: checked })
  })

  el<HTMLButtonElement>('check-now')?.addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLButtonElement
    button.disabled = true
    button.textContent = t('options.checking')
    // `refreshNow` resolves whatever happens, so the button always comes back.
    void refreshNow().then(async () => {
      button.disabled = false
      button.textContent = t('options.checkNow')
      await paint()
    })
  })

  // The list can also change from the banner's "never show here" button while this page
  // is open in another tab — and the language can change from the popup, which repaints
  // everything rather than just the list.
  onSettingsChanged(() => void paint())

  // A check running in the worker while this page is open replaces the list underneath it.
  onDatasetChanged(() => void paint())
}

/** Everything on the page, in the currently stored language. */
async function paint(): Promise<void> {
  setLang((await getSettings()).lang)
  applyDocumentLang()
  applyStaticStrings()
  renderDataPanel(await getDataset())
  await renderUpdatePanel()
  await renderDismissed()
}

void main()
