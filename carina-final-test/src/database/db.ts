import Dexie, { type Table } from 'dexie';
import type { Account, Category, ItemProfile, Person, Settlement, Transaction, Transfer } from '@/models';

export class CarinaDatabase extends Dexie {
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  people!: Table<Person, string>;
  itemProfiles!: Table<ItemProfile, string>;
  transactions!: Table<Transaction, string>;
  transfers!: Table<Transfer, string>;
  settlements!: Table<Settlement, string>;

  constructor() {
    super('carina');

    this.version(1).stores({
      accounts: 'id,name,currency,kind,sortOrder,isArchived',
      categories: 'id,flow,sortOrder,isArchived',
      people: 'id,name,sortOrder,isArchived',
      itemProfiles: 'id,name,categoryId,accountId,personId,useCount,lastUsedAt',
      transactions: 'id,accountId,categoryId,personId,itemProfileId,flow,dateTime',
      transfers: 'id,fromAccountId,toAccountId,dateTime',
    });

    this.version(2).stores({
      settlements: 'id,personId,dateTime',
    });
  }
}

export const db = new CarinaDatabase();
