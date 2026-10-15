import './Reflection.css';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '@/database/db';
import type { Account, Category, Person, Transaction, Transfer } from '@/models';
import { buildReflectionAnnualData, buildReflectionData, filterReflectionAnnualTransactions, filterReflectionTransactions, filterReflectionTrendTransactions } from '@/services/statistics';
import type { ReflectionBreakdown } from '@/services/statistics';
import { ReflectionChart } from '@/components/ReflectionChart';

type ReflectionMode = 'category' | 'account' | 'person' | 'trend' | 'networth';
type ReflectionPeriod = 'month' | 'year';
type NetWorthRange = '6m' | '1y' | '2y' | '5y';

function collapseForDrillDown(transactions: Transaction[]): Transaction[] {
  const grouped = new Map<string, Transaction[]>();

  transactions.forEach((transaction) => {
    let key = `single:${transaction.id}`;
    if (transaction.groupId) {
      key = `group:${transaction.groupId}`;
    } else if (transaction.personId) {
      key = `legacy:${transaction.dateTime}|${transaction.accountId}|${transaction.categoryId}|${transaction.flow}|${transaction.kind ?? ''}|${transaction.advanceStatus ?? ''}|${transaction.description.trim()}|${transaction.personId}`;
    }

    const rows = grouped.get(key);
    if (rows) rows.push(transaction);
    else grouped.set(key, [transaction]);
  });

  return Array.from(grouped.values()).map((rows) => {
    if (rows.length === 1) return rows[0]!;
    const first = rows[0]!;
    return {
      ...first,
      amount: rows.reduce((sum, row) => sum + row.amount, 0),
    };
  });
}

export function Reflection() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [netWorthCurrency, setNetWorthCurrency] = useState('');
  const [netWorthRange, setNetWorthRange] = useState<NetWorthRange>('6m');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [period, setPeriod] = useState<ReflectionPeriod>('month');
  const [mode, setMode] = useState<ReflectionMode>('category');
  const [selectedId, setSelectedId] = useState<string>();
  const [chartType, setChartType] = useState<'donut' | 'bar'>('donut');
  const [showAllDrillDown, setShowAllDrillDown] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([db.transactions.toArray(), db.categories.toArray(), db.accounts.toArray(), db.people.toArray(), db.transfers.toArray()]).then(([tx, cats, accts, ppl, xfers]) => {
      if (!alive) return;
      setTransactions(tx);
      setCategories(cats);
      setAccounts(accts);
      setPeople(ppl);
      setTransfers(xfers);
    });
    return () => { alive = false; };
  }, []);

  const data = useMemo(() => buildReflectionData(transactions, categories, accounts, year, month), [transactions, categories, accounts, year, month]);
  const annualData = useMemo(() => buildReflectionAnnualData(transactions, categories, accounts, year), [transactions, categories, accounts, year]);
  const activeData = period === 'year' ? annualData : data;

  const netWorthData = useMemo(() => {
    const eligibleAccounts = accounts.filter((account) => account.includeInNetWorth !== false);
    const currencies = Array.from(new Set(eligibleAccounts.map((account) => account.currency))).sort();
    const months = Array.from({ length: netWorthRange === '6m' ? 6 : netWorthRange === '1y' ? 12 : netWorthRange === '2y' ? 24 : 60 }, (_, index) => { const count = netWorthRange === '6m' ? 6 : netWorthRange === '1y' ? 12 : netWorthRange === '2y' ? 24 : 60; const date = new Date(year, month - (count - 1 - index), 1); return { year: date.getFullYear(), month: date.getMonth() }; });
    const balanceAt = (account: Account, cutoff: number) => {
      const ownDelta = transactions.filter((t) => t.accountId === account.id && t.dateTime < cutoff && t.kind !== 'settlement_difference').reduce((sum, t) => sum + (t.flow === 'income' ? t.amount : -t.amount), 0);
      const syncedDelta = transactions.filter((t) => t.syncAccountId === account.id && t.dateTime < cutoff && t.kind !== 'settlement_difference').reduce((sum, t) => sum + (t.flow === 'income' ? t.amount : -t.amount), 0);
      const outgoing = transfers.filter((t) => t.fromAccountId === account.id && t.dateTime < cutoff).reduce((sum, t) => sum + t.amount, 0);
      const incoming = transfers.filter((t) => t.toAccountId === account.id && t.dateTime < cutoff).reduce((sum, t) => sum + t.amount, 0);
      return account.openingBalance + ownDelta + syncedDelta - outgoing + incoming;
    };
    const points = months.map(({ year: pointYear, month: pointMonth }) => {
      const cutoff = Math.min(Date.now(), new Date(pointYear, pointMonth + 1, 1).getTime());
      const values: Record<string, number> = {};
      currencies.forEach((currency) => { values[currency] = eligibleAccounts.filter((account) => account.currency === currency).reduce((sum, account) => sum + balanceAt(account, cutoff), 0); });
      return { key: pointYear + '-' + pointMonth, label: netWorthRange === '2y' || netWorthRange === '5y' ? new Date(pointYear, pointMonth, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : new Date(pointYear, pointMonth, 1).toLocaleDateString('en-US', { month: 'short' }), year: pointYear, month: pointMonth, values };
    });
    const currentValues: Record<string, number> = {};
    currencies.forEach((currency) => { currentValues[currency] = eligibleAccounts.filter((account) => account.currency === currency).reduce((sum, account) => sum + balanceAt(account, Date.now()), 0); });
    const selectedCurrency = netWorthCurrency && currencies.includes(netWorthCurrency) ? netWorthCurrency : (currencies.includes('CNY') ? 'CNY' : currencies[0] || '');
    return { currencies, points, currentValues, selectedCurrency };
  }, [accounts, transactions, transfers, year, month, netWorthRange, netWorthCurrency]);

  const personData = useMemo(() => {
    const start = period === 'year' ? new Date(year, 0, 1) : new Date(year, month, 1);
    const end = period === 'year' ? new Date(year + 1, 0, 1) : new Date(year, month + 1, 1);
    const totals = new Map<string, number>();
    const counts = new Map<string, number>();
    transactions.forEach((transaction) => {
      const date = new Date(transaction.dateTime);
      if (accounts.find((account) => account.id === transaction.accountId)?.includeInNetWorth !== false && transaction.flow === 'expense' && transaction.kind !== 'advance' && date >= start && date < end) {
        const id = transaction.personId || '__none__';
        totals.set(id, (totals.get(id) || 0) + transaction.amount);
        counts.set(id, (counts.get(id) || 0) + 1);
      }
    });
    const total = Array.from(totals.values()).reduce((sum, amount) => sum + amount, 0);
    const result: ReflectionBreakdown[] = people
      .map((person) => {
        const amount = totals.get(person.id) || 0;
        return { id: person.id, name: person.name, amount, share: total ? amount / total : 0, transactionCount: counts.get(person.id) || 0 };
      })
      .filter((item) => item.amount > 0);
    const noPersonAmount = totals.get('__none__') || 0;
    if (noPersonAmount > 0) result.push({ id: '__none__', name: 'No person', amount: noPersonAmount, share: total ? noPersonAmount / total : 0, transactionCount: counts.get('__none__') || 0 });
    return result.sort((a, b) => b.amount - a.amount);
  }, [transactions, people, accounts, period, year, month]);

  const title = period === 'year' ? String(year) : new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const selectedTransactions = useMemo((): Transaction[] => {
    if (!selectedId) return [];
    if (mode === 'trend') return collapseForDrillDown(filterReflectionTrendTransactions(transactions, selectedId, accounts));
    if (mode === 'person') {
      const start = period === 'year' ? new Date(year, 0, 1) : new Date(year, month, 1);
      const end = period === 'year' ? new Date(year + 1, 0, 1) : new Date(year, month + 1, 1);
      return transactions.filter((transaction) => {
        const date = new Date(transaction.dateTime);
        const matchesPeriod = date >= start && date < end;
        const matchesPerson = selectedId === '__none__' ? !transaction.personId : transaction.personId === selectedId;
        return matchesPeriod && transaction.flow === 'expense' && transaction.kind !== 'advance' && matchesPerson;
      });
    }
    if (mode === 'category') {
      const rows = period === 'year'
        ? filterReflectionAnnualTransactions(transactions, year, 'category', selectedId, accounts)
        : filterReflectionTransactions(transactions, year, month, 'category', selectedId, accounts);
      return collapseForDrillDown(rows);
    }
    const rows = period === 'year'
      ? filterReflectionAnnualTransactions(transactions, year, 'account', selectedId, accounts)
      : filterReflectionTransactions(transactions, year, month, 'account', selectedId, accounts);
    return collapseForDrillDown(rows);
  }, [transactions, accounts, year, month, period, mode, selectedId]);

  function shift(delta: number) {
    if (period === 'year') setYear((current) => current + delta);
    else {
      const d = new Date(year, month + delta, 1);
      setYear(d.getFullYear());
      setMonth(d.getMonth());
    }
    setSelectedId(undefined);
    setShowAllDrillDown(false);
  }

  function selectPeriod(next: ReflectionPeriod) {
    setPeriod(next);
    setSelectedId(undefined);
    setShowAllDrillDown(false);
  }

  function selectMode(next: ReflectionMode) {
    setMode(next);
    setSelectedId(undefined);
    setShowAllDrillDown(false);
    if (next === 'trend') setChartType('bar');
  }

  function toggleChartType() {
    if (mode === 'trend') return;
    setChartType((current) => current === 'donut' ? 'bar' : 'donut');
    setSelectedId(undefined);
    setShowAllDrillDown(false);
  }

  function selectChart(id: string) {
    setSelectedId((current) => current === id ? undefined : id);
    setShowAllDrillDown(false);
  }

  const selectedName = selectedId
    ? mode === 'category'
      ? activeData.category.find((item) => item.id === selectedId)?.name
      : mode === 'account'
        ? activeData.account.find((item) => item.id === selectedId)?.name
        : mode === 'person'
          ? personData.find((item) => item.id === selectedId)?.name
          : activeData.trend.find((item) => item.key === selectedId)?.label
    : undefined;

  return (
    <section>
      <div className="reflection-header-controls">
        <header className="hero-head inner-head">
          <div><div className="script-title">Reflection</div><div className="brand-subtitle">{period === 'year' ? 'A YEAR IN REVIEW' : 'A MONTH IN REVIEW'}</div></div>
          <div className="month-switch">
            <button onClick={() => shift(-1)} aria-label={period === 'year' ? 'Previous year' : 'Previous month'}>‹</button>
            <span>{title}</span>
            <button onClick={() => shift(1)} aria-label={period === 'year' ? 'Next year' : 'Next month'}>›</button>
          </div>
        </header>

        <div className="reflection-period" role="tablist" aria-label="Reflection period">
          <button role="tab" aria-selected={period === 'month'} className={period === 'month' ? 'active' : ''} onClick={() => selectPeriod('month')}>Month</button>
          <button role="tab" aria-selected={period === 'year'} className={period === 'year' ? 'active' : ''} onClick={() => selectPeriod('year')}>Year</button>
        </div>
      </div>

      <div className="reflection-summary">
        <div><span>INCOME</span><strong className="positive">¥{activeData.income.toFixed(2)}</strong></div>
        <div><span>EXPENSE</span><strong>¥{activeData.expense.toFixed(2)}</strong></div>
        <div><span>NET FLOW</span><strong className={activeData.netFlow >= 0 ? 'positive' : 'negative'}>{activeData.netFlow >= 0 ? '+' : '−'} ¥{Math.abs(activeData.netFlow).toFixed(2)}</strong></div>
      </div>

      <div className="reflection-mode" role="tablist" aria-label="Reflection analysis">
        {([['category', 'Category'], ['account', 'Account'], ['person', 'Person'], ['trend', 'Trend'], ['networth', 'Net Worth']] as const).map(([value, label]) => (
          <button key={value} role="tab" aria-selected={mode === value} className={mode === value ? 'active' : ''} onClick={() => selectMode(value)}>{label}</button>
        ))}
      </div>

      <div className="paper-panel reflection-analysis">
        <div className="panel-kicker">{mode === 'category' ? 'WHERE YOUR LIFE FLOWS' : mode === 'account' ? 'WHERE MONEY MOVES' : mode === 'person' ? 'WHO BENEFITS' : period === 'year' ? 'THE YEAR AT A GLANCE' : 'THE LAST SIX MONTHS'}</div>
        <h2>{mode === 'category' ? 'Spending by category' : mode === 'account' ? 'Spending by account' : mode === 'person' ? 'Spending by person' : period === 'year' ? 'Monthly money in motion' : 'Money in motion'}</h2>
        {mode === 'networth' ? (
          <div className="reflection-networth">
            <div className="reflection-networth-heading"><div><span className="panel-kicker">YOUR ASSETS OVER TIME</span><h3>Net worth history</h3></div><div className="reflection-networth-controls"><select aria-label="History range" value={netWorthRange} onChange={(event) => setNetWorthRange(event.target.value as NetWorthRange)}><option value="6m">6 months</option><option value="1y">1 year</option><option value="2y">2 years</option><option value="5y">5 years</option></select><select aria-label="Net worth currency" value={netWorthData.selectedCurrency} onChange={(event) => setNetWorthCurrency(event.target.value)}>{netWorthData.currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></div></div>
            <div className="reflection-networth-current"><span>Current net worth · {netWorthData.selectedCurrency || '—'}</span><strong>{netWorthData.selectedCurrency ? netWorthData.currentValues[netWorthData.selectedCurrency]?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</strong></div>
            <div className="reflection-networth-chart">
              {(() => { const currency = netWorthData.selectedCurrency; const values = netWorthData.points.map((point) => point.values[currency] ?? 0); const max = Math.max(1, ...values); const barWidth = Math.min(28, 220 / Math.max(values.length, 1)); const slot = 284 / Math.max(values.length, 1); return <><svg viewBox="0 0 300 124" role="img" aria-label={'Monthly net worth bar chart in ' + currency}><line x1="8" y1="104" x2="292" y2="104" stroke="currentColor" strokeOpacity=".22" />{values.map((value, index) => { const height = Math.max(2, value / max * 82); const x = 8 + slot * index + (slot - barWidth) / 2; const y = 104 - height; return <g key={netWorthData.points[index].key}><rect x={x} y={y} width={barWidth} height={height} rx="3" fill="var(--gold)" opacity={index === values.length - 1 ? 1 : .68} /><text x={x + barWidth / 2} y={Math.max(10, y - 5)} textAnchor="middle" fontSize="7" fill="var(--ink-soft)">{(value / 1000).toFixed(1)}k</text></g>; })}</svg><div className="reflection-networth-months" style={{ gridTemplateColumns: 'repeat(' + netWorthData.points.length + ', minmax(0, 1fr))' }}>{netWorthData.points.map((point, index) => <span key={point.key}>{(netWorthRange === '2y' && index % 2 !== 0) || (netWorthRange === '5y' && index % 6 !== 0) ? '' : point.label}</span>)}</div></>; })()}
            </div>
            <div className="reflection-networth-list">{netWorthData.points.map((point, index) => { const value = point.values[netWorthData.selectedCurrency] ?? 0; const previous = netWorthData.points[index - 1]?.values[netWorthData.selectedCurrency]; const delta = previous === undefined ? undefined : value - previous; return <div key={point.key}><span>{point.label} {period === 'year' ? '' : point.year}</span><strong>{value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><small className={delta === undefined ? '' : delta >= 0 ? 'positive' : 'negative'}>{delta === undefined ? '—' : (delta >= 0 ? '+' : '−') + Math.abs(delta).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</small></div>; })}</div>
            <p className="reflection-networth-note">Balances are shown separately by currency; currencies are not added together or converted. Historical points are reconstructed from opening balances, transactions and transfers.</p>
          </div>
        ) : mode === 'trend' ? (
          <ReflectionChart mode="trend" chartType="bar" data={activeData.trend} selectedId={selectedId} onSelect={selectChart} onToggleChart={toggleChartType} />
        ) : mode === 'category' ? (
          <ReflectionChart mode="category" chartType={chartType} data={activeData.category} selectedId={selectedId} onSelect={selectChart} onToggleChart={toggleChartType} />
        ) : mode === 'account' ? (
          <ReflectionChart mode="account" chartType={chartType} data={activeData.account} selectedId={selectedId} onSelect={selectChart} onToggleChart={toggleChartType} />
        ) : (
          <ReflectionChart mode="person" chartType={chartType} data={personData} selectedId={selectedId} onSelect={selectChart} onToggleChart={toggleChartType} />
        )}

        {mode !== 'networth' && selectedId && selectedTransactions.length > 0 && (
          <div className="reflection-drilldown">
            {mode === 'trend' ? (
              <div className="reflection-drilldown-head">
                <div><span className="panel-kicker">DRILL DOWN</span><strong>{selectedName}</strong></div>
                <span><b className="positive">+¥{Math.abs(selectedTransactions.filter((t) => t.flow === 'income' && t.kind !== 'reimbursement').reduce((sum, t) => sum + t.amount, 0)).toFixed(2)}</b>{' '}<b>−¥{selectedTransactions.filter((t) => t.flow === 'expense').reduce((sum, t) => sum + t.amount, 0).toFixed(2)}</b></span>
              </div>
            ) : (
              <div className="reflection-drilldown-head"><div><span className="panel-kicker">DRILL DOWN</span><strong>{selectedName}</strong></div><span>¥{selectedTransactions.reduce((sum, t) => sum + t.amount, 0).toFixed(2)}</span></div>
            )}
            {(showAllDrillDown ? selectedTransactions : selectedTransactions.slice(0, 6)).map((transaction) => (
              <button className="reflection-transaction" key={transaction.id} onClick={() => navigate(`/transactions/${transaction.id}/edit`)}>
                <span><strong>{transaction.description || 'Untitled'}</strong><small>{new Date(transaction.dateTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small></span>
                <b>¥{transaction.amount.toFixed(2)}</b>
              </button>
            ))}
            {selectedTransactions.length > 6 && (
              <button type="button" className="reflection-drilldown-toggle" onClick={() => setShowAllDrillDown((current) => !current)}>{showAllDrillDown ? 'Show less' : `View all ${selectedTransactions.length}`}</button>
            )}
          </div>
        )}
        {mode !== 'networth' && selectedId && selectedTransactions.length === 0 && <div className="reflection-selection-note">No records in this selection.</div>}
      </div>

      <div className="reflection-note">
        <span className="script-caption">A small note</span>
        <p>{activeData.expense === 0 ? 'Every ledger has quiet pages.' : activeData.netFlow >= 0 ? `A ${period === 'year' ? 'year' : 'month'} in balance is worth remembering.` : 'Some months are for spending. The ledger simply remembers.'}</p>
      </div>
    </section>
  );
}
