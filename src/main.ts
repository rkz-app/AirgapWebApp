import { openPlayer, openScanner, ScanCancelledError } from 'airgap-web'
import { t, setLocale } from './i18n'
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

// ── Key bundle constants ────────────────────────────────────────────────────
const MLKEM_PK_LEN  = 1568
const MLDSA_PK_LEN  = 1952
const MLDSA_SIG_LEN = 3309
const P256_PK_LEN   = 64
const P256_SIG_LEN  = 64
const BUNDLE_TOTAL   = MLKEM_PK_LEN + MLDSA_PK_LEN + MLDSA_SIG_LEN + P256_PK_LEN + P256_SIG_LEN

interface ParsedBundle {
  mlkemKey: Uint8Array
  mldsaKey: Uint8Array
  p256Key: Uint8Array
}

function parseBundle(data: Uint8Array): ParsedBundle | null {
  if (data.length !== BUNDLE_TOTAL) return null
  return {
    mlkemKey: data.slice(0, MLKEM_PK_LEN),
    mldsaKey: data.slice(MLKEM_PK_LEN, MLKEM_PK_LEN + MLDSA_PK_LEN),
    p256Key: data.slice(MLKEM_PK_LEN + MLDSA_PK_LEN + MLDSA_SIG_LEN, MLKEM_PK_LEN + MLDSA_PK_LEN + MLDSA_SIG_LEN + P256_PK_LEN),
  }
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// ── Toast ───────────────────────────────────────────────────────────────────
let toastTimeout: number | undefined

function showToast(msg: string) {
  const toast = $('toast')
  toast.textContent = msg
  toast.classList.remove('hidden')
  clearTimeout(toastTimeout)
  toastTimeout = window.setTimeout(() => toast.classList.add('hidden'), 2500)
}

// ── Base64 helpers ──────────────────────────────────────────────────────────
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBytes(str: string): Uint8Array {
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// ── Hash helpers (SHA3-256, matching Swift: sha3.hex.prefix(7).uppercased()) ─
import { sha3_256 } from 'js-sha3'

function sha3Short(bytes: Uint8Array): string {
  return sha3_256.hex(bytes).slice(0, 7).toUpperCase()
}

// ── Key Bundles: localStorage persistence ───────────────────────────────────
const STORAGE_KEY = 'airgap-keybundles'

interface SavedBundle {
  id: number
  b64: string
  bundleHash: string
  mlkemHash: string
  mldsaHash: string
  p256Hash: string
  size: number
}

function loadBundles(): SavedBundle[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

function saveBundles(bundles: SavedBundle[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bundles))
}

// ── App init — runs when DOM is ready ───────────────────────────────────────
function init() {
  const scanBtn = $('btn-scan')
  const playBtn = $('btn-play')
  const copyBtn = $('btn-copy')
  const scanOutput = $('scan-output') as HTMLTextAreaElement
  const playInput = $('play-input') as HTMLTextAreaElement
  const scanResult = $('scan-result')
  const bundlesList = $('bundles-list')
  const addBundleBtn = $('btn-add-bundle')
  const langSwitcher = $('lang-switcher') as HTMLSelectElement

  // ── Tab switching ─────────────────────────────────────────────────────────
  $('tabs').addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest('[data-tab]') as HTMLButtonElement | null
    if (!btn) return
    const tab = btn.dataset.tab!
    $('tabs').querySelectorAll('.tab').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    $('tab-crypt').classList.toggle('hidden', tab !== 'crypt')
    $('tab-keys').classList.toggle('hidden', tab !== 'keys')
  })

  // ── Language switcher ─────────────────────────────────────────────────────
  langSwitcher.addEventListener('change', () => {
    setLocale(langSwitcher.value as 'en' | 'ru')
    renderBundles(bundlesList)
  })

  window.addEventListener('locale-changed', () => renderBundles(bundlesList))

  // ── Crypt tab: scan / play ────────────────────────────────────────────────
  scanBtn.addEventListener('click', async () => {
    try {
      const data = await openScanner(t('Scan Data'))
      scanOutput.value = bytesToBase64(data)
      scanResult.classList.remove('hidden')
    } catch (err) {
      if (err instanceof ScanCancelledError) return
      showToast(t('Scan failed: ') + (err instanceof Error ? err.message : String(err)))
    }
  })

  copyBtn.addEventListener('click', () => {
    if (!scanOutput.value) return
    navigator.clipboard.writeText(scanOutput.value).then(
      () => showToast(t('Copied to clipboard')),
      () => showToast(t('Failed to copy')),
    )
  })

  playBtn.addEventListener('click', async () => {
    const raw = playInput.value.trim()
    if (!raw) { showToast(t('Paste base64 data first')); return }
    try {
      await openPlayer(base64ToBytes(raw), t('Play QRs'))
    } catch (err) {
      showToast(t('Invalid base64: ') + (err instanceof Error ? err.message : String(err)))
    }
  })

  // ── Add bundle button ─────────────────────────────────────────────────────
  addBundleBtn.addEventListener('click', async () => {
    try {
      const data = await openScanner(t('+ Scan Key Bundle'))
      await addBundle(data, bundlesList)
    } catch (err) {
      if (err instanceof ScanCancelledError) return
      showToast(t('Scan failed: ') + (err instanceof Error ? err.message : String(err)))
    }
  })

  // ── Bundle card actions (delegated listener) ──────────────────────────────
  bundlesList.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest('[data-action]') as HTMLButtonElement | null
    if (!btn) return
    const action = btn.dataset.action!
    const id = Number(btn.dataset.id)
    const bundle = loadBundles().find(b => b.id === id)
    if (!bundle) return
    if (action === 'copy') {
      navigator.clipboard.writeText(bundle.b64).then(
        () => showToast(t('Copied to clipboard')),
        () => showToast(t('Failed to copy')),
      )
    }
    if (action === 'play') playBundle(bundle.b64)
    if (action === 'delete') {
      if (confirm(t('Delete this key bundle?'))) {
        const updated = loadBundles().filter(b => b.id !== id)
        saveBundles(updated)
        renderBundles(bundlesList)
      }
    }
  })

  // ── Initial render ────────────────────────────────────────────────────────
  renderBundles(bundlesList)
}

// ── Bundle logic ────────────────────────────────────────────────────────────

async function addBundle(data: Uint8Array, bundlesList: HTMLElement) {
  const parsed = parseBundle(data)
  if (!parsed) {
    showToast(t('Invalid key bundle: data too short'))
    return
  }
  const mlkemHash = sha3Short(parsed.mlkemKey)
  const mldsaHash = sha3Short(parsed.mldsaKey)
  const p256Hash = sha3Short(parsed.p256Key)
  // Bundle hash = SHA3-256(mlkemKey + mldsaKey + p256Key) — matching Dart sha3Short
  const keysConcat = new Uint8Array(MLKEM_PK_LEN + MLDSA_PK_LEN + P256_PK_LEN)
  keysConcat.set(parsed.mlkemKey, 0)
  keysConcat.set(parsed.mldsaKey, MLKEM_PK_LEN)
  keysConcat.set(parsed.p256Key, MLKEM_PK_LEN + MLDSA_PK_LEN)
  const bundleHash = sha3Short(keysConcat)
  const bundles = loadBundles()
  bundles.push({
    id: Date.now(),
    b64: bytesToBase64(data),
    bundleHash,
    mlkemHash,
    mldsaHash,
    p256Hash,
    size: data.length,
  })
  saveBundles(bundles)
  renderBundles(bundlesList)
}

async function playBundle(b64: string) {
  try {
    await openPlayer(base64ToBytes(b64), t('Key Bundle'))
  } catch (err) {
    showToast(t('Failed to play: ') + (err instanceof Error ? err.message : String(err)))
  }
}

function renderBundles(list: HTMLElement) {
  const bundles = loadBundles()
  if (bundles.length === 0) {
    list.innerHTML = `<p class="empty-msg">${t('No key bundles saved yet. Tap + to scan one.')}</p>`
    return
  }
  list.innerHTML = bundles.map(b => `
    <div class="bundle-card" data-id="${b.id}">
      <div class="bundle-header">
        <div class="bundle-title">
          <span class="bundle-name">${t('Key Bundle')}</span>
          <span class="bundle-size">${formatSize(b.size)}</span>
        </div>
        <span class="bundle-hash">${t('Bundle Hash')}: <span class="bundle-hash-val">${b.bundleHash}</span></span>
      </div>
      <div class="key-item">
        <span class="key-icon mlkem">🔐</span>
        <div class="key-info">
          <span class="key-label">${t('MLKEM-1024 Encryption Key')}</span>
          <span class="key-hash">${b.mlkemHash}</span>
        </div>
        <span class="key-size">${formatSize(MLKEM_PK_LEN)}</span>
      </div>
      <div class="key-item">
        <span class="key-icon p256">🖋</span>
        <div class="key-info">
          <span class="key-label">${t('P-256 Signature Key')}</span>
          <span class="key-hash">${b.p256Hash}</span>
        </div>
        <span class="key-size">${formatSize(P256_PK_LEN)}</span>
      </div>
      <div class="key-item">
        <span class="key-icon mldsa">✍️</span>
        <div class="key-info">
          <span class="key-label">${t('ML-DSA65 Signature Key')}</span>
          <span class="key-hash">${b.mldsaHash}</span>
        </div>
        <span class="key-size">${formatSize(MLDSA_PK_LEN)}</span>
      </div>
      <div class="bundle-actions">
        <button class="btn bundle-copy" data-action="copy" data-id="${b.id}">${t('Copy Base64')}</button>
        <button class="btn btn-primary bundle-play" data-action="play" data-id="${b.id}">${t('Show QR')}</button>
        <button class="btn bundle-delete" data-action="delete" data-id="${b.id}">${t('Delete')}</button>
      </div>
    </div>
  `).join('')

}

// ── Start ───────────────────────────────────────────────────────────────────
function start() {
  const tabs = document.getElementById('tabs')
  // Vite HMR may re-evaluate module before DOM is rebuilt; guard with single RAF
  if (!tabs) { requestAnimationFrame(start); return }
  init()
}
start()

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
}
