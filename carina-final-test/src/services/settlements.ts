import { db } from '@/database/db';
import { uid } from '@/utils/id';
import type { Settlement, Transaction } from '@/models';

export async function getPendingAdvances(personId: string): Promise<Transaction[]> {
  const rows = await db.transactions.toArray();

  return rows
    .filter(
      (transaction) =>
        transaction.kind === 'advance' &&
        transaction.advanceStatus !== 'settled' &&
        transaction.personId === personId,
    )
    .sort((a, b) => a.dateTime - b.dateTime);
}

interface SettleAdvancesInput {
  personId: string;
  transactionIds: string[];
  accountId: string;
  receivedAmount: number;
  dateTime?: number;
}

export async function settleAdvances(input: SettleAdvancesInput): Promise<string> {
  if (input.transactionIds.length === 0) {
    throw new Error('至少选择一笔代付');
  }

  if (!Number.isFinite(input.receivedAmount) || input.receivedAmount < 0) {
    throw new Error('收回金额无效');
  }

  const rows = await db.transactions.bulkGet(input.transactionIds);
  const selected = rows.filter((row): row is Transaction => Boolean(row));

  if (selected.length !== input.transactionIds.length) {
    throw new Error('部分代付记录不存在');
  }

  if (
    selected.some(
      (transaction) =>
        transaction.kind !== 'advance' ||
        transaction.advanceStatus === 'settled' ||
        transaction.personId !== input.personId,
    )
  ) {
    throw new Error('存在无效或已结算的代付记录');
  }

  const account = await db.accounts.get(input.accountId);
  if (!account || account.isArchived) {
    throw new Error('收款账户不存在或已归档');
  }

  const expectedAmount = selected.reduce((sum, transaction) => sum + transaction.amount, 0);
  const difference = input.receivedAmount - expectedAmount;
  const now = Date.now();
  const dateTime = input.dateTime ?? now;
  const settlementId = uid();

  // A category is needed only for a positive extra amount. A shortfall is
  // already reflected by the original advance expense minus the reimbursement.
  let differenceCategoryId: string | undefined;
  if (difference > 0) {
    const existing = await db.categories
      .filter((category) => category.flow === 'income' && category.name === '代付差额' && !category.isArchived)
      .first();

    differenceCategoryId = existing?.id ?? uid();

    await db.transaction('rw', db.transactions, db.accounts, db.categories, db.settlements, async () => {
      if (!existing) {
        await db.categories.add({
          id: differenceCategoryId!,
          name: '代付差额',
          flow: 'income',
          sortOrder: 999,
          isArchived: false,
        });
      }

      await writeSettlement();
    });
  } else {
    await db.transaction('rw', db.transactions, db.accounts, db.settlements, writeSettlement);
  }

  async function writeSettlement() {
    // Re-read and validate inside the write transaction to prevent a stale
    // screen or double tap from settling records that have already changed.
    const currentRows = await db.transactions.bulkGet(input.transactionIds);
    const current = currentRows.filter((row): row is Transaction => Boolean(row));

    if (
      current.length !== input.transactionIds.length ||
      current.some(
        (transaction) =>
          transaction.kind !== 'advance' ||
          transaction.advanceStatus === 'settled' ||
          transaction.personId !== input.personId,
      )
    ) {
      throw new Error('代付记录已变化或已结算，请刷新后重试');
    }

    const currentExpected = current.reduce((sum, transaction) => sum + transaction.amount, 0);
    if (currentExpected !== expectedAmount) {
      throw new Error('代付金额已变化，请刷新后重试');
    }

    if (input.receivedAmount > 0) {
      const reimbursement: Transaction = {
        id: uid(),
        description: '代付结算本金',
        amount: Math.min(input.receivedAmount, expectedAmount),
        accountId: input.accountId,
        categoryId: '',
        personId: input.personId,
        flow: 'income',
        dateTime,
        kind: 'reimbursement',
        settlementId,
        createdAt: now,
        updatedAt: now,
      };
      await db.transactions.add(reimbursement);
    }

    for (const transaction of current) {
      await db.transactions.update(transaction.id, {
        advanceStatus: 'settled',
        settlementId,
        updatedAt: now,
      });
    }

    if (difference > 0) {
      if (!differenceCategoryId) throw new Error('多收差额需要收入分类');

      const income: Transaction = {
        id: uid(),
        description: '代付结算收益',
        amount: difference,
        accountId: input.accountId,
        categoryId: differenceCategoryId,
        personId: input.personId,
        flow: 'income',
        dateTime,
        kind: 'normal',
        settlementId,
        createdAt: now,
        updatedAt: now,
      };
      await db.transactions.add(income);
    }

    const settlement: Settlement = {
      id: settlementId,
      personId: input.personId,
      transactionIds: input.transactionIds,
      accountId: input.accountId,
      expectedAmount,
      receivedAmount: input.receivedAmount,
      difference,
      differenceCategoryId,
      dateTime,
      createdAt: now,
    };

    await db.settlements.add(settlement);
    await db.accounts.update(input.accountId, { lastUsedAt: now });
  }

  return settlementId;
}
