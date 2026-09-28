import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false
})

export default i18n
export const t = i18n.t.bind(i18n)
