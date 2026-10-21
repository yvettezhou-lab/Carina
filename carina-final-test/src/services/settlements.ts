import {db} from '@/database/db';
import {uid} from '@/utils/id';
import type {Settlement,Transaction} from '@/models';

export async function getPendingAdvances(personId?:string){
  const rows=await db.transactions.toArray();
  return rows
    .filter(t=>t.kind==='advance'&&t.advanceStatus!=='settled'&&(!personId||t.personId===personId))
    .sort((a,b)=>a.dateTime-b.dateTime);
}

export async function settleAdvances(i:{
  personId?:string;
  transactionIds:string[];
  accountId:string;
  receivedAmount:number;
  dateTime?:number;
  differenceCategoryId?:string;
}){
  if(!i.transactionIds.length) throw new Error('至少选择一笔代付');
  if(!Number.isFinite(i.receivedAmount)||i.receivedAmount<0){
    throw new Error('收回金额无效');
  }

  const money=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
  const receivedAmount=money(i.receivedAmount);
  const now=Date.now();
  const dateTime=i.dateTime??now;
  const settlementId=uid();

  await db.transaction(
    'rw',
    db.transactions,
    db.accounts,
    db.categories,
    db.settlements,
    async()=>{
      // Re-read and validate inside the write transaction to prevent duplicate settlement.
      const rows=await db.transactions.bulkGet(i.transactionIds);
      const selected=rows.filter((x):x is Transaction=>!!x);
      if(selected.length!==i.transactionIds.length){
        throw new Error('部分代付记录不存在');
      }
      if(selected.some(x=>
        x.kind!=='advance' ||
        x.advanceStatus==='settled' ||
        (i.personId && x.personId!==i.personId)
      )){
        throw new Error('存在无效或已结算的代付记录');
      }
      if(!await db.accounts.get(i.accountId)){
        throw new Error('收款账户不存在');
      }

      const personId=i.personId || selected[0]?.personId || '';
      const expectedAmount=money(selected.reduce((sum,x)=>sum+x.amount,0));
      const difference=money(receivedAmount-expectedAmount);
      let differenceCategoryId:string|undefined;

      if(difference!==0){
        const flow=difference>0?'income':'expense';
        const requested=i.differenceCategoryId
          ? await db.categories.get(i.differenceCategoryId)
          : undefined;
        const existing=requested && requested.flow===flow && !requested.isArchived
          ? requested
          : await db.categories
            .filter(c=>c.flow===flow && c.name==='代付差额' && !c.isArchived)
            .first();

        if(existing){
          differenceCategoryId=existing.id;
        }else{
          differenceCategoryId=uid();
          await db.categories.add({
            id:differenceCategoryId,
            name:'代付差额',
            flow,
            sortOrder:999,
            isArchived:false,
          });
        }
      }

      /*
       * Principal received is recorded on the actual receiving account B.
       * It is a return of the advance, not ordinary income.
       */
      const principalReceived=money(Math.min(receivedAmount,expectedAmount));
      if(principalReceived>0){
        const byPerson=new Map<string,number>();
        for(const x of selected){
          const id=x.personId || personId;
          byPerson.set(id,(byPerson.get(id)??0)+x.amount);
        }
        const personEntries=[...byPerson.entries()];
        let allocatedPrincipal=0;
        for(let index=0;index<personEntries.length;index++){
          const [id,principal]=personEntries[index]!;
          const amount=index===personEntries.length-1
            ? money(principalReceived-allocatedPrincipal)
            : money(principalReceived*principal/expectedAmount);
          if(amount<=0) continue;
          allocatedPrincipal=money(allocatedPrincipal+amount);
          await db.transactions.add({
            id:uid(),description:'代付结算本金',amount,accountId:i.accountId,
            categoryId:'',personId:id,flow:'income',dateTime,kind:'reimbursement',
            settlementId,createdAt:now,updatedAt:now,
          });
        }
      }

      // Keep every original advance amount/account unchanged.
      for(const x of selected){
        await db.transactions.update(x.id,{
          advanceStatus:'settled',
          settlementId,
          updatedAt:now,
        });
      }

      if(difference>0){
        // Any overpayment is real additional income on receiving account B.
        const income:Transaction={
          id:uid(),
          description:'代付多收差额',
          amount:difference,
          accountId:i.accountId,
          categoryId:differenceCategoryId!,
          personId,
          flow:'income',
          dateTime,
          kind:'normal',
          settlementId,
          createdAt:now,
          updatedAt:now,
        };
        await db.transactions.add(income);
      }else if(difference<0){
        /*
         * Record the shortfall as an expense adjustment on the account(s)
         * that originally paid the advances. This is statistical only:
         * balance.ts excludes settlement_difference so the same loss is
         * not deducted from account cash twice.
         *
         * If the selected advances came from multiple accounts, split the
         * adjustment proportionally by the original advance amounts.
         */
        const shortfall=money(Math.abs(difference));
        const bySource=new Map<string,{accountId:string;personId:string;amount:number}>();
        for(const x of selected){
          const person=x.personId || personId;
          const key=x.accountId+'::'+person;
          const entry=bySource.get(key)??{accountId:x.accountId,personId:person,amount:0};
          entry.amount+=x.amount;
          bySource.set(key,entry);
        }
        const sourceEntries=[...bySource.values()];
        let allocated=0;
        for(let index=0;index<sourceEntries.length;index++){
          const source=sourceEntries[index]!;
          const amount=index===sourceEntries.length-1
            ? money(shortfall-allocated)
            : money(shortfall*source.amount/expectedAmount);
          if(amount<=0) continue;
          allocated=money(allocated+amount);
          await db.transactions.add({
            id:uid(),description:'代付少收差额（统计调整）',amount,
            accountId:source.accountId,categoryId:differenceCategoryId!,
            personId:source.personId,flow:'expense',dateTime,
            kind:'settlement_difference',settlementId,
            note:'非现金流水：只计入支出统计，不重复扣减账户余额',
            createdAt:now,updatedAt:now,
          });
        }
      }

      const settlement:Settlement={
        id:settlementId,
        personId,
        transactionIds:i.transactionIds,
        accountId:i.accountId,
        expectedAmount,
        receivedAmount,
        difference,
        differenceCategoryId,
        dateTime,
        createdAt:now,
      };
      await db.settlements.add(settlement);
      await db.accounts.update(i.accountId,{lastUsedAt:now});
    }
  );

  return settlementId;
}


export async function correctSettlement(i:{
  settlementId:string;
  newAccountId:string;
  receivedAmount:number;
  dateTime:number;
  reason?:string;
}){
  if(!Number.isFinite(i.receivedAmount)||i.receivedAmount<0) throw new Error('请输入有效的收回金额');
  const money=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
  const now=Date.now();
  const receivedAmount=money(i.receivedAmount);
  return db.transaction(
    'rw',db.transactions,db.accounts,db.categories,db.settlements,db.settlementHistory,
    async()=>{
      const settlement=await db.settlements.get(i.settlementId);
      if(!settlement) throw new Error('找不到这笔结算记录');
      const oldAccount=await db.accounts.get(settlement.accountId);
      const newAccount=await db.accounts.get(i.newAccountId);
      if(!oldAccount) throw new Error('原收款账户不存在，无法安全更正');
      if(!newAccount||newAccount.isArchived) throw new Error('请选择有效的收款账户');
      const originalRows=await db.transactions.bulkGet(settlement.transactionIds);
      const originals=originalRows.filter((t):t is Transaction=>!!t);
      if(originals.length!==settlement.transactionIds.length||originals.some(t=>t.kind!=='advance'||t.settlementId!==settlement.id)){
        throw new Error('原始代付记录不完整，已取消更正以保护账本数据');
      }
      const expectedAmount=money(originals.reduce((sum,t)=>sum+t.amount,0));
      const difference=money(receivedAmount-expectedAmount);
      const linked=(await db.transactions.toArray()).filter(t=>t.settlementId===settlement.id);
      const derived=linked.filter(t=>t.kind==='reimbursement'||t.kind==='settlement_difference'||(t.kind==='normal'&&t.description==='代付多收差额'&&t.flow==='income'));
      if(settlement.receivedAmount>0&&!derived.some(t=>t.kind==='reimbursement')) throw new Error('未找到收款本金流水，已取消更正');
      if(settlement.difference>0&&!derived.some(t=>t.kind==='normal'&&t.description==='代付多收差额')) throw new Error('未找到多收差额流水，已取消更正');
      let differenceCategoryId:string|undefined;
      if(difference!==0){
        const flow=difference>0?'income':'expense';
        const current=settlement.differenceCategoryId?await db.categories.get(settlement.differenceCategoryId):undefined;
        const category=current&&current.flow===flow&&!current.isArchived?current:await db.categories.filter(c=>c.flow===flow&&c.name==='代付差额'&&!c.isArchived).first();
        if(category) differenceCategoryId=category.id;
        else { differenceCategoryId=uid(); await db.categories.add({id:differenceCategoryId,name:'代付差额',flow,sortOrder:999,isArchived:false}); }
      }
      // Rebuild only settlement-generated entries; originals stay intact. The transaction
      // is atomic, so neither partial deletion nor duplicate balance impact can persist.
      await db.transactions.bulkDelete(derived.map(t=>t.id));
      const principalReceived=money(Math.min(receivedAmount,expectedAmount));
      if(principalReceived>0) await db.transactions.add({id:uid(),description:'代付结算本金',amount:principalReceived,accountId:newAccount.id,categoryId:'',personId:settlement.personId,flow:'income',dateTime:i.dateTime,kind:'reimbursement',settlementId:settlement.id,createdAt:now,updatedAt:now});
      if(difference>0) await db.transactions.add({id:uid(),description:'代付多收差额',amount:difference,accountId:newAccount.id,categoryId:differenceCategoryId!,personId:settlement.personId,flow:'income',dateTime:i.dateTime,kind:'normal',settlementId:settlement.id,createdAt:now,updatedAt:now});
      else if(difference<0){
        const shortfall=money(Math.abs(difference));
        const byAccount=new Map<string,number>();
        for(const t of originals) byAccount.set(t.accountId,(byAccount.get(t.accountId)??0)+t.amount);
        const sources=[...byAccount.entries()]; let allocated=0;
        for(let index=0;index<sources.length;index++){
          const [sourceAccountId,sourceAmount]=sources[index]!;
          const amount=index===sources.length-1?money(shortfall-allocated):money(shortfall*sourceAmount/expectedAmount);
          if(amount<=0) continue;
          allocated=money(allocated+amount);
          await db.transactions.add({id:uid(),description:'代付少收差额（统计调整）',amount,accountId:sourceAccountId,categoryId:differenceCategoryId!,personId:settlement.personId,flow:'expense',dateTime:i.dateTime,kind:'settlement_difference',settlementId:settlement.id,note:'非现金流水：只计入支出统计，不重复扣减账户余额',createdAt:now,updatedAt:now});
        }
      }
      await db.settlements.update(settlement.id,{accountId:newAccount.id,receivedAmount,difference,differenceCategoryId,dateTime:i.dateTime});
      const historyId=uid();
      await db.settlementHistory.add({id:historyId,settlementId:settlement.id,action:'settlement_corrected',oldAccountId:oldAccount.id,newAccountId:newAccount.id,oldAccountName:oldAccount.name,newAccountName:newAccount.name,oldReceivedAmount:settlement.receivedAmount,newReceivedAmount:receivedAmount,oldDateTime:settlement.dateTime,newDateTime:i.dateTime,oldDifference:settlement.difference,newDifference:difference,reason:i.reason?.trim()||undefined,createdAt:now,affectedTransactionIds:derived.map(t=>t.id)});
      await db.accounts.update(newAccount.id,{lastUsedAt:now});
      return {changed:true,historyId};
    }
  );
}
