import Dexie,{type Table} from 'dexie';
import type {Account,Category,Person,ItemProfile,Transaction,Transfer,Settlement,SettlementHistory,NetWorthBaseline,BankReconciliation} from '@/models';
export class CarinaDatabase extends Dexie{
  accounts!:Table<Account,string>;
  categories!:Table<Category,string>;
  people!:Table<Person,string>;
  itemProfiles!:Table<ItemProfile,string>;
  transactions!:Table<Transaction,string>;
  transfers!:Table<Transfer,string>;
  settlements!:Table<Settlement,string>;
  settlementHistory!:Table<SettlementHistory,string>;
  netWorthBaselines!:Table<NetWorthBaseline,string>;
  bankReconciliations!:Table<BankReconciliation,string>;
  constructor(){
    super('carina');
    this.version(1).stores({
      accounts:'id,name,currency,kind,sortOrder,isArchived',
      categories:'id,flow,sortOrder,isArchived',
      people:'id,name,sortOrder,isArchived',
      itemProfiles:'id,name,categoryId,accountId,personId,useCount,lastUsedAt',
      transactions:'id,accountId,categoryId,personId,itemProfileId,flow,dateTime',
      transfers:'id,fromAccountId,toAccountId,dateTime'
    });
    this.version(2).stores({settlements:'id,personId,dateTime'});
    this.version(3).stores({transactions:'id,accountId,categoryId,personId,itemProfileId,flow,dateTime,syncAccountId'});
    this.version(4).stores({settlementHistory:'id,settlementId,createdAt'});
    this.version(5).stores({netWorthBaselines:'id'});
    this.version(6).stores({bankReconciliations:'id,accountId,periodEnd'});
    this.version(7).stores({categories:'id,flow,parentCategoryId,sortOrder,isArchived'});
  }
}
export const db=new CarinaDatabase();