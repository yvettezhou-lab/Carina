import { db } from '@/database/db';
import { uid } from '@/utils/id';
import { touchAccount } from './accountOrdering';

interface CreateTransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  dateTime?: number;
  note?: string;
}

export async function createTransfer(input: CreateTransferInput): Promise<void> {
  if (input.fromAccountId === input.toAccountId) {
    throw new Error('转出和转入账户不能相同');
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('金额必须大于0');
  }

  const now = Date.now();
  await db.transaction('rw', db.transfers, db.accounts, async () => {
    const [from, to] = await Promise.all([
      db.accounts.get(input.fromAccountId),
      db.accounts.get(input.toAccountId),
    ]);
    if (!from || !to) throw new Error('转账账户不存在');
    if (from.isArchived || to.isArchived) throw new Error('不能向已归档账户转账');

    await db.transfers.add({
      id: uid(),
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amount: input.amount,
      dateTime: input.dateTime ?? now,
      note: input.note,
      createdAt: now,
    });
    await db.accounts.update(from.id, touchAccount(from));
    await db.accounts.update(to.id, touchAccount(to));
  });
}
