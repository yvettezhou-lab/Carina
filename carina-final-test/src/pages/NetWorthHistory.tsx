import './NetWorthHistory.css';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/database/db';
import type { Account, Transaction, Transfer, NetWorthBaseline } from '@/models';

type NetWorthRange = '6m' | '1y' | '2y' | '5y';

export function NetWorthHistory() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [baseline, setBaseline] = useState<NetWorthBaseline | null>(null);
  const [baselineDate, setBaselineDate] = useState(new Date().toISOString().slice(0, 10));
  const [baselineBalances, setBaselineBalances] = useState<Record<string, string>>({});
  const [range, setRange] = useState<NetWorthRange>('6m');
  const [currency, setCurrency] = useState('');
  const [saving, setSaving] = useState(false);
  const [showBaselineEditor, setShowBaselineEditor] = useState(false);
  const [error, setError] = useState('');
  const now = new Date();

  async function refresh() {
    const [accountRows, txRows, transferRows, savedBaseline] = await Promise.all([
      db.accounts.toArray(), db.transactions.toArray(), db.transfers.toArray(), db.netWorthBaselines.get('baseline'),
    ]);
    setAccounts(accountRows);
    setTransactions(txRows);
    setTransfers(transferRows);
    setBaseline(savedBaseline ?? null);
    if (savedBaseline) {
      setBaselineDate(savedBaseline.date);
      setBaselineBalances(Object.fromEntries(Object.entries(savedBaseline.balances).map(([id, value]) => [id, String(value)])));
    } else {
      setBaselineDate(new Date().toISOString().slice(0, 10));
      setBaselineBalances({});
    }
  }

  useEffect(() => {
    let alive = true;
    Promise.all([db.accounts.toArray(), db.transactions.toArray(), db.transfers.toArray(), db.netWorthBaselines.get('baseline')]).then(([accountRows, txRows, transferRows, savedBaseline]) => {
      if (!alive) return;
      setAccounts(accountRows); setTransactions(txRows); setTransfers(transferRows); setBaseline(savedBaseline ?? null);
      if (savedBaseline) {
        setBaselineDate(savedBaseline.date);
        setBaselineBalances(Object.fromEntries(Object.entries(savedBaseline.balances).map(([id, value]) => [id, String(value)])));
      }
    });
    return () => { alive = false; };
  }, []);

  const eligible = useMemo(() => accounts.filter((account) => !account.isArchived && account.includeInNetWorth !== false), [accounts]);
  const currencies = useMemo(() => Array.from(new Set(eligible.map((account) => account.currency))).sort(), [eligible]);

  async function saveBaseline() {
    setError('');
    if (!baselineDate || Number.isNaN(new Date(baselineDate + 'T00:00:00').getTime())) {
      setError('Choose a valid baseline date.'); return;
    }
    const balances: Record<string, number> = {};
    for (const account of eligible) {
      const raw = baselineBalances[account.id];
      if (raw === undefined || raw.trim() === '' || !Number.isFinite(Number(raw))) {
        setError('Enter the confirmed balance for every included account. Use 0 if the balance was zero.'); return;
      }
      balances[account.id] = Math.round(Number(raw) * 100) / 100;
    }
    const baselineTime = new Date(baselineDate + 'T00:00:00').getTime();
    if (transactions.some((transaction) => transaction.dateTime < baselineTime) && !window.confirm('There are transactions before this date. They will not be used to reconstruct the balance at the baseline date. Continue with the balances you entered?')) return;
    setSaving(true);
    try {
      const record: NetWorthBaseline = { id: 'baseline', date: baselineDate, balances, updatedAt: Date.now() };
      await db.netWorthBaselines.put(record);
      setBaseline(record);
      setShowBaselineEditor(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the baseline.');
    } finally {
      setSaving(false);
    }
  }

  const data = useMemo(() => {
    const selectedCurrency = currency && currencies.includes(currency) ? currency : (currencies.includes('CNY') ? 'CNY' : currencies[0] || '');
    if (!baseline) return { points: [], currentValues: {} as Record<string, number>, selectedCurrency, hasBaseline: false };
    const start = new Date(baseline.date + 'T00:00:00');
    const count = range === '6m' ? 6 : range === '1y' ? 12 : range === '2y' ? 24 : 60;
    const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const allMonths: { year: number; month: number }[] = [];
    for (let cursor = new Date(monthStart); cursor <= lastMonth; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
      allMonths.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
    }
    const months = allMonths.slice(-count);
    const balanceAt = (account: Account, cutoff: number) => {
      const base = baseline.balances[account.id] ?? 0;
      const ownDelta = transactions.filter((t) => t.accountId === account.id && t.dateTime >= start.getTime() && t.dateTime < cutoff && t.kind !== 'settlement_difference').reduce((sum, t) => sum + (t.flow === 'income' ? t.amount : -t.amount), 0);
      const syncedDelta = transactions.filter((t) => t.syncAccountId === account.id && t.dateTime >= start.getTime() && t.dateTime < cutoff && t.kind !== 'settlement_difference').reduce((sum, t) => sum + (t.flow === 'income' ? t.amount : -t.amount), 0);
      const outgoing = transfers.filter((t) => t.fromAccountId === account.id && t.dateTime >= start.getTime() && t.dateTime < cutoff).reduce((sum, t) => sum + t.amount, 0);
      const incoming = transfers.filter((t) => t.toAccountId === account.id && t.dateTime >= start.getTime() && t.dateTime < cutoff).reduce((sum, t) => sum + t.amount, 0);
      return base + ownDelta + syncedDelta - outgoing + incoming;
    };
    const points = months.map(({ year, month }) => {
      const cutoff = Math.min(Date.now(), new Date(year, month + 1, 1).getTime());
      const pointTime = new Date(year, month, 1).getTime() < start.getTime() ? start.getTime() : cutoff;
      const values: Record<string, number> = {};
      currencies.forEach((code) => { values[code] = eligible.filter((account) => account.currency === code).reduce((sum, account) => sum + balanceAt(account, pointTime), 0); });
      return { key: year + '-' + month, label: range === '2y' || range === '5y' ? new Date(year, month, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : new Date(year, month, 1).toLocaleDateString('en-US', { month: 'short' }), year, month, values };
    });
    const currentValues: Record<string, number> = {};
    currencies.forEach((code) => { currentValues[code] = eligible.filter((account) => account.currency === code).reduce((sum, account) => sum + balanceAt(account, Date.now()), 0); });
    return { points, currentValues, selectedCurrency, hasBaseline: true };
  }, [accounts, transactions, transfers, baseline, range, currency, currencies]);

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
              {currencies.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </div>
        </div>
        <div className="networth-current">
          <span>Current net worth · {data.selectedCurrency || '—'}</span>
          <strong>{data.selectedCurrency ? format(data.currentValues[data.selectedCurrency] ?? 0) : '—'}</strong>
        </div>
        {!baseline ? (
          <div className="networth-baseline-prompt">
            <h3>Set your starting point</h3>
            <p>Choose a date when you can confirm the balance of each account. Carina will track changes from that point forward and will not invent earlier history.</p>
            <button type="button" onClick={() => setShowBaselineEditor(true)}>Set baseline</button>
          </div>
        ) : (
          <div className="networth-baseline-status">
            <span>Tracking since <strong>{baseline.date}</strong></span>
            <button type="button" onClick={() => setShowBaselineEditor((v) => !v)}>{showBaselineEditor ? 'Cancel' : 'Edit baseline'}</button>
          </div>
        )}
        {showBaselineEditor && (
          <div className="networth-baseline-editor">
            <label>Baseline date<input type="date" value={baselineDate} onChange={(event) => setBaselineDate(event.target.value)} /></label>
            <p>Enter each included account's actual balance at the end of this date. Credit-card debt should be entered as a negative balance. These values form the starting point; transactions and transfers after this date determine the trend.</p>
            {eligible.map((account) => (
              <label className="networth-account-balance" key={account.id}>
                <span>{account.name}<small>{account.currency}</small></span>
                <input type="number" step="0.01" inputMode="decimal" value={baselineBalances[account.id] ?? ''} placeholder="Balance on baseline date" onChange={(event) => setBaselineBalances((current) => ({ ...current, [account.id]: event.target.value }))} />
              </label>
            ))}
            {error && <p className="networth-error">{error}</p>}
            <button type="button" disabled={saving} onClick={() => void saveBaseline()}>{saving ? 'Saving…' : 'Save baseline'}</button>
          </div>
        )}
        {baseline && data.points.length > 0 && data.selectedCurrency ? (
          <>
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
            <div className="networth-month-list">
              {data.points.map((point, index) => {
                const value = point.values[data.selectedCurrency] ?? 0;
                const previous = data.points[index - 1]?.values[data.selectedCurrency];
                const delta = previous === undefined ? undefined : value - previous;
                return <div key={point.key}><span>{point.label} {point.year}</span><strong>{format(value)}</strong><small className={delta === undefined ? '' : delta >= 0 ? 'positive' : 'negative'}>{delta === undefined ? 'Baseline' : (delta >= 0 ? '+' : '−') + format(Math.abs(delta))}</small></div>;
              })}
            </div>
          </>
        ) : <p className="networth-empty">{baseline ? 'No months available in this range.' : 'Set a baseline to start meaningful net worth tracking.'}</p>}
        <p className="networth-note">Balances are shown separately by currency; currencies are not added together or converted. Only balances entered for the baseline date and transactions/transfers after that date are used.</p>
      </div>
    </section>
  );
}
