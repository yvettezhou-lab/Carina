import Dexie,{type Table} from 'dexie';
import type {Account,Category,Person,ItemProfile,Transaction,Transfer,Settlement,SettlementHistory,NetWorthBaseline,BankReconciliation,Subcategory,CategoryMatchRule} from '@/models';
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
  subcategories!:Table<Subcategory,string>;
  categoryMatchRules!:Table<CategoryMatchRule,string>;
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
    // Keep v7 compatible with the current main branch's category schema.
    this.version(7).stores({categories:'id,flow,parentCategoryId,sortOrder,isArchived'});
    this.version(8).stores({
      subcategories:'id,categoryId,sortOrder,isArchived',
      categoryMatchRules:'id,keyword,categoryId,subcategoryId,priority,isArchived',
      itemProfiles:'id,name,categoryId,subcategoryId,accountId,personId,useCount,lastUsedAt',
      transactions:'id,accountId,categoryId,subcategoryId,personId,itemProfileId,flow,dateTime,syncAccountId'
    }).upgrade(async tx=>{
      const categories = await tx.table('categories').toArray() as (Category & {parentCategoryId?:string})[];
      const children = categories.filter(c=>c.parentCategoryId);
      for (const child of children) {
        const parent = categories.find(c=>c.id===child.parentCategoryId);
        if (!parent) continue;
        const subcategoryId = child.id;
        await tx.table('subcategories').put({
          id: subcategoryId,
          categoryId: parent.id,
          name: child.name,
          sortOrder: child.sortOrder,
          isArchived: child.isArchived
        } satisfies Subcategory);
        // Preserve historical transactions while moving their category to the parent.
        await tx.table('transactions').where('categoryId').equals(child.id).modify({
          categoryId: parent.id,
          subcategoryId
        });
        await tx.table('itemProfiles').where('categoryId').equals(child.id).modify({
          categoryId: parent.id,
          subcategoryId
        });
        // Keep the old row archived so references outside this migration remain resolvable.
        await tx.table('categories').update(child.id,{isArchived:true});
      }
    });
  }
}
export const db=new CarinaDatabase();
