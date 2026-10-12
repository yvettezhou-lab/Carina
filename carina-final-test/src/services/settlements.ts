import {db} from '@/database/db';
import {uid} from '@/utils/id';
import type {Settlement,Transaction} from '@/models';

export async function getPendingAdvances(personId:string){
  const rows=await db.transactions.toArray();
  return rows
    .filter(t=>t.kind==='advance'&&t.advanceStatus!=='settled'&&t.personId===personId)
    .sort((a,b)=>a.dateTime-b.dateTime);
}

export async function settleAdvances(i:{
  personId:string;
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
        x.personId!==i.personId
      )){
        throw new Error('存在无效或已结算的代付记录');
      }
      if(!await db.accounts.get(i.accountId)){
        throw new Error('收款账户不存在');
      }

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
        const reimbursement:Transaction={
          id:uid(),
          description:'代付结算本金',
          amount:principalReceived,
          accountId:i.accountId,
          categoryId:'',
          personId:i.personId,
          flow:'income',
          dateTime,
          kind:'reimbursement',
          settlementId,
          createdAt:now,
          updatedAt:now,
        };
        await db.transactions.add(reimbursement);
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
          personId:i.personId,
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
        const byAccount=new Map<string,number>();
        for(const x of selected){
          byAccount.set(x.accountId,(byAccount.get(x.accountId)??0)+x.amount);
        }
        const sourceAccounts=[...byAccount.entries()];
        let allocated=0;
        for(let index=0;index<sourceAccounts.length;index++){
          const [sourceAccountId,sourceAmount]=sourceAccounts[index]!;
          const amount=index===sourceAccounts.length-1
            ? money(shortfall-allocated)
            : money(shortfall*sourceAmount/expectedAmount);
          if(amount<=0) continue;
          allocated=money(allocated+amount);
          const expense:Transaction={
            id:uid(),
            description:'代付少收差额（统计调整）',
            amount,
            accountId:sourceAccountId,
            categoryId:differenceCategoryId!,
            personId:i.personId,
            flow:'expense',
            dateTime,
            kind:'settlement_difference',
            settlementId,
            note:'非现金流水：只计入支出统计，不重复扣减账户余额',
            createdAt:now,
            updatedAt:now,
          };
          await db.transactions.add(expense);
        }
      }

      const settlement:Settlement={
        id:settlementId,
        personId:i.personId,
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
