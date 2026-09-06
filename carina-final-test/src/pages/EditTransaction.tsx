import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '@/database/db';
import type { Account, Category, Person, Transaction } from '@/models';
import { evaluateAmountExpression } from '@/utils/amount';

export function EditTransaction() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tx,setTx]=useState<Transaction|null>(null);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [categories,setCategories]=useState<Category[]>([]);
  const [people,setPeople]=useState<Person[]>([]);
  const [description,setDescription]=useState('');
  const [amount,setAmount]=useState('');
  const [accountId,setAccountId]=useState('');
  const [categoryId,setCategoryId]=useState('');
  const [personId,setPersonId]=useState('');

  useEffect(()=>{(async()=>{
    if(!id) return;
    const [t,a,c,p]=await Promise.all([
      db.transactions.get(id),
      db.accounts.toArray(),
      db.categories.toArray(),
      db.people.toArray()
    ]);
    if(!t) return;
    const visibleAccounts = a.filter(x => !x.isArchived || x.id === t.accountId).sort((x,y) => x.sortOrder - y.sortOrder);
    const visibleCategories = c.filter(x => !x.isArchived || x.id === t.categoryId).sort((x,y) => x.sortOrder - y.sortOrder);
    const visiblePeople = p.filter(x => !x.isArchived || x.id === t.personId).sort((x,y) => x.sortOrder - y.sortOrder);
    setTx(t); setDescription(t.description); setAmount(String(t.amount));
    setAccountId(t.accountId); setCategoryId(t.categoryId); setPersonId(t.personId??'');
    setAccounts(visibleAccounts); setCategories(visibleCategories); setPeople(visiblePeople);
  })()},[id]);

  async function save(){
    if(!tx) return;
    const n=evaluateAmountExpression(amount);
    if(!description.trim() || !Number.isFinite(n) || n<=0) return;
    await db.transactions.update(tx.id,{description:description.trim(),amount:n,accountId,categoryId,personId:personId||undefined,updatedAt:Date.now()});
    navigate('/transactions',{replace:true});
  }

  if(!tx) return <section><header className="topbar"><button className="text-btn" onClick={()=>navigate(-1)}>返回</button><h1>编辑记录</h1></header><div className="empty">记录不存在</div></section>;
  const cats=categories.filter(c=>c.flow===tx.flow);

  return <section>
    <header className="topbar edit-record-header"><button className="text-btn edit-back" onClick={()=>navigate(-1)}>返回</button><h1>编辑记录</h1><span className="edit-header-spacer" aria-hidden="true" /></header>
    <div className="quick-form">
      <label>描述<input value={description} onChange={e=>setDescription(e.target.value)}/></label>
      <label>金额<input value={amount} onChange={e=>setAmount(e.target.value.replace(/[^\d.+\-*/×÷()\s]/g,''))} inputMode="decimal"/></label>
      <label>分类<select value={categoryId} onChange={e=>setCategoryId(e.target.value)}>{cats.map(c=><option key={c.id} value={c.id}>{c.name}{c.isArchived ? '（已归档）' : ''}</option>)}</select></label>
      <label>账户<select value={accountId} onChange={e=>setAccountId(e.target.value)}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}{a.isArchived ? '（已归档）' : ''}</option>)}</select></label>
      <label>人物<select value={personId} onChange={e=>setPersonId(e.target.value)}><option value="">无</option>{people.map(p=><option key={p.id} value={p.id}>{p.name}{p.isArchived ? '（已归档）' : ''}</option>)}</select></label>
      <button className="primary" onClick={save}>保存修改</button>
    </div>
  </section>;
}
