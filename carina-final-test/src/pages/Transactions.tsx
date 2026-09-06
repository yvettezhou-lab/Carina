import { useEffect, useState } from 'react';
import { ArrowLeftRight, Feather, Trash2 } from 'lucide-react';
import { db } from '@/database/db';
import type { Transaction, Transfer } from '@/models';
import { deleteTransaction } from '@/services/transactions';
import { useNavigate } from 'react-router-dom';

type LedgerItem = {
  id: string; kind: 'transaction'|'transfer'; dateTime: number; description: string;
  amount: number; flow: 'income'|'expense'; category: string; account?: string; otherAccount?: string;
};

export function Transactions() {
  const navigate = useNavigate();
  const [items, setItems] = useState<LedgerItem[]>([]);

  async function refresh() {
    const [tx, transfers, accounts, categories] = await Promise.all([
      db.transactions.orderBy('dateTime').reverse().limit(100).toArray(),
      db.transfers.orderBy('dateTime').reverse().limit(100).toArray(),
      db.accounts.toArray(),
      db.categories.toArray()
    ]);
    const accountNames = Object.fromEntries(accounts.map(x => [x.id,x.name]));
    const categoryNames = Object.fromEntries(categories.map(x => [x.id,x.name]));
    const normal: LedgerItem[] = tx.map((t: Transaction) => ({
      id:t.id, kind:'transaction', dateTime:t.dateTime, description:t.description, amount:t.amount,
      flow:t.flow, category:categoryNames[t.categoryId] ?? 'Uncategorized', account:accountNames[t.accountId]
    }));
    const transferRows: LedgerItem[] = transfers.map((t: Transfer) => ({
      id:t.id, kind:'transfer', dateTime:t.dateTime, description:'Transfer',
      amount:t.amount, flow:'expense', category:'Transfer',
      account:accountNames[t.fromAccountId], otherAccount:accountNames[t.toAccountId]
    }));
    setItems([...normal,...transferRows].sort((a,b)=>b.dateTime-a.dateTime));
  }

  useEffect(() => { refresh(); }, []);

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

    <div className="ledger-list">
      {items.length === 0
        ? <div className="empty"><span className="empty-script">The ledger is quiet</span><p>Press + to record your first entry.</p></div>
        : items.map(item => (
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
