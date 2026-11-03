import { db } from '@/database/db';
import { uid } from '@/utils/id';
import type { Category, Subcategory } from '@/models';

const DEFAULTS: Record<string, string[]> = {
  '餐饮': ['外食', '买菜', '水果', '零食', '饮品', '餐费'],
  '日常': ['家居', '清洁', '缴费', '维修', '园艺', '税费'],
  '购物': ['数码', '电子', '杂货', '其他'],
  '服饰': ['衣服', '鞋包', '配饰', '美容', '理发'],
  '医疗': ['药品', '中药', '检查', '耗材', '保险'],
  '教育': ['文具', '书籍', '课程', '兴趣班', '杂费'],
  '交通': ['公交', '地铁', '打车', '交通卡', '车辆'],
  '休闲': ['运动', '户外', '娱乐', '爱好'],
  '人情': ['礼金', '红包', '送礼', '寄礼'],
  '玄学': ['供奉', '祈福', '香品', '法器', '寺观', '放生', '咨询'],
  '工资': ['工资', '劳务'],
  '家庭': ['补贴', '赠与', '家会', '零用钱', '罚款', '补款'],
  '报销': ['工作报销', '费用报销'],
  '投资': ['利息', '收益'],
  '退款': ['退货', '退押金', '退款'],
  '其他': ['其他收入', '罚款'],
  '调整': ['月初归零'],
  '结算': ['代付差额', '结算本金'],
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
