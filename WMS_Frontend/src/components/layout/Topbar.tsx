import { useTranslation } from 'react-i18next';
import { Bars3Icon, UserIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '@/store/auth.store';
import { ROLE_LABELS } from '@/types';
import i18n from '@/i18n';

interface TopbarProps {
  onMenuClick: () => void;
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const { user } = useAuthStore();
  const { t } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'ar' ? 'en' : 'ar';
    i18n.changeLanguage(newLang);
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 h-16 flex items-center px-4 lg:px-6">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-md text-gray-500 hover:bg-gray-100"
      >
        <Bars3Icon className="h-6 w-6" />
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        <button
          onClick={toggleLanguage}
          className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          {i18n.language === 'ar' ? 'EN' : 'AR'}
        </button>

        <div className="text-end hidden sm:block">
          <p className="text-sm font-medium text-gray-900">{user?.full_name}</p>
          <p className="text-xs text-gray-500">{user ? ROLE_LABELS[user.role] : ''}</p>
        </div>
        <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
          <UserIcon className="h-4 w-4 text-primary-600" />
        </div>
      </div>
    </header>
  );
}
