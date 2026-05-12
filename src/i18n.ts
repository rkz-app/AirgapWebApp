type Locale = 'en' | 'ru'

// Flat key → translation map. Keys are the English string — keeps it simple.
const dict: Record<Locale, Record<string, string>> = {
  en: {},
  ru: {
    // Header & tabs
    'Airgap Proxy': 'Airgap Proxy',
    'Transfer data between air-gapped devices via QR codes': 'Передача данных между устройствами через QR-коды',
    'Crypt': 'Крипт',
    'Key Bundles': 'Связки ключей',

    // Crypt — Scan card
    'Scan': 'Скан',
    'Scan a QR sequence from another device.': 'Сканируйте QR-последовательность с другого устройства.',
    'Scan Data': 'Сканировать',
    'Base64 Encoded Data': 'Данные в Base64',
    'Copy to Clipboard': 'Копировать',

    // Crypt — Play card
    'Play': 'Плей',
    'Paste base64 data to encode into a QR sequence.': 'Вставьте base64 для кодирования в QR-последовательность.',
    'Paste base64 data here…': 'Вставьте base64 данные сюда…',
    'Play QRs': 'Показать QR',

    // Key Bundles tab
    'No key bundles saved yet. Tap + to scan one.': 'Нет сохранённых связок ключей. Нажмите + чтобы сканировать.',
    '+ Scan Key Bundle': '+ Сканировать связку',

    // Bundle card
    'Key Bundle': 'Связка ключей',
    'Bundle Hash': 'Хэш связки',
    'MLKEM-1024 Encryption Key': 'Ключ шифрования MLKEM-1024',
    'P-256 Signature Key': 'Ключ подписи P-256',
    'ML-DSA65 Signature Key': 'Ключ подписи ML-DSA65',
    'Copy Base64': 'Копировать Base64',
    'Show QR': 'Показать QR',
    'Delete': 'Удалить',

    // Toasts & dialogs
    'Copied to clipboard': 'Скопировано',
    'Failed to copy': 'Ошибка копирования',
    'Scan failed: ': 'Ошибка сканирования: ',
    'Paste base64 data first': 'Сначала вставьте base64 данные',
    'Invalid base64: ': 'Неверный base64: ',
    'Invalid key bundle: data too short': 'Неверная связка ключей: недостаточно данных',
    'Failed to play: ': 'Ошибка воспроизведения: ',
    'Delete this key bundle?': 'Удалить эту связку ключей?',
  },
}

// English returns the key itself, since keys ARE English.
// Russian looks up the key; falls back to the key if missing.
export function t(key: string): string {
  return dict[currentLocale][key] ?? key
}

const STORAGE_KEY = 'airgap-locale'

let currentLocale: Locale = 'en'

export function getLocale(): Locale {
  return currentLocale
}

export function setLocale(locale: Locale) {
  currentLocale = locale
  try { localStorage.setItem(STORAGE_KEY, locale) } catch { /* noop */ }
  applyTranslations()
  window.dispatchEvent(new CustomEvent('locale-changed'))
}

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null
    if (stored === 'en' || stored === 'ru') return stored
  } catch { /* noop */ }
  const nav = navigator.language
  if (nav.startsWith('ru')) return 'ru'
  return 'en'
}

// Walk DOM and apply translations to elements with [data-i18n].
// On first pass we extract the English key from the attribute or textContent
// and persist it in data-i18n-key so subsequent locale switches don't lose it.
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    // Reuse stored key, or extract it once from the source
    let key = el.getAttribute('data-i18n-key')
    if (!key) {
      key = el.getAttribute('data-i18n')!
      if (key === '') {
        key = (el.textContent || '').trim()
      }
      if (!key) return
      el.setAttribute('data-i18n-key', key)
    }
    const attr = el.getAttribute('data-i18n-attr')
    if (attr) {
      el.setAttribute(attr, t(key))
    } else {
      el.textContent = t(key)
    }
  })

  // Update <html lang>
  document.documentElement.lang = currentLocale

  // Update lang switcher
  const sel = document.getElementById('lang-switcher') as HTMLSelectElement | null
  if (sel) sel.value = currentLocale
}

// Initialize on import
currentLocale = detectLocale()
document.addEventListener('DOMContentLoaded', applyTranslations)
