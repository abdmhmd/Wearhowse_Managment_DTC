import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocalizedName } from '@/i18n/helpers';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '@/hooks/useCategories';
import { createCategorySchema, updateCategorySchema, type CreateCategoryFormData, type UpdateCategoryFormData } from '@/schemas/categories.schema';
import { PageHeader, Button, DataTable, Modal, Input, Badge, ConfirmDialog } from '@/components/ui';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { formatDate } from '@/utils';
import type { Category } from '@/types';

export default function CategoriesPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);

  const { data, isLoading } = useCategories(page);
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  const createForm = useForm<CreateCategoryFormData>({
    resolver: zodResolver(createCategorySchema),
  });

  const updateForm = useForm<UpdateCategoryFormData>({
    resolver: zodResolver(updateCategorySchema),
  });

  const handleCreate = async (data: CreateCategoryFormData) => {
    await createMutation.mutateAsync(data);
    setIsCreateOpen(false);
    createForm.reset();
  };

  const handleUpdate = async (data: UpdateCategoryFormData) => {
    if (!editingCategory) return;
    await updateMutation.mutateAsync({ code: editingCategory.code, data });
    setEditingCategory(null);
    updateForm.reset();
  };

  const handleDelete = async () => {
    if (!deletingCategory) return;
    await deleteMutation.mutateAsync(deletingCategory.code);
    setDeletingCategory(null);
  };

  const columns = [
    { key: 'code', header: t('table.code') },
    { key: 'name_ar', header: t('table.nameAr'), render: (item: Category) => getLocalizedName(item) },
    {
      key: 'description',
      header: t('table.description'),
      render: (item: Category) => (
        <span className="text-gray-500">{item.description || '-'}</span>
      ),
    },
    {
      key: 'created_at',
      header: t('table.created'),
      render: (item: Category) => formatDate(item.created_at),
    },
    {
      key: 'actions',
      header: t('table.actions'),
      className: 'text-end',
      render: (item: Category) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setEditingCategory(item);
              updateForm.reset({ name_ar: item.name_ar, description: item.description || '' });
            }}
          >
            <PencilIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setDeletingCategory(item);
            }}
          >
            <TrashIcon className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('pages.categories.title')}
        subtitle={t('pages.categories.subtitle')}
        actions={
          <Button onClick={() => setIsCreateOpen(true)}>
            <PlusIcon className="h-4 w-4 me-2" />
            {t('pages.categories.create')}
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={(data?.data || []) as any[]}
        pagination={data?.pagination ? {
          ...data.pagination,
          onPageChange: setPage,
        } : undefined}
        emptyMessage={t('common.noData')}
      />

      {/* Create Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => { setIsCreateOpen(false); createForm.reset(); }} title={t('pages.categories.create')}>
        <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
          <Input
            label={t('form.code')}
            {...createForm.register('code')}
            error={createForm.formState.errors.code?.message}
          />
          <Input
            label={t('form.nameAr')}
            {...createForm.register('name_ar')}
            error={createForm.formState.errors.name_ar?.message}
          />
          <Input
            label={t('form.description')}
            {...createForm.register('description')}
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => { setIsCreateOpen(false); createForm.reset(); }}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" isLoading={createMutation.isPending}>
              {t('common.create')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!editingCategory} onClose={() => { setEditingCategory(null); updateForm.reset(); }} title={t('pages.categories.edit')}>
        <form onSubmit={updateForm.handleSubmit(handleUpdate)} className="space-y-4">
          <Input
            label={t('form.nameAr')}
            {...updateForm.register('name_ar')}
            error={updateForm.formState.errors.name_ar?.message}
          />
          <Input
            label={t('form.description')}
            {...updateForm.register('description')}
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => { setEditingCategory(null); updateForm.reset(); }}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" isLoading={updateMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deletingCategory}
        onClose={() => setDeletingCategory(null)}
        onConfirm={handleDelete}
        title={t('common.confirmDelete')}
        message={t('common.confirmDeleteMessage', { name: getLocalizedName(deletingCategory || {}) })}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
