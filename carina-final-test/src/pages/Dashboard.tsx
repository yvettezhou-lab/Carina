import './Dashboard.css';
import { calculateNetWorth } from '@/services/netWorth';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Landmark, WalletCards, Banknote, CreditCard, ChevronDown, ChevronUp, ArrowLeftRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '@/database/db';
import { getAccountBalance } from '@/services/balance';
import type { Account, Category, Transaction, Transfer } from '@/models';

const icons = { cash: Banknote, bank: Landmark, card: CreditCard, wallet: WalletCards, other: WalletCards };
type AccountChange = {
  id: string;
  kind: 'transaction' | 'transfer';
  dateTime: number;
  description: string;
  detail: string;
  amount: number;
  direction: 'income' | 'expense' | 'transfer-in' | 'transfer-out';
};

export function Dashboard() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<(Account & { balance: number })[]>([]);
  const [netWorth, setNetWorth] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [active, tx, transferRows, categoryRows] = await Promise.all([
        db.accounts.filter(v => !v.isArchived).sortBy('sortOrder'),
        db.transactions.toArray(),
        db.transfers.toArray(),
        db.categories.toArray(),
      ]);
      const withBalances = await Promise.all(active.map(async a => ({ ...a, balance: await getAccountBalance(a) })));
      if (!alive) return;
      setAccounts(withBalances);
      setNetWorth(calculateNetWorth(withBalances));
      setTransactions(tx);
      setTransfers(transferRows);
      setCategories(categoryRows);
    })();
    return () => { alive = false; };
  }, []);

  const categoryNames = useMemo(() => new Map(categories.map(c => [c.id, c.name])), [categories]);

  function accountChanges(accountId: string): AccountChange[] {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    // One Quick Entry may create several person-split transactions sharing groupId.
    // Collapse only those explicit groups here; never merge unrelated entries that merely look alike.
    const transactionGroups = new Map<string, Transaction[]>();
    transactions
      .filter(t => t.accountId === accountId && t.dateTime >= cutoff)
      .forEach(t => {
        const key = t.groupId ? `group:${t.groupId}` : `single:${t.id}`;
        const group = transactionGroups.get(key);
        if (group) group.push(t);
        else transactionGroups.set(key, [t]);
      });
    const rows: AccountChange[] = Array.from(transactionGroups.values()).map(group => {
      const t = group[0]!;
      return {
        id: t.id,
        kind: 'transaction' as const,
        dateTime: t.dateTime,
        description: t.description.trim() || (t.flow === 'income' ? 'Income' : 'Expense'),
        detail: categoryNames.get(t.categoryId) ?? 'Uncategorized',
        amount: group.reduce((sum, item) => sum + item.amount, 0),
        direction: t.flow,
      };
    });
    for (const t of transfers) {
      if (t.dateTime < cutoff) continue;
      if (t.fromAccountId === accountId) {
        rows.push({
          id: t.id, kind: 'transfer' as const, dateTime: t.dateTime,
          description: 'Transfer out',
          detail: `To ${accounts.find(a => a.id === t.toAccountId)?.name ?? 'Unknown account'}`,
          amount: t.amount, direction: 'transfer-out',
        });
      } else if (t.toAccountId === accountId) {
        rows.push({
          id: t.id, kind: 'transfer', dateTime: t.dateTime,
          description: 'Transfer in',
          detail: `From ${accounts.find(a => a.id === t.fromAccountId)?.name ?? 'Unknown account'}`,
          amount: t.amount, direction: 'transfer-in',
        });
      }
    }
    return rows.sort((a, b) => b.dateTime - a.dateTime);
  }

  return (
    <section>
      <header className="hero-head">
        <div>
          <div className="brand-lockup"><div className="brand-script">Carina</div></div>
          <div className="brand-subtitle">PERSONAL LEDGER</div>
        </div>
        <div className="date-stamp">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
      </header>

      <div className="hero-card">
        <div className="hero-card-kicker">NET WORTH</div>
        <div className="hero-amount">¥{netWorth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div className="hero-rule" />
        <div className="hero-card-foot"><span>Your financial story, kept close.</span><span>2026</span></div>
      </div>

      <div className="section-heading">
        <div><span className="script-caption">The household ledger</span><h2>Accounts</h2></div>
        <button className="quiet-link" onClick={() => navigate('/settings')}>Manage <ArrowRight size={14}/></button>
      </div>

      <div className="account-list">
        {accounts.length === 0 ? (
          <div className="empty parchment-empty"><span className="empty-script">Begin your ledger</span><p>Add an account in Atelier.</p></div>
        ) : accounts.map(a => {
          const Icon = icons[a.kind] ?? WalletCards;
          const expanded = expandedAccountId === a.id;
          const changes = expanded ? accountChanges(a.id) : [];
          return (
            <div className={`dashboard-account-wrap${expanded ? ' expanded' : ''}`} key={a.id}>
              <div className="account-card">
                <div className="account-icon"><Icon size={18} strokeWidth={1.6}/></div>
                <div className="account-main">
                  <button type="button" className="dashboard-account-name" aria-expanded={expanded} onClick={() => setExpandedAccountId(current => current === a.id ? null : a.id)}>
                    <strong>{a.name}</strong>
                    {expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                  </button>
                  <span>{a.kind.toUpperCase()} · {a.currency}</span>
                </div>
                <strong className="account-balance">¥{a.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
              {expanded && (
                <div className="dashboard-account-changes">
                  <div className="dashboard-changes-heading">
                    <span>LAST 30 DAYS</span>
                    <span>{changes.length} records</span>
                  </div>
                  {changes.length === 0 ? (
                    <p className="dashboard-changes-empty">No changes in the past 30 days.</p>
                  ) : changes.map(change => (
                    <button type="button" className="dashboard-change-row" key={`${change.kind}-${change.id}`} onClick={() => navigate(change.kind === 'transfer' ? `/transfer/${change.id}` : `/transactions/${change.id}/edit`)}>
                      <span className="dashboard-change-icon">{change.kind === 'transfer' ? <ArrowLeftRight size={14}/> : <span className={change.direction === 'income' ? 'income' : 'expense'}>{change.direction === 'income' ? '+' : '−'}</span>}</span>
                      <span className="dashboard-change-copy">
                        <strong>{change.description}</strong>
                        <small>{change.detail} · {new Date(change.dateTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small>
                      </span>
                      <strong className={`dashboard-change-amount ${change.direction === 'income' || change.direction === 'transfer-in' ? 'income' : change.direction === 'expense' ? 'expense' : 'transfer'}`}>
                        {change.direction === 'income' || change.direction === 'transfer-in' ? '+' : '−'}¥{change.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </strong>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
