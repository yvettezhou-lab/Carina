import { db } from '@/database/db';

export async function exportBackup() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    accounts: await db.accounts.toArray(),
    categories: await db.categories.toArray(),
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
  await db.transaction('rw', [db.accounts, db.categories, db.people, db.itemProfiles, db.transactions, db.transfers, db.settlements], async () => {
    await db.accounts.clear();
    await db.categories.clear();
    await db.people.clear();
    await db.itemProfiles.clear();
    await db.transactions.clear();
    await db.transfers.clear();
    await db.settlements.clear();
    await db.accounts.bulkAdd(data.accounts ?? []);
    await db.categories.bulkAdd(data.categories ?? []);
    await db.people.bulkAdd(data.people ?? []);
    await db.itemProfiles.bulkAdd(data.itemProfiles ?? []);
    await db.transactions.bulkAdd(data.transactions ?? []);
    await db.transfers.bulkAdd(data.transfers ?? []);
    await db.settlements.bulkAdd(data.settlements ?? []);
  });
}
