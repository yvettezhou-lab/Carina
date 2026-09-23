import { calculateNetWorth } from '@/services/netWorth';
import { useEffect, useState } from 'react';
import { ArrowRight, Landmark, WalletCards, Banknote, CreditCard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '@/database/db';
import { getAccountBalance } from '@/services/balance';
import type { Account } from '@/models';

const icons = { cash: Banknote, bank: Landmark, card: CreditCard, wallet: WalletCards, other: WalletCards };

export function Dashboard() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<(Account & { balance: number })[]>([]);
  const [netWorth, setNetWorth] = useState(0);

  useEffect(() => {
    (async () => {
      const active = await db.accounts.filter(v => !v.isArchived).sortBy('sortOrder');
      const withBalances = await Promise.all(active.map(async a => ({ ...a, balance: await getAccountBalance(a) })));
      setAccounts(withBalances);
      setNetWorth(calculateNetWorth(withBalances));
    })();
  }, []);

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
          return (
            <div className="account-card" key={a.id}>
              <div className="account-icon"><Icon size={18} strokeWidth={1.6}/></div>
              <div className="account-main"><strong>{a.name}</strong><span>{a.kind.toUpperCase()} · {a.currency}</span></div>
              <strong className="account-balance">¥{a.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </div>
          );
        })}
      </div>

    </section>
  );
}

// v2.2: Dashboard should use calculateNetWorth(accounts) as the single source of truth.

// v2.2 fix3: Net Worth should use calculateNetWorth as source of truth.
