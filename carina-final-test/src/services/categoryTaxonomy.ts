import { db } from '@/database/db';
import { uid } from '@/utils/id';
import type { Category, Subcategory } from '@/models';

const DEFAULTS: Record<string, string[]> = {
  '餐饮': ['外食', '买菜', '水果零食', '学校餐费'],
  '居家与日用': ['清洁用品', '家居用品', '园艺'],
  '购物': ['数码家电', '日用百货', '其他购物'],
  '服饰': ['服装', '鞋包', '配饰'],
  '医疗': ['药品', '门诊检查', '治疗护理'],
  '医药': ['药品', '门诊检查', '治疗护理'],
  '日常': ['家居日用', '保险税费', '商铺费用', '数码电子', '园艺花草', '其他日常'],
  '运动': ['运动场馆', '运动装备', '户外活动'],
  '学习': ['书籍文具', '课程培训', '学习工具'],
  '娱乐活动': ['运动户外', '旅行活动', '游戏影音'],
  '交通': ['公共交通', '打车', '燃油停车'],
  '玄学': ['供养法事', '祈福祭祀', '其他信仰支出'],
};

const KEYWORDS: Array<{ category: string; subcategory: string; words: string[] }> = [
  { category: '餐饮', subcategory: '学校餐费', words: ['学校午餐', '学校中餐', '学生餐费', '学校餐费', '校餐', '中餐费'] },
  { category: '餐饮', subcategory: '外食', words: ['外卖', '餐馆', '饭店', '午饭', '晚饭', '早餐', '奶茶', '咖啡', '麦当劳', '肯德基', 'kfc'] },
  { category: '餐饮', subcategory: '买菜', words: ['菜市场', '买菜', '生鲜', '肉类', '蔬菜', '食材'] },
  { category: '餐饮', subcategory: '水果零食', words: ['水果', '零食', '薯片', '坚果', '饮料', '糖果'] },
];

export async function ensureDefaultSubcategories(categories: Category[]) {
  const existing = await db.subcategories.toArray();
  const known = new Set(existing.map(x => `${x.categoryId}|${x.name}`));
  const additions: Subcategory[] = [];
  for (const category of categories) {
    for (const [parentName, names] of Object.entries(DEFAULTS)) {
      if (category.name !== parentName) continue;
      names.forEach((name, index) => {
        if (!known.has(`${category.id}|${name}`)) additions.push({ id: uid(), categoryId: category.id, name, sortOrder: index, isArchived: false });
      });
    }
  }
  if (additions.length) await db.subcategories.bulkAdd(additions);
  return db.subcategories.toArray();
}

export async function matchSubcategory(description: string, categories: Category[]) {
  const text = description.trim().toLowerCase();
  if (!text) return undefined;
  const subs = await db.subcategories.toArray();
  const savedRules = (await db.categoryMatchRules.filter(x => !x.isArchived).toArray()).sort((a, b) => b.priority - a.priority);
  for (const rule of savedRules) {
    if (!text.includes(rule.keyword.toLowerCase())) continue;
    const parent = categories.find(x => x.id === rule.categoryId && !x.isArchived);
    const sub = subs.find(x => x.id === rule.subcategoryId && x.categoryId === rule.categoryId && !x.isArchived);
    if (parent && sub) return { categoryId: parent.id, subcategoryId: sub.id };
  }
  for (const rule of KEYWORDS) {
    const parent = categories.find(x => x.name === rule.category && !x.isArchived);
    const sub = subs.find(x => x.categoryId === parent?.id && x.name === rule.subcategory && !x.isArchived);
    if (parent && sub && rule.words.some(word => text.includes(word.toLowerCase()))) return { categoryId: parent.id, subcategoryId: sub.id };
  }
  return undefined;
}
