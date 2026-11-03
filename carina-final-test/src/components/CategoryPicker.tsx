import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import type { Category, Subcategory } from '@/models';

type Choice = { id: string; name: string; kind: 'category' | 'subcategory'; archived?: boolean };

interface CategoryPickerProps {
  categories: Category[];
  subcategories: Subcategory[];
  categoryId: string;
  subcategoryId: string;
  onChange: (categoryId: string, subcategoryId: string) => void;
}

export function CategoryPicker({ categories, subcategories, categoryId, subcategoryId, onChange }: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(categories.find(item => item.id === categoryId)?.parentCategoryId ?? categoryId);
  const activeCategory = categories.find(item => item.id === activeId) ?? categories[0];
  const roots = useMemo(() => categories.filter(item => !item.parentCategoryId || !categories.some(parent => parent.id === item.parentCategoryId)), [categories]);
  const selectedCategory = categories.find(item => item.id === categoryId);
  const selectedSubcategory = subcategories.find(item => item.id === subcategoryId);
  const selectedChild = selectedCategory?.parentCategoryId ? selectedCategory : undefined;
  const display = selectedCategory
    ? [selectedChild ? categories.find(item => item.id === selectedChild.parentCategoryId)?.name : selectedCategory.name, selectedChild?.name, selectedSubcategory?.name].filter(Boolean).join(' · ')
    : '请选择分类';

  const choices: Choice[] = activeCategory ? [
    ...categories.filter(item => item.parentCategoryId === activeCategory.id).map(item => ({ id: item.id, name: item.name, kind: 'category' as const, archived: item.isArchived })),
    ...subcategories.filter(item => item.categoryId === activeCategory.id && !item.isArchived).map(item => ({ id: item.id, name: item.name, kind: 'subcategory' as const, archived: item.isArchived })),
  ] : [];

  useEffect(() => {
    if (open) setActiveId(categories.find(item => item.id === categoryId)?.parentCategoryId ?? categoryId);
  }, [open, categoryId]);

  const choose = (choice?: Choice) => {
    if (!activeCategory) return;
    if (!choice) onChange(activeCategory.id, '');
    else if (choice.kind === 'category') onChange(choice.id, '');
    else onChange(activeCategory.id, choice.id);
    setOpen(false);
  };

  // One delegated pointer handler owns every touch interaction in this picker.
  // This avoids competing click/pointer handlers across the trigger, backdrop,
  // main categories and subcategory choices on iOS/PWA.
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return;
    const target = event.target;
    const trigger = target.closest<HTMLElement>('[data-picker-action="toggle"]');
    if (trigger) {
      event.preventDefault();
      setOpen(value => !value);
      return;
    }

    const backdrop = target.closest<HTMLElement>('[data-picker-backdrop]');
    if (backdrop && target === backdrop) {
      event.preventDefault();
      setOpen(false);
      return;
    }

    const mainCategory = target.closest<HTMLElement>('[data-picker-main-category]');
    if (mainCategory) {
      event.preventDefault();
      setActiveId(mainCategory.dataset.pickerMainCategory ?? '');
      return;
    }

    const choice = target.closest<HTMLElement>('[data-picker-choice]');
    if (choice) {
      event.preventDefault();
      const kind = choice.dataset.choiceKind;
      const id = choice.dataset.pickerChoice;
      if (kind === 'category' && id) choose({ id, name: '', kind: 'category' });
      else if (kind === 'subcategory' && id) choose({ id, name: '', kind: 'subcategory' });
      else choose();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && open) setOpen(false);
  };

  return <div className="category-picker" onPointerDown={handlePointerDown} onKeyDown={handleKeyDown}>
    <button type="button" className="category-picker-trigger" data-picker-action="toggle" aria-haspopup="dialog" aria-expanded={open}>
      <span>{display}</span><ChevronDown size={18}/>
    </button>
    {open && <div className="category-picker-backdrop" data-picker-backdrop>
      <div className="category-picker-panel" role="dialog" aria-modal="true" aria-label="选择分类">
        <div className="category-picker-heading"><strong>选择分类</strong></div>
        <div className="category-picker-columns">
          <div className="category-picker-main-list">
            {roots.map(item => <button type="button" key={item.id} data-picker-main-category={item.id} className={activeCategory?.id === item.id ? 'active' : ''}>
              <span>{item.name}</span><ChevronRight size={16}/>
            </button>)}
          </div>
          <div className="category-picker-sub-list">
            <button type="button" data-picker-choice data-choice-kind="none" className={!subcategoryId && categoryId === activeCategory?.id ? 'selected' : ''}>
              <span>不细分</span>{!subcategoryId && categoryId === activeCategory?.id && <Check size={16}/>}
            </button>
            {choices.map(choice => {
              const selected = choice.kind === 'category' ? categoryId === choice.id : categoryId === activeCategory?.id && subcategoryId === choice.id;
              return <button type="button" key={choice.id} data-picker-choice={choice.id} data-choice-kind={choice.kind} className={selected ? 'selected' : ''}>
                <span>{choice.name}{choice.archived ? '（已归档）' : ''}</span>{selected && <Check size={16}/>}
              </button>;
            })}
          </div>
        </div>
      </div>
    </div>}
  </div>;
}
