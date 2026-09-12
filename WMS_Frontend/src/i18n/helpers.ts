import { useTranslation } from 'react-i18next';
import i18n from './index';

export function useLanguage() {
  const { i18n: ii } = useTranslation();
  return ii.language === 'ar' ? 'ar' : 'en';
}

export function getLocalizedName(item: { name_ar?: string | null; name_en?: string | null } | null | undefined, lang?: string): string {
  const language = lang || (i18n.language === 'ar' ? 'ar' : 'en');
  if (!item) return '-';
  if (language === 'ar') return item.name_ar || item.name_en || '-';
  return item.name_en || item.name_ar || '-';
}

export function getLocalizedRoleLabel(role: string, lang?: string): string {
  const language = lang || (i18n.language === 'ar' ? 'ar' : 'en');
  const roles = i18n.t('roles', { returnObjects: true }) as Record<string, string>;
  if (language === 'ar') {
    return roles[role] || role;
  }
  return roles[role] || role;
}

export function getLocalizedCategoryName(item: { name_ar?: string; name_en?: string } | null | undefined, lang?: string): string {
  return getLocalizedName(item, lang);
}

export function setDocumentDirection(lang: string) {
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
}
