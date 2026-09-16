import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '@/database/db';
import type { Account, Category, Person, Transaction } from '@/models';
import { evaluateAmountExpression } from '@/utils/amount';

const pad=(n:number)=>String(n).padStart(2,'0');
const dateKey=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const localDateTime=(timestamp:number)=>{const d=new Date(timestamp);return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;};
const useNativeDatePicker=()=>{if(typeof navigator==='undefined')return false;const ua=navigator.userAgent;const ios=/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/i.test(ua)&&navigator.maxTouchPoints>1);if(!ios)return false;const m=ua.match(/(?:OS|Version\/)(\d+)[._]/i);return m?Number(m[1])<17:false;};

function CustomDatePicker({value,onChange}:{value:string;onChange:(value:string)=>void}){
  const selected=new Date(`${value.slice(0,10)}T00:00:00`);
  const [open,setOpen]=useState(false);
  const [month,setMonth]=useState(new Date(selected.getFullYear(),selected.getMonth(),1));
  useEffect(()=>{if(open)setMonth(new Date(selected.getFullYear(),selected.getMonth(),1));},[value]);
  const firstWeekday=(month.getDay()+6)%7;
  const daysInMonth=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const cells=Array.from({length:firstWeekday+daysInMonth},(_,i)=>i<firstWeekday?null:i-firstWeekday+1);
  const monthLabel=month.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  return <div className="date-picker-wrap custom-date-picker">
    <button type="button" className="date-picker-trigger" aria-label="Choose date" onClick={()=>{setMonth(new Date(selected.getFullYear(),selected.getMonth(),1));setOpen(v=>!v)}}><span>{selected.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span><CalendarDays size={16}/></button>
    {open&&<div className="date-picker-popover"><div className="date-picker-head"><button type="button" aria-label="Previous month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ChevronLeft size={16}/></button><strong>{monthLabel}</strong><button type="button" aria-label="Next month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><ChevronRight size={16}/></button></div><div className="date-weekdays">{['M','T','W','T','F','S','S'].map((d,i)=><span key={`${d}-${i}`}>{d}</span>)}</div><div className="date-grid">{cells.map((day,i)=>day===null?<span key={`blank-${i}`}/>:<button type="button" key={day} className={day===selected.getDate()&&month.getMonth()===selected.getMonth()&&month.getFullYear()===selected.getFullYear()?'selected':''} onClick={()=>{const next=`${month.getFullYear()}-${pad(month.getMonth()+1)}-${pad(day)}`;onChange(`${next}${value.slice(10)}`);setOpen(false)}}>{day}</button>)}</div></div>}
  </div>;
}

function NativeDatePicker({value,onChange}:{value:string;onChange:(value:string)=>void}){
  const date=value.slice(0,10);
  const display=new Date(`${date}T00:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  return <div className="date-picker-wrap native-date-picker"><span className="date-picker-display">{display}</span><CalendarDays size={16}/><input type="date" aria-label="Choose date" value={date} onChange={e=>{const next=e.currentTarget.value;if(next)onChange(`${next}${value.slice(10)}`)}}/></div>;
}

function HybridDatePicker({value,onChange}:{value:string;onChange:(value:string)=>void}){const[native]=useState(useNativeDatePicker);return native?<NativeDatePicker value={value} onChange={onChange}/>:<CustomDatePicker value={value} onChange={onChange}/>;}

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
  const [dateTime,setDateTime]=useState('');

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
    setDateTime(localDateTime(t.dateTime));
    setAccounts(visibleAccounts); setCategories(visibleCategories); setPeople(visiblePeople);
  })()},[id]);

  async function save(){
    if(!tx) return;
    const n=evaluateAmountExpression(amount);
    if(!description.trim() || !Number.isFinite(n) || n<=0 || !dateTime) return;
    await db.transactions.update(tx.id,{description:description.trim(),amount:n,accountId,categoryId,personId:personId||undefined,dateTime:new Date(dateTime).getTime(),updatedAt:Date.now()});
    navigate('/transactions',{replace:true});
  }

  if(!tx) return <section><header className="topbar"><button className="text-btn" onClick={()=>navigate(-1)}>返回</button><h1>编辑记录</h1></header><div className="empty">记录不存在</div></section>;
  const cats=categories.filter(c=>c.flow===tx.flow);

  return <section>
    <header className="topbar edit-record-header"><button className="text-btn edit-back" onClick={()=>navigate(-1)}>返回</button><h1>编辑记录</h1><span className="edit-header-spacer" aria-hidden="true" /></header>
    <div className="quick-form">
      <div className="quick-entry-meta" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',alignItems:'start'}}>
        <div className="quick-meta-field"><span>日期</span><HybridDatePicker value={dateTime} onChange={setDateTime}/></div>
        <div className="quick-meta-field"><span>时间</span><input type="time" value={dateTime.slice(11,16)} onChange={e=>setDateTime(`${dateTime.slice(0,11)}${e.target.value}`)} style={{height:'44px',minHeight:'44px',appearance:'none',WebkitAppearance:'none',textAlign:'center',lineHeight:'1.2'}}/></div>
      </div>
      <label>描述<input value={description} onChange={e=>setDescription(e.target.value)}/></label>
      <label>金额<input value={amount} onChange={e=>setAmount(e.target.value.replace(/[^\d.+\-*/×÷()\s]/g,''))} inputMode="decimal"/></label>
      <label>分类<select value={categoryId} onChange={e=>setCategoryId(e.target.value)}>{cats.map(c=><option key={c.id} value={c.id}>{c.name}{c.isArchived ? '（已归档）' : ''}</option>)}</select></label>
      <label>账户<select value={accountId} onChange={e=>setAccountId(e.target.value)}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}{a.isArchived ? '（已归档）' : ''}</option>)}</select></label>
      <label>人物<select value={personId} onChange={e=>setPersonId(e.target.value)}><option value="">无</option>{people.map(p=><option key={p.id} value={p.id}>{p.name}{p.isArchived ? '（已归档）' : ''}</option>)}</select></label>
      <button className="primary" onClick={save}>保存修改</button>
    </div>
  </section>;
}
