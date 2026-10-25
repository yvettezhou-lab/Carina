import { db } from '@/database/db';
import { uid } from '@/utils/id';

const FOOD_SUBCATEGORIES = [
  { name: '外食', sortOrder: 0, matchKeywords: ['外卖', '外食', '餐厅', '饭店', '早餐', '午饭', '午餐', '晚饭', '晚餐', '米线', '面馆', '快餐', '食堂', '汉堡', '披萨'] },
  { name: '买菜', sortOrder: 1, matchKeywords: ['买菜', '菜市场', '蔬菜', '生鲜', '肉菜'] },
  { name: '水果零食', sortOrder: 2, matchKeywords: ['水果', '零食', '坚果', '薯片', '饼干', '糖果', '果干'] },
  { name: '学校餐费', sortOrder: 3, matchKeywords: ['学校餐费', '学生餐费', '校园餐费', '学校饭卡', '饭卡充值'] }
] as const;

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

  // Idempotent upgrade: retain existing category IDs and only add missing food children.
  const food = await db.categories.where('name').equals('餐饮').first();
  if (!food || food.flow !== 'expense') return;

  const existing = await db.categories.toArray();
  for (const child of FOOD_SUBCATEGORIES) {
    const found = existing.find(c => c.parentCategoryId === food.id && c.name === child.name);
    if (found) {
      const current = found.matchKeywords ?? [];
      const merged = [...new Set([...current, ...child.matchKeywords])];
      if (merged.length !== current.length) await db.categories.update(found.id, { matchKeywords: merged });
      continue;
    }
    await db.categories.add({
      id: uid(),
      name: child.name,
      flow: 'expense',
      sortOrder: child.sortOrder,
      isArchived: false,
      parentCategoryId: food.id,
      matchKeywords: [...child.matchKeywords]
    });
  }
}
