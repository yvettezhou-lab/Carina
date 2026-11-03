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

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const choose = (choice?: Choice) => {
    if (!activeCategory) return;
    if (!choice) onChange(activeCategory.id, '');
    else if (choice.kind === 'category') onChange(choice.id, '');
    else onChange(activeCategory.id, choice.id);
    setOpen(false);
  };

  // Use pointer events for the actual selection/dismissal. On iOS PWA, this
  // avoids relying on a delayed synthetic click after touch interaction.
  const handleBackdropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      event.preventDefault();
      setOpen(false);
    }
  };
  const handlePanelPointerDown = (event: React.PointerEvent<HTMLDivElement>) => event.stopPropagation();
  const handleChoicePointerDown = (event: React.PointerEvent<HTMLButtonElement>, choice?: Choice) => {
    event.preventDefault();
    event.stopPropagation();
    choose(choice);
  };

  return <div className="category-picker">
    <button type="button" className="category-picker-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span>{display}</span><ChevronDown size={18}/>
    </button>
    {open && <div className="category-picker-backdrop" onPointerDown={handleBackdropPointerDown}>
      <div className="category-picker-panel" role="dialog" aria-modal="true" aria-label="选择分类" onPointerDown={handlePanelPointerDown}>
        <div className="category-picker-heading"><strong>选择分类</strong></div>
        <div className="category-picker-columns">
          <div className="category-picker-main-list">
            {roots.map(item => <button type="button" key={item.id} className={activeCategory?.id === item.id ? 'active' : ''} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); setActiveId(item.id); }}>
              <span>{item.name}</span><ChevronRight size={16}/>
            </button>)}
          </div>
          <div className="category-picker-sub-list">
            <button type="button" className={!subcategoryId && categoryId === activeCategory?.id ? 'selected' : ''} onPointerDown={event => handleChoicePointerDown(event)}>
              <span>不细分</span>{!subcategoryId && categoryId === activeCategory?.id && <Check size={16}/>}
            </button>
            {choices.map(choice => {
              const selected = choice.kind === 'category' ? categoryId === choice.id : categoryId === activeCategory?.id && subcategoryId === choice.id;
              return <button type="button" key={choice.id} className={selected ? 'selected' : ''} onPointerDown={event => handleChoicePointerDown(event, choice)}>
                <span>{choice.name}{choice.archived ? '（已归档）' : ''}</span>{selected && <Check size={16}/>}
              </button>;
            })}
          </div>
        </div>
      </div>
    </div>}
  </div>;
}
