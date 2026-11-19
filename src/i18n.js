import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enCommon from './locales/en/common.json';
import bnCommon from './locales/bn/common.json';
import enAdmin from './locales/en/admin.json';
import bnAdmin from './locales/bn/admin.json';
import enBooking from './locales/en/booking.json';
import bnBooking from './locales/bn/booking.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'bn', label: 'বাংলা', shortLabel: 'বাং' },
  { code: 'en', label: 'English', shortLabel: 'EN' },
];

const STORAGE_KEY = 'busbook.language';

function initialLanguage() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'bn' || saved === 'en') return saved;
  // Bangla first: most passengers and counter staff in Bangladesh read Bangla.
  return 'bn';
}

i18n.use(initReactI18next).init({
  resources: {
    en: { common: enCommon, admin: enAdmin, booking: enBooking },
    bn: { common: bnCommon, admin: bnAdmin, booking: bnBooking },
  },
  lng: initialLanguage(),
  fallbackLng: 'en',
  ns: ['common', 'admin', 'booking'],
  defaultNS: 'common',
  interpolation: {
    // React already escapes output.
    escapeValue: false,
  },
});

export function changeLanguage(code) {
  if (code !== 'bn' && code !== 'en') return;
  i18n.changeLanguage(code);
  localStorage.setItem(STORAGE_KEY, code);
  document.documentElement.lang = code;
}

document.documentElement.lang = i18n.language;

export default i18n;
