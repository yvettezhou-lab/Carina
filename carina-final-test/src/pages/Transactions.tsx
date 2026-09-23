import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Feather, Filter, Trash2, X } from 'lucide-react';
import { db } from '@/database/db';
import type { Account, Category, Person, Transaction, Transfer } from '@/models';
import { deleteTransaction } from '@/services/transactions';
import { useNavigate } from 'react-router-dom';

type LedgerItem = {
  id: string; kind: 'transaction'|'transfer'; dateTime: number; description: string;
  amount: number; flow: 'income'|'expense'; category: string; account?: string; otherAccount?: string;
  categoryId?: string; accountId?: string; otherAccountId?: string; personId?: string;
};

export function Transactions() {
  const navigate = useNavigate();
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [flowFilter, setFlowFilter] = useState<'all'|'income'|'expense'|'transfer'>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [personFilter, setPersonFilter] = useState('');

  async function refresh() {
    const [tx, transfers, accountRows, categoryRows, personRows] = await Promise.all([
      db.transactions.orderBy('dateTime').reverse().limit(100).toArray(),
      db.transfers.orderBy('dateTime').reverse().limit(100).toArray(),
      db.accounts.toArray(),
      db.categories.toArray(),\n      db.people.toArray()
    ]);
    const accountNames = Object.fromEntries(accountRows.map(x => [x.id,x.name]));
    const categoryNames = Object.fromEntries(categoryRows.map(x => [x.id,x.name]));
    const normal: LedgerItem[] = tx.map((t: Transaction) => ({
      id:t.id, kind:'transaction', dateTime:t.dateTime, description:t.description, amount:t.amount,
      flow:t.flow, category:categoryNames[t.categoryId] ?? 'Uncategorized', categoryId:t.categoryId, account:accountNames[t.accountId], accountId:t.accountId, personId:t.personId
    }));
    const transferRows: LedgerItem[] = transfers.map((t: Transfer) => ({
      id:t.id, kind:'transfer', dateTime:t.dateTime, description:'Transfer',
      amount:t.amount, flow:'expense', category:'Transfer',
      account:accountNames[t.fromAccountId], otherAccount:accountNames[t.toAccountId]
    }));
    setItems([...normal,...transferRows].sort((a,b)=>b.dateTime-a.dateTime));
  }

  useEffect(() => { refresh(); }, []);
  const filteredItems = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : null;
    const to = dateTo ? new Date(dateTo + 'T23:59:59.999').getTime() : null;
    const q = keyword.trim().toLowerCase();
    return items.filter(item => {
      if (from !== null && item.dateTime < from) return false;
      if (to !== null && item.dateTime > to) return false;
      if (flowFilter === 'transfer' && item.kind !== 'transfer') return false;
      if (flowFilter !== 'all' && flowFilter !== 'transfer' && (item.kind !== 'transaction' || item.flow !== flowFilter)) return false;
      if (categoryFilter && (item.kind !== 'transaction' || item.categoryId !== categoryFilter)) return false;
      if (accountFilter && item.accountId !== accountFilter && item.otherAccountId !== accountFilter) return false;
      if (personFilter && (item.kind !== 'transaction' || item.personId !== personFilter)) return false;
      if (q && !item.description.toLowerCase().includes(q) && !item.category.toLowerCase().includes(q) && !(item.account ?? '').toLowerCase().includes(q) && !(item.otherAccount ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, dateFrom, dateTo, flowFilter, categoryFilter, accountFilter, personFilter, keyword]);

  const activeFilterCount = [dateFrom,dateTo,flowFilter !== 'all' ? flowFilter : '',categoryFilter,accountFilter,personFilter,keyword.trim()].filter(Boolean).length;

  function clearFilters() {
    setKeyword(''); setDateFrom(''); setDateTo(''); setFlowFilter('all');
    setCategoryFilter(''); setAccountFilter(''); setPersonFilter('');
  }


  async function remove(item: LedgerItem) {
    if (!confirm(item.kind === 'transfer' ? 'Delete this transfer?' : 'Delete this record?')) return;
    if (item.kind === 'transfer') await db.transfers.delete(item.id);
    else await deleteTransaction(item.id);
    await refresh();
  }

  return <section>
    <header className="hero-head inner-head">
      <div><div className="script-title">Ledger</div><div className="brand-subtitle">EVERY ENTRY MATTERS</div></div>
      <button className="outline-button" onClick={()=>navigate('/transfer')}><ArrowLeftRight size={15}/> Transfer</button>
    </header>

    <div className="ledger-filter-toolbar">
      <button type="button" className="ledger-filter-button" onClick={()=>setShowFilters(v=>!v)}>
        <Filter size={15}/><span>Filter</span>{activeFilterCount > 0 && <b>{activeFilterCount}</b>}
      </button>
      {activeFilterCount > 0 && <button type="button" className="ledger-clear-filter" onClick={clearFilters}>Clear</button>}
      <span className="ledger-result-count">{filteredItems.length} records</span>
    </div>

    {showFilters && <div className="ledger-filter-panel">
      <div className="ledger-filter-head">
        <div><span className="panel-kicker">LEDGER FILTER</span><strong>Find the records you need.</strong></div>
        <button type="button" onClick={()=>setShowFilters(false)} aria-label="Close filters"><X size={17}/></button>
      </div>
      <label className="ledger-filter-field"><span>Keyword</span><input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="Description, category or account"/></label>
      <div className="ledger-filter-grid">
        <label className="ledger-filter-field"><span>From</span><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></label>
        <label className="ledger-filter-field"><span>To</span><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></label>
      </div>
      <div className="ledger-filter-grid">
        <label className="ledger-filter-field"><span>Type</span><select value={flowFilter} onChange={e=>setFlowFilter(e.target.value as typeof flowFilter)}><option value="all">All</option><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option></select></label>
        <label className="ledger-filter-field"><span>Category</span><select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="">All categories</option>{categories.map(x=><option key={x.id} value={x.id}>{x.name} · {x.flow === 'income' ? 'Income' : 'Expense'}</option>)}</select></label>
      </div>
      <div className="ledger-filter-grid">
        <label className="ledger-filter-field"><span>Account</span><select value={accountFilter} onChange={e=>setAccountFilter(e.target.value)}><option value="">All accounts</option>{accounts.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="ledger-filter-field"><span>Person</span><select value={personFilter} onChange={e=>setPersonFilter(e.target.value)}><option value="">All people</option>{people.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      </div>
      <div className="ledger-filter-actions"><button type="button" onClick={clearFilters}>Reset</button><button type="button" className="active" onClick={()=>setShowFilters(false)}>Done</button></div>
    </div>}
    <div className="ledger-list">
      {filteredItems.length === 0
        ? <div className="empty"><span className="empty-script">The ledger is quiet</span><p>Press + to record your first entry.</p></div>
        : filteredItems.map(item => (
          <div className="ledger-row" key={`${item.kind}-${item.id}`}>
            <button
              type="button"
              className="ledger-row-hit"
              aria-label={`Edit ${item.kind === 'transfer' ? 'transfer' : 'transaction'} ${item.description}`}
              onClick={() => navigate(item.kind === 'transfer' ? `/transfer/${item.id}` : `/transactions/${item.id}/edit`)}
            />
            <div className={`ledger-mark ${item.kind}`} aria-hidden="true">
              {item.kind === 'transfer' ? <ArrowLeftRight size={18} strokeWidth={1.5}/> : (
                <span
                  className={`ledger-feather ${item.flow}`}
                  style={{position:'relative',width:20,height:20,display:'grid',placeItems:'center'}}
                >
                  <Feather
                    size={19}
                    strokeWidth={1.5}
                    style={{transform:item.flow === 'income' ? 'rotate(-28deg)' : 'rotate(28deg)'}}
                  />
                  {item.flow === 'income'
                    ? <span style={{position:'absolute',right:-1,top:-2,fontSize:9,lineHeight:1,color:'var(--gold-soft)'}}>✦</span>
                    : <span style={{position:'absolute',left:1,bottom:0,width:4,height:4,borderRadius:'50%',background:'var(--gold-soft)'}} />}
                </span>
              )}
            </div>
            <div className="ledger-copy">
              <strong>{item.description}</strong>
              <span>{item.kind === 'transfer'
                ? `${item.account ?? 'Unknown'} → ${item.otherAccount ?? 'Unknown'}`
                : `${item.category} · ${item.account ?? 'Unknown'}`}</span>
            </div>
            <div className="ledger-right">
              <b className={item.kind === 'transfer' ? 'transfer-amount' : item.flow}>{item.kind === 'transfer' ? '⇄ ' : item.flow === 'expense' ? '− ' : '+ '}¥{item.amount.toFixed(2)}</b>
              <small>{new Date(item.dateTime).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</small>
              <button
                type="button"
                className="mini-delete"
                aria-label="Delete"
                onClick={e => { e.stopPropagation(); remove(item); }}
              ><Trash2 size={13}/></button>
            </div>
          </div>
        ))}
    </div>
  </section>;
}
