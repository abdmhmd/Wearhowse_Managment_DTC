import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BuildingStorefrontIcon } from '@heroicons/react/24/outline';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center">
            <BuildingStorefrontIcon className="h-16 w-16 text-primary-600" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">{t('auth.forgotPasswordTitle')}</h1>
          <p className="mt-2 text-sm text-gray-600">{t('auth.login.forgotPasswordHelp')}</p>
        </div>

        <div className="bg-white p-8 rounded-xl shadow space-y-4">
          <p className="text-sm text-gray-700">{t('auth.forgotPasswordDetails')}</p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            {t('common.back')}
          </button>
        </div>
      </div>
    </div>
  );
}