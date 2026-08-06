import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useSettings, useUpdateSettings } from '@/hooks/useSettings';
import { PageHeader, Button, Input, LoadingSpinner } from '@/components/ui';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useSettings();
  const updateMutation = useUpdateSettings();
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  useEffect(() => {
    if (data) {
      reset(data);
    }
  }, [data, reset]);

  const onSubmit = async (formData: any) => {
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(formData)) {
      if (value !== undefined && value !== null) {
        cleaned[key] = String(value);
      }
    }
    await updateMutation.mutateAsync(cleaned);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div>
      <PageHeader title={t('pages.settings.title')} subtitle={t('pages.settings.subtitle')} />

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
        <div className="bg-white rounded-xl shadow p-6 space-y-4">
          <h3 className="text-lg font-semibold">{t('pages.settings.accountingAccounts')}</h3>

          <Input
            label={t('pages.settings.inventoryAccount')}
            {...register('inventory_account')}
            error={errors.inventory_account?.message as string}
          />

          <Input
            label={t('pages.settings.supplierAccount')}
            {...register('supplier_account')}
            error={errors.supplier_account?.message as string}
          />

          <Input
            label={t('pages.settings.expenseAccountPrefix')}
            {...register('expense_account_prefix')}
            error={errors.expense_account_prefix?.message as string}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('pages.settings.valuationMethod')}</label>
            <select
              {...register('valuation_method')}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="last_purchase">{t('pages.settings.lastPurchase')}</option>
              <option value="average">{t('pages.settings.average')}</option>
              <option value="fifo">{t('pages.settings.fifo')}</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => reset()}>{t('common.cancel')}</Button>
          <Button type="submit" isLoading={updateMutation.isPending}>{t('common.save')}</Button>
        </div>
      </form>
    </div>
  );
}
