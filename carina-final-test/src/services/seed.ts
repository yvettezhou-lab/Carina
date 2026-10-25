import { db } from '@/database/db';
import { uid } from '@/utils/id';
import { ensureDefaultSubcategories } from '@/services/categoryTaxonomy';

export async function ensureSeedData() {
  if (await db.accounts.count() === 0) {
    await db.accounts.bulkAdd([
      { id: uid(), name: '现金', currency: 'CNY', kind: 'cash', openingBalance: 0, includeInNetWorth: true, sortOrder: 0, isArchived: false },
      { id: uid(), name: '银行卡', currency: 'CNY', kind: 'bank', openingBalance: 0, includeInNetWorth: true, sortOrder: 1, isArchived: false }
    ]);
  }

  if (await db.categories.count() === 0) {
    await db.categories.bulkAdd([
      { id: uid(), name: '餐饮', flow: 'expense', sortOrder: 0, isArchived: false },
      { id: uid(), name: '交通', flow: 'expense', sortOrder: 1, isArchived: false },
      { id: uid(), name: '购物', flow: 'expense', sortOrder: 2, isArchived: false },
      { id: uid(), name: '日常', flow: 'expense', sortOrder: 3, isArchived: false },
      { id: uid(), name: '工资', flow: 'income', sortOrder: 4, isArchived: false },
      { id: uid(), name: '其他收入', flow: 'income', sortOrder: 5, isArchived: false }
    ]);
  }

  // Seed optional subcategories in their own store; never create pseudo-parent categories.
  const categories = await db.categories.filter(c => !c.isArchived).sortBy('sortOrder');
  await ensureDefaultSubcategories(categories);
}
