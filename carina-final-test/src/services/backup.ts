import { db } from '@/database/db';
import type { Category, Subcategory, Transaction, ItemProfile } from '@/models';

export async function exportBackup() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    accounts: await db.accounts.toArray(),
    categories: await db.categories.toArray(),
    subcategories: await db.subcategories.toArray(),
    categoryMatchRules: await db.categoryMatchRules.toArray(),
    people: await db.people.toArray(),
    itemProfiles: await db.itemProfiles.toArray(),
    transactions: await db.transactions.toArray(),
    transfers: await db.transfers.toArray(),
    settlements: await db.settlements.toArray()
  };
  return JSON.stringify(payload, null, 2);
}

export async function importBackup(text: string) {
  const data = JSON.parse(text);
  if (data?.version !== 1) throw new Error('不支持的备份版本');

  // Older backups may contain child categories directly in categories and have no
  // subcategory arrays. Normalize those records before replacing the local data.
  const categories: Category[] = (data.categories ?? []).map((c: Category & {parentCategoryId?: string}) => ({...c}));
  const subcategories: Subcategory[] = [...(data.subcategories ?? [])];
  const transactions: Transaction[] = [...(data.transactions ?? [])];
  const itemProfiles: ItemProfile[] = [...(data.itemProfiles ?? [])];
  const knownSubcategories = new Set(subcategories.map(s => s.id));

  for (const child of categories as (Category & {parentCategoryId?: string})[]) {
    if (!child.parentCategoryId) continue;
    const parent = categories.find(c => c.id === child.parentCategoryId);
    if (!parent) continue;
    const subcategoryId = child.id;
    if (!knownSubcategories.has(subcategoryId)) {
      subcategories.push({
        id: subcategoryId,
        categoryId: parent.id,
        name: child.name,
        sortOrder: child.sortOrder,
        isArchived: child.isArchived
      });
      knownSubcategories.add(subcategoryId);
    }
    for (const tx of transactions) {
      if (tx.categoryId === child.id) {
        tx.categoryId = parent.id;
        tx.subcategoryId = subcategoryId;
      }
    }
    for (const profile of itemProfiles) {
      if (profile.categoryId === child.id) {
        profile.categoryId = parent.id;
        profile.subcategoryId = subcategoryId;
      }
    }
    child.isArchived = true;
  }

  await db.transaction('rw', [db.accounts, db.categories, db.subcategories, db.categoryMatchRules, db.people, db.itemProfiles, db.transactions, db.transfers, db.settlements], async () => {
    await db.accounts.clear();
    await db.categories.clear();
    await db.subcategories.clear();
    await db.categoryMatchRules.clear();
    await db.people.clear();
    await db.itemProfiles.clear();
    await db.transactions.clear();
    await db.transfers.clear();
    await db.settlements.clear();
    await db.accounts.bulkAdd(data.accounts ?? []);
    await db.categories.bulkAdd(categories);
    await db.subcategories.bulkAdd(subcategories);
    await db.categoryMatchRules.bulkAdd(data.categoryMatchRules ?? []);
    await db.people.bulkAdd(data.people ?? []);
    await db.itemProfiles.bulkAdd(itemProfiles);
    await db.transactions.bulkAdd(transactions);
    await db.transfers.bulkAdd(data.transfers ?? []);
    await db.settlements.bulkAdd(data.settlements ?? []);
  });
}
