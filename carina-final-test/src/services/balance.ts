import { db } from '@/database/db';
import type { Account } from '@/models';

export async function getAccountBalance(account: Account): Promise<number> {
  const [transactions, outgoingTransfers, incomingTransfers] = await Promise.all([
    db.transactions.where('accountId').equals(account.id).toArray(),
    db.transfers.where('fromAccountId').equals(account.id).toArray(),
    db.transfers.where('toAccountId').equals(account.id).toArray(),
  ]);

  const transactionBalance = transactions.reduce(
    (sum, transaction) => sum + (transaction.flow === 'income' ? transaction.amount : -transaction.amount),
    0,
  );
  const outgoingTotal = outgoingTransfers.reduce((sum, transfer) => sum + transfer.amount, 0);
  const incomingTotal = incomingTransfers.reduce((sum, transfer) => sum + transfer.amount, 0);

  return account.openingBalance + transactionBalance - outgoingTotal + incomingTotal;
}
