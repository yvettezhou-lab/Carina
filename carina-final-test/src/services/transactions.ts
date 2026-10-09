import { db } from '@/database/db';
import { uid } from '@/utils/id';
import type { AdvanceStatus, Flow, Transaction, TransactionKind } from '@/models';
import { learnFromTransaction } from './learning';
import { touchAccount } from './accountOrdering';

interface CreateTransactionInput {
  description: string;
  amount: number;
  accountId: string;
  categoryId: string;
  personId?: string;
  flow: Flow;
  dateTime?: number;
  note?: string;
  kind?: TransactionKind;
  advanceStatus?: AdvanceStatus;
  settlementId?: string;
  groupId?: string;
}

export async function createTransaction(input: CreateTransactionInput): Promise<Transaction> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('金额必须大于0');
  }

  const now = Date.now();
  const transaction: Transaction = {
    id: uid(),
    description: input.description.trim(),
    amount: input.amount,
    accountId: input.accountId,
    categoryId: input.categoryId,
    personId: input.personId,
    flow: input.flow,
    dateTime: input.dateTime ?? now,
    note: input.note,
    kind: input.kind,
    advanceStatus: input.advanceStatus,
    settlementId: input.settlementId,
    groupId: input.groupId,
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction('rw', db.transactions, db.accounts, async () => {
    const account = await db.accounts.get(input.accountId);
    if (!account || account.isArchived) throw new Error('账户不存在或已归档');
    await db.transactions.add(transaction);
    await db.accounts.update(account.id, touchAccount(account));
  });

  await learnFromTransaction(transaction);
  return transaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transactions.delete(id);
}
