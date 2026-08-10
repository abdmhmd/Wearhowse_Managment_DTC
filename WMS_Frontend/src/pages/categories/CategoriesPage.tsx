import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocalizedName } from '@/i18n/helpers';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useSubcategories,
  useCreateSubcategory,
  useUpdateSubcategory,
  useDeleteSubcategory,
} from '@/hooks/useCategories';
import {
  createCategorySchema,
  updateCategorySchema,
  createSubcategorySchema,
  updateSubcategorySchema,
  type CreateCategoryFormData,
  type UpdateCategoryFormData,
  type CreateSubcategoryFormData,
  type UpdateSubcategoryFormData,
} from '@/schemas/categories.schema';
import { PageHeader, Button, DataTable, Modal, Input, Select, Badge, ConfirmDialog } from '@/components/ui';
import { PlusIcon, PencilIcon, TrashIcon, Squares2X2Icon } from '@heroicons/react/24/outline';
import { formatDate } from '@/utils';
import { useAuthStore } from '@/store/auth.store';
import type { Category, Subcategory } from '@/types';

export default function CategoriesPage() {
  const { t } = useTranslation();
  const { can } = useAuthStore();
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [subcategoryCategory, setSubcategoryCategory] = useState<Category | null>(null);
  const [editingSubcategory, setEditingSubcategory] = useState<Subcategory | null>(null);
  const [deletingSubcategory, setDeletingSubcategory] = useState<Subcategory | null>(null);

  const { data, isLoading } = useCategories(page, 200);
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();
  const { data: subcategoriesData } = useSubcategories(subcategoryCategory?.code || '');
  const createSubcatMutation = useCreateSubcategory();
  const updateSubcatMutation = useUpdateSubcategory();
  const deleteSubcatMutation = useDeleteSubcategory();

  const categories = data?.items || [];
  const subcategories = subcategoriesData || [];

  const createForm = useForm<CreateCategoryFormData>({
    resolver: zodResolver(createCategorySchema),
  });

  const updateForm = useForm<UpdateCategoryFormData>({
    resolver: zodResolver(updateCategorySchema),
  });

  const subcatForm = useForm<CreateSubcategoryFormData>({
    resolver: zodResolver(createSubcategorySchema),
  });

  const editSubcatForm = useForm<UpdateSubcategoryFormData>({
    resolver: zodResolver(updateSubcategorySchema),
  });

  const handleCreate = async (formData: CreateCategoryFormData) => {
    await createMutation.mutateAsync(formData);
    setIsCreateOpen(false);
    createForm.reset();
  };

  const handleUpdate = async (formData: UpdateCategoryFormData) => {
    if (!editingCategory) return;
    await updateMutation.mutateAsync({ code: editingCategory.code, data: formData });
    setEditingCategory(null);
    updateForm.reset();
  };

  const handleDelete = async () => {
    if (!deletingCategory) return;
    await deleteMutation.mutateAsync(deletingCategory.code);
    setDeletingCategory(null);
  };

  const handleCreateSubcategory = async (formData: CreateSubcategoryFormData) => {
    if (!subcategoryCategory) return;
    await createSubcatMutation.mutateAsync({ categoryCode: subcategoryCategory.code, data: formData });
    subcatForm.reset();
  };

  const handleUpdateSubcategory = async (formData: UpdateSubcategoryFormData) => {
    if (!editingSubcategory) return;
    await updateSubcatMutation.mutateAsync({ id: editingSubcategory.id, data: formData });
    setEditingSubcategory(null);
    editSubcatForm.reset();
  };

  const handleDeleteSubcategory = async () => {
    if (!deletingSubcategory) return;
    await deleteSubcatMutation.mutateAsync(deletingSubcategory.id);
    setDeletingSubcategory(null);
  };

  const columns = [
    { key: 'code', header: t('table.code') },
    { key: 'name_ar', header: t('table.nameAr'), render: (item: Category) => getLocalizedName(item) },
    {
      key: 'parent',
      header: t('table.parentCategory'),
      render: (item: Category) => {
        if (!item.parent_code) return <span className="text-gray-400">-</span>;
        const parent = categories.find((c) => c.code === item.parent_code);
        return <span className="text-sm">{parent ? getLocalizedName(parent) : item.parent_code}</span>;
      },
    },
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
              setSubcategoryCategory(item);
            }}
            title={t('pages.categories.manageSubcategories')}
          >
            <Squares2X2Icon className="h-4 w-4" />
          </Button>
          {can('categories:update') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setEditingCategory(item);
                updateForm.reset({
                  name_ar: item.name_ar,
                  name_en: item.name_en || '',
                  parent_code: item.parent_code || null,
                  description: item.description || '',
                });
              }}
            >
              <PencilIcon className="h-4 w-4" />
            </Button>
          )}
          {can('categories:delete') && (
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
          )}
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
          can('categories:create') ? (
            <Button onClick={() => setIsCreateOpen(true)}>
              <PlusIcon className="h-4 w-4 me-2" />
              {t('pages.categories.create')}
            </Button>
          ) : undefined
        }
      />

      <DataTable
        columns={columns}
        data={(data?.items || []) as any[]}
        pagination={data?.pagination ? {
          ...data.pagination,
          onPageChange: setPage,
        } : undefined}
        emptyMessage={t('common.noData')}
      />

      {/* Create Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => { setIsCreateOpen(false); createForm.reset(); }} title={t('pages.categories.create')}>
        <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('form.code')}
              {...createForm.register('code')}
              error={createForm.formState.errors.code?.message}
            />
            <Select
              label={t('form.parentCategory')}
              {...createForm.register('parent_code')}
              placeholder={t('form.selectParentCategory')}
              options={categories.map((c: any) => ({ value: c.code, label: getLocalizedName(c) }))}
            />
          </div>
          <Input
            label={t('form.nameAr')}
            {...createForm.register('name_ar')}
            error={createForm.formState.errors.name_ar?.message}
          />
          <Input
            label={t('form.nameEn')}
            {...createForm.register('name_en')}
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
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('form.nameAr')}
              {...updateForm.register('name_ar')}
              error={updateForm.formState.errors.name_ar?.message}
            />
            <Select
              label={t('form.parentCategory')}
              {...updateForm.register('parent_code')}
              placeholder={t('form.selectParentCategory')}
              options={categories
                .filter((c) => c.code !== editingCategory?.code)
                .map((c: any) => ({ value: c.code, label: getLocalizedName(c) }))}
            />
          </div>
          <Input
            label={t('form.nameEn')}
            {...updateForm.register('name_en')}
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

      {/* Subcategories Modal */}
      <Modal
        isOpen={!!subcategoryCategory}
        onClose={() => { setSubcategoryCategory(null); subcatForm.reset(); setEditingSubcategory(null); }}
        title={`${t('pages.categories.subcategories')} - ${getLocalizedName(subcategoryCategory || {})}`}
        size="lg"
      >
        <div className="space-y-4">
          {can('categories:create') && (
            <form onSubmit={subcatForm.handleSubmit(handleCreateSubcategory)} className="space-y-4 border border-gray-100 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label={t('form.code')}
                  {...subcatForm.register('code')}
                  error={subcatForm.formState.errors.code?.message}
                />
                <Input
                  label={t('form.nameAr')}
                  {...subcatForm.register('name_ar')}
                  error={subcatForm.formState.errors.name_ar?.message}
                />
              </div>
              <Input
                label={t('form.nameEn')}
                {...subcatForm.register('name_en')}
              />
              <div className="flex justify-end">
                <Button type="submit" isLoading={createSubcatMutation.isPending}>
                  <PlusIcon className="h-4 w-4 me-2" />
                  {t('pages.categories.addSubcategory')}
                </Button>
              </div>
            </form>
          )}

          {subcategories.length === 0 ? (
            <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
              {t('pages.categories.noSubcategories')}
            </div>
          ) : (
            <div className="divide-y divide-gray-200 border rounded-lg">
              {subcategories.map((sub: Subcategory) => (
                <div key={sub.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium">{getLocalizedName(sub)} <span className="text-xs text-gray-400">({sub.code})</span></p>
                      <p className="text-xs text-gray-500">{sub.description || '-'}</p>
                    </div>
                    {sub.is_active === false && <Badge variant="danger">{t('common.inactive')}</Badge>}
                  </div>
                  <div className="flex gap-2">
                    {can('categories:update') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingSubcategory(sub);
                          editSubcatForm.reset({
                            name_ar: sub.name_ar,
                            name_en: sub.name_en || '',
                            description: sub.description || '',
                            is_active: sub.is_active !== false,
                          });
                        }}
                      >
                        <PencilIcon className="h-4 w-4" />
                      </Button>
                    )}
                    {can('categories:delete') && (
                      <Button variant="ghost" size="sm" onClick={() => setDeletingSubcategory(sub)}>
                        <TrashIcon className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Edit Subcategory Modal */}
      <Modal isOpen={!!editingSubcategory} onClose={() => { setEditingSubcategory(null); editSubcatForm.reset(); }} title={t('pages.categories.editSubcategory')}>
        <form onSubmit={editSubcatForm.handleSubmit(handleUpdateSubcategory)} className="space-y-4">
          <Input
            label={t('form.nameAr')}
            {...editSubcatForm.register('name_ar')}
            error={editSubcatForm.formState.errors.name_ar?.message}
          />
          <Input
            label={t('form.nameEn')}
            {...editSubcatForm.register('name_en')}
          />
          <Input
            label={t('form.description')}
            {...editSubcatForm.register('description')}
          />
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" {...editSubcatForm.register('is_active')} className="rounded border-gray-300" />
            {t('common.active')}
          </label>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => { setEditingSubcategory(null); editSubcatForm.reset(); }}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" isLoading={updateSubcatMutation.isPending}>
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

      <ConfirmDialog
        isOpen={!!deletingSubcategory}
        onClose={() => setDeletingSubcategory(null)}
        onConfirm={handleDeleteSubcategory}
        title={t('common.confirmDelete')}
        message={t('common.confirmDeleteMessage', { name: getLocalizedName(deletingSubcategory || {}) })}
        isLoading={deleteSubcatMutation.isPending}
      />
    </div>
  );
}
