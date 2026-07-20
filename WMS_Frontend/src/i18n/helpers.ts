import { useTranslation } from 'react-i18next';
import i18n from './index';

export function useLanguage() {
  const { i18n: ii } = useTranslation();
  return ii.language === 'ar' ? 'ar' : 'en';
}

export function getLocalizedName(item: { name_ar?: string; name_en?: string } | null | undefined, lang?: string): string {
  const language = lang || (i18n.language === 'ar' ? 'ar' : 'en');
  if (!item) return '-';
  if (language === 'ar') return item.name_ar || item.name_en || '-';
  return item.name_en || item.name_ar || '-';
}

export function getLocalizedCategoryName(item: { name_ar?: string; name_en?: string } | null | undefined, lang?: string): string {
  return getLocalizedName(item, lang);
}

export function setDocumentDirection(lang: string) {
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
}
