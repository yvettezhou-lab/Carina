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

  const expectedAmount=selected.reduce((sum,x)=>sum+x.amount,0);
  const difference=i.receivedAmount-expectedAmount;
  const now=Date.now();

  let autoDifferenceCategoryId:string|undefined;
  if(difference!==0){
    const flow=difference>0?'income':'expense';
    const existing=await db.categories
      .filter(c=>c.flow===flow && c.name==='代付差额' && !c.isArchived)
      .first();

    if(existing){
      autoDifferenceCategoryId=existing.id;
    }else{
      autoDifferenceCategoryId=uid();
      await db.categories.add({
        id:autoDifferenceCategoryId,
        name:'代付差额',
        flow,
        sortOrder:999,
        isArchived:false,
      });
    }
  }

  const dateTime=i.dateTime??now;
  const settlementId=uid();

  await db.transaction(
    'rw',
    db.transactions,
    db.accounts,
    db.settlements,
    async()=>{
      /*
       * 1. 收回本金进入收款账户。
       *    reimbursement 是本金回流，不属于经营收入。
       *    即使少收，也只记录实际收到的本金，绝不改写原代付金额。
       */
      if(i.receivedAmount>0){
        const reimbursement:Transaction={
          id:uid(),
          description:'代付结算本金',
          amount:Math.min(i.receivedAmount,expectedAmount),
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

      /*
       * 2. 原代付记录保持原始金额，仅标记为已结算。
       *
       *    例如：原代付 300、实际收回 280
       *    原记录仍为 Expense 300；新增 reimbursement +280。
       *    账户实际净变化因此为 -20。
       *
       *    多笔代付同样不修改任何原始金额，避免破坏历史流水。
       */
      for(const x of selected){
        await db.transactions.update(x.id,{
          advanceStatus:'settled',
          settlementId,
          updatedAt:now,
        });
      }

      /*
       * 3. 多收的真正差额计入收入。
       *    少收不再额外创建 expense，因为损失已经体现在：
       *    原始代付 Expense - 实际收回本金。
       */
      if(difference>0){
        if(!autoDifferenceCategoryId){
          throw new Error('多收差额需要选择收入分类');
        }

        const income:Transaction={
          id:uid(),
          description:'代付结算收益',
          amount:difference,
          accountId:i.accountId,
          categoryId:autoDifferenceCategoryId,
          personId:i.personId,
          flow:'income',
          dateTime,
          kind:'normal',
          settlementId,
          createdAt:now,
          updatedAt:now,
        };

        await db.transactions.add(income);
      }

      const settlement:Settlement={
        id:settlementId,
        personId:i.personId,
        transactionIds:i.transactionIds,
        accountId:i.accountId,
        expectedAmount,
        receivedAmount:i.receivedAmount,
        difference,
        differenceCategoryId:autoDifferenceCategoryId,
        dateTime,
        createdAt:now,
      };

      await db.settlements.add(settlement);
      await db.accounts.update(i.accountId,{lastUsedAt:now});
    }
  );

  return settlementId;
}
