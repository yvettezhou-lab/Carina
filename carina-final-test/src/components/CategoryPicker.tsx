import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import type { Category, Subcategory } from '@/models';

type Choice = { id: string; name: string; kind: 'category' | 'subcategory'; archived?: boolean };
type PickerAction =
  | { type: 'toggle' }
  | { type: 'dismiss' }
  | { type: 'main'; id: string }
  | { type: 'choice'; id?: string; kind: 'category' | 'subcategory' | 'none' };

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

  const pendingAction = useRef<PickerAction | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openingCategoryId = useRef(categoryId);

  useEffect(() => {
    if (open) setActiveId(categories.find(item => item.id === categoryId)?.parentCategoryId ?? categoryId);
  }, [open, categoryId]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    // Keep the backdrop mounted briefly after finger-up so iOS's synthesized
    // click is swallowed instead of reaching the form underneath.
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, 180);
  };

  const choose = (action: Extract<PickerAction, { type: 'choice' }>) => {
    if (!activeCategory) return;
    if (action.kind === 'none') onChange(activeCategory.id, '');
    else if (action.kind === 'category' && action.id) onChange(action.id, '');
    else if (action.kind === 'subcategory' && action.id) onChange(activeCategory.id, action.id);
    scheduleClose();
  };

  // One delegated controller owns the full pointer lifecycle. Pointer-down only
  // records intent; state changes happen on pointer-up, after the finger lifts.
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return;
    const target = event.target;
    const trigger = target.closest<HTMLElement>('[data-picker-action="toggle"]');
    if (trigger) {
      pendingAction.current = { type: 'toggle' };
      // On iOS, the description input can remain focused while the picker opens.
      // Blur it first so the software keyboard and its input accessory bar close
      // instead of remaining underneath the category sheet.
      if (!open) {
        const focused = document.activeElement;
        if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) {
          focused.blur();
        }
      }
    }
    else {
      const backdrop = target.closest<HTMLElement>('[data-picker-backdrop]');
      const mainCategory = target.closest<HTMLElement>('[data-picker-main-category]');
      const choice = target.closest<HTMLElement>('[data-picker-choice]');
      if (backdrop && target === backdrop) pendingAction.current = { type: 'dismiss' };
      else if (mainCategory) pendingAction.current = { type: 'main', id: mainCategory.dataset.pickerMainCategory ?? '' };
      else if (choice) pendingAction.current = {
        type: 'choice',
        id: choice.dataset.pickerChoice,
        kind: (choice.dataset.choiceKind as 'category' | 'subcategory' | 'none') ?? 'none',
      };
      else pendingAction.current = null;
    }
    if (pendingAction.current) event.preventDefault();
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const action = pendingAction.current;
    pendingAction.current = null;
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();

    if (action.type === 'toggle') {
      if (!open) openingCategoryId.current = categories.find(item => item.id === categoryId)?.parentCategoryId ?? categoryId;
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      setOpen(value => !value);
    } else if (action.type === 'dismiss') {
      // If the user changed the primary category but did not choose a child,
      // commit that primary category with the implicit “不细分” selection.
      if (activeCategory && activeCategory.id !== openingCategoryId.current) {
        onChange(activeCategory.id, '');
      }
      scheduleClose();
    } else if (action.type === 'main') {
      setActiveId(action.id);
    } else {
      choose(action);
    }
  };

  const handlePointerCancel = () => {
    pendingAction.current = null;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && open) setOpen(false);
  };

  return <div className="category-picker" onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} onKeyDown={handleKeyDown}>
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
