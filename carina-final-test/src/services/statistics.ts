import type { Account, Category, Transaction } from '@/models';

export type ReflectionMode = 'category' | 'account' | 'trend';

export type ReflectionBreakdown = {
  id: string;
  name: string;
  amount: number;
  share: number;
  transactionCount: number;
};

export type ReflectionTrendPoint = {
  key: string;
  label: string;
  income: number;
  expense: number;
};

export type ReflectionAnnualData = {
  year: number;
  income: number;
  expense: number;
  netFlow: number;
  category: ReflectionBreakdown[];
  account: ReflectionBreakdown[];
  trend: ReflectionTrendPoint[];
};

export type ReflectionData = {
  income: number;
  expense: number;
  netFlow: number;
  category: ReflectionBreakdown[];
  account: ReflectionBreakdown[];
  trend: ReflectionTrendPoint[];
};

function monthBounds(year: number, month: number) {
  return {
    start: new Date(year, month, 1).getTime(),
    end: new Date(year, month + 1, 1).getTime(),
  };
}

function yearBounds(year: number) {
  return {
    start: new Date(year, 0, 1).getTime(),
    end: new Date(year + 1, 0, 1).getTime(),
  };
}

function monthTransactions(transactions: Transaction[], year: number, month: number) {
  const { start, end } = monthBounds(year, month);
  return transactions.filter((t) => t.dateTime >= start && t.dateTime < end);
}

function yearTransactions(transactions: Transaction[], year: number) {
  const { start, end } = yearBounds(year);
  return transactions.filter((t) => t.dateTime >= start && t.dateTime < end);
}

function breakdown(
  transactions: Transaction[],
  key: 'categoryId' | 'accountId',
  names: Map<string, string>,
): ReflectionBreakdown[] {
  const expenses = transactions.filter((t) => t.flow === 'expense');
  const totals = new Map<string, { amount: number; count: number }>();

  for (const transaction of expenses) {
    const id = transaction[key];
    const current = totals.get(id) ?? { amount: 0, count: 0 };
    current.amount += transaction.amount;
    current.count += 1;
    totals.set(id, current);
  }

  const total = expenses.reduce((sum, t) => sum + t.amount, 0);
  return [...totals.entries()]
    .map(([id, value]) => ({
      id,
      name: names.get(id) ?? 'Uncategorized',
      amount: value.amount,
      share: total > 0 ? value.amount / total : 0,
      transactionCount: value.count,
    }))
    .sort((a, b) => b.amount - a.amount);
}

function summarize(
  transactions: Transaction[],
  categories: Category[],
  accounts: Account[],
) {
  const income = transactions
    .filter((t) => t.flow === 'income' && t.kind !== 'reimbursement')
    .reduce((sum, t) => sum + t.amount, 0);
  const expense = transactions
    .filter((t) => t.flow === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
  const accountNames = new Map(accounts.map((a) => [a.id, a.name]));

  return {
    income,
    expense,
    netFlow: income - expense,
    category: breakdown(transactions, 'categoryId', categoryNames),
    account: breakdown(transactions, 'accountId', accountNames),
  };
}

export function buildReflectionData(
  transactions: Transaction[],
  categories: Category[],
  accounts: Account[],
  year: number,
  month: number,
): ReflectionData {
  const current = monthTransactions(transactions, year, month);
  const summary = summarize(current, categories, accounts);

  const trend = Array.from({ length: 6 }, (_, index) => {
    const d = new Date(year, month - (5 - index), 1);
    const rows = monthTransactions(transactions, d.getFullYear(), d.getMonth());
    return {
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      income: rows.filter((t) => t.flow === 'income' && t.kind !== 'reimbursement').reduce((sum, t) => sum + t.amount, 0),
      expense: rows.filter((t) => t.flow === 'expense').reduce((sum, t) => sum + t.amount, 0),
    };
  });

  return {
    ...summary,
    trend,
  };
}

export function buildReflectionAnnualData(
  transactions: Transaction[],
  categories: Category[],
  accounts: Account[],
  year: number,
): ReflectionAnnualData {
  const current = yearTransactions(transactions, year);
  const summary = summarize(current, categories, accounts);
  const trend = Array.from({ length: 12 }, (_, month) => {
    const rows = monthTransactions(transactions, year, month);
    return {
      key: `${year}-${month}`,
      label: new Date(year, month, 1).toLocaleDateString('en-US', { month: 'short' }),
      income: rows.filter((t) => t.flow === 'income' && t.kind !== 'reimbursement').reduce((sum, t) => sum + t.amount, 0),
      expense: rows.filter((t) => t.flow === 'expense').reduce((sum, t) => sum + t.amount, 0),
    };
  });

  return {
    year,
    ...summary,
    trend,
  };
}

export function filterReflectionTransactions(
  transactions: Transaction[],
  year: number,
  month: number,
  mode: 'category' | 'account',
  id: string,
) {
  const current = monthTransactions(transactions, year, month).filter((t) => t.flow === 'expense');
  return current.filter((t) => t[mode === 'category' ? 'categoryId' : 'accountId'] === id);
}

export function filterReflectionAnnualTransactions(
  transactions: Transaction[],
  year: number,
  mode: 'category' | 'account',
  id: string,
) {
  const current = yearTransactions(transactions, year).filter((t) => t.flow === 'expense');
  return current.filter((t) => t[mode === 'category' ? 'categoryId' : 'accountId'] === id);
}

export function filterReflectionTrendTransactions(
  transactions: Transaction[],
  id: string,
) {
  const [yearText, monthText] = id.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return [];
  return monthTransactions(transactions, year, month).filter((t) => (t.flow === 'income' && t.kind !== 'reimbursement') || t.flow === 'expense');
}
