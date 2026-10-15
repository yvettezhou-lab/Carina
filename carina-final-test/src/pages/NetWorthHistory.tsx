import './NetWorthHistory.css';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/database/db';
import type { Account, Transaction, Transfer } from '@/models';

type NetWorthRange = '6m' | '1y' | '2y' | '5y';

export function NetWorthHistory() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [range, setRange] = useState<NetWorthRange>('6m');
  const [currency, setCurrency] = useState('');
  const now = new Date();

  useEffect(() => {
    let alive = true;
    Promise.all([db.accounts.toArray(), db.transactions.toArray(), db.transfers.toArray()]).then(([accountRows, txRows, transferRows]) => {
      if (!alive) return;
      setAccounts(accountRows);
      setTransactions(txRows);
      setTransfers(transferRows);
    });
    return () => { alive = false; };
  }, []);

  const data = useMemo(() => {
    const eligible = accounts.filter((account) => !account.isArchived && account.includeInNetWorth !== false);
    const currencies = Array.from(new Set(eligible.map((account) => account.currency))).sort();
    const count = range === '6m' ? 6 : range === '1y' ? 12 : range === '2y' ? 24 : 60;
    const months = Array.from({ length: count }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
    const balanceAt = (account: Account, cutoff: number) => {
      const ownDelta = transactions.filter((t) => t.accountId === account.id && t.dateTime < cutoff && t.kind !== 'settlement_difference').reduce((sum, t) => sum + (t.flow === 'income' ? t.amount : -t.amount), 0);
      const syncedDelta = transactions.filter((t) => t.syncAccountId === account.id && t.dateTime < cutoff && t.kind !== 'settlement_difference').reduce((sum, t) => sum + (t.flow === 'income' ? t.amount : -t.amount), 0);
      const outgoing = transfers.filter((t) => t.fromAccountId === account.id && t.dateTime < cutoff).reduce((sum, t) => sum + t.amount, 0);
      const incoming = transfers.filter((t) => t.toAccountId === account.id && t.dateTime < cutoff).reduce((sum, t) => sum + t.amount, 0);
      return account.openingBalance + ownDelta + syncedDelta - outgoing + incoming;
    };
    const points = months.map(({ year, month }) => {
      const cutoff = Math.min(Date.now(), new Date(year, month + 1, 1).getTime());
      const values: Record<string, number> = {};
      currencies.forEach((code) => {
        values[code] = eligible.filter((account) => account.currency === code).reduce((sum, account) => sum + balanceAt(account, cutoff), 0);
      });
      return { key: year + '-' + month, label: range === '2y' || range === '5y' ? new Date(year, month, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : new Date(year, month, 1).toLocaleDateString('en-US', { month: 'short' }), year, month, values };
    });
    const currentValues: Record<string, number> = {};
    currencies.forEach((code) => {
      currentValues[code] = eligible.filter((account) => account.currency === code).reduce((sum, account) => sum + balanceAt(account, Date.now()), 0);
    });
    const selectedCurrency = currency && currencies.includes(currency) ? currency : (currencies.includes('CNY') ? 'CNY' : currencies[0] || '');
    return { currencies, points, currentValues, selectedCurrency };
  }, [accounts, transactions, transfers, range, currency]);

  const format = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <section className="networth-page">
      <header className="networth-page-header">
        <button type="button" className="networth-back" onClick={() => navigate('/')} aria-label="Back to Home"><ArrowLeft size={18}/></button>
        <div><div className="script-title">Net Worth</div><div className="brand-subtitle">YOUR ASSETS OVER TIME</div></div>
      </header>
      <div className="paper-panel networth-panel">
        <div className="networth-panel-heading">
          <div><span className="panel-kicker">THE LONG VIEW</span><h2>Net worth history</h2></div>
          <div className="networth-controls">
            <select aria-label="History range" value={range} onChange={(event) => setRange(event.target.value as NetWorthRange)}>
              <option value="6m">6 months</option><option value="1y">1 year</option><option value="2y">2 years</option><option value="5y">5 years</option>
            </select>
            <select aria-label="Net worth currency" value={data.selectedCurrency} onChange={(event) => setCurrency(event.target.value)}>
              {data.currencies.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </div>
        </div>
        <div className="networth-current">
          <span>Current net worth · {data.selectedCurrency || '—'}</span>
          <strong>{data.selectedCurrency ? format(data.currentValues[data.selectedCurrency] ?? 0) : '—'}</strong>
        </div>
        {data.points.length > 0 && data.selectedCurrency ? (
          <div className="networth-chart">
            {(() => {
              const values = data.points.map((point) => point.values[data.selectedCurrency] ?? 0);
              const max = Math.max(1, ...values);
              const barWidth = Math.min(28, 220 / Math.max(values.length, 1));
              const slot = 284 / Math.max(values.length, 1);
              return <>
                <svg viewBox="0 0 300 124" role="img" aria-label={'Monthly net worth bar chart in ' + data.selectedCurrency}>
                  <line x1="8" y1="104" x2="292" y2="104" stroke="currentColor" strokeOpacity=".22" />
                  {values.map((value, index) => {
                    const height = Math.max(2, value / max * 82);
                    const x = 8 + slot * index + (slot - barWidth) / 2;
                    const y = 104 - height;
                    return <g key={data.points[index].key}><rect x={x} y={y} width={barWidth} height={height} rx="3" fill="var(--gold)" opacity={index === values.length - 1 ? 1 : .68}/><text x={x + barWidth / 2} y={Math.max(10, y - 5)} textAnchor="middle" fontSize="7" fill="var(--ink-soft)">{(value / 1000).toFixed(1)}k</text></g>;
                  })}
                </svg>
                <div className="networth-months" style={{ gridTemplateColumns: 'repeat(' + data.points.length + ', minmax(0, 1fr))' }}>
                  {data.points.map((point, index) => <span key={point.key}>{(range === '2y' && index % 2 !== 0) || (range === '5y' && index % 6 !== 0) ? '' : point.label}</span>)}
                </div>
              </>;
            })()}
          </div>
        ) : <p className="networth-empty">Add an account to start tracking net worth.</p>}
        <div className="networth-month-list">
          {data.points.map((point, index) => {
            const value = point.values[data.selectedCurrency] ?? 0;
            const previous = data.points[index - 1]?.values[data.selectedCurrency];
            const delta = previous === undefined ? undefined : value - previous;
            return <div key={point.key}><span>{point.label} {point.year}</span><strong>{format(value)}</strong><small className={delta === undefined ? '' : delta >= 0 ? 'positive' : 'negative'}>{delta === undefined ? '—' : (delta >= 0 ? '+' : '−') + format(Math.abs(delta))}</small></div>;
          })}
        </div>
        <p className="networth-note">Balances are shown separately by currency; currencies are not added together or converted. Historical points are reconstructed from opening balances, transactions and transfers.</p>
      </div>
    </section>
  );
}
