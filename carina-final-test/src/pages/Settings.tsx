import { useEffect, useRef, useState } from 'react';
import { Database, Download, Plus, Upload, Users, Tags, Wallet } from 'lucide-react';
import { db } from '@/database/db';
import { uid } from '@/utils/id';
import { exportBackup, importBackup } from '@/services/backup';
import { getAccountBalance } from '@/services/balance';
import type { Account, Category, Person } from '@/models';

export function Settings() {
  const [accounts,setAccounts]=useState<(Account & { balance:number })[]>([]);
  const [categories,setCategories]=useState<Category[]>([]);
  const [people,setPeople]=useState<Person[]>([]);
  const fileRef=useRef<HTMLInputElement>(null);
    const [editOpeningBalance,setEditOpeningBalance]=useState('0');
    const [accountEditorMode,setAccountEditorMode]=useState<'add'|'edit'|null>(null);
    const [editingAccount,setEditingAccount]=useState<(Account & { balance:number }) | null>(null);
    const [editName,setEditName]=useState('');
    const [editIncludeInNetWorth,setEditIncludeInNetWorth]=useState(true);
  const [categoryEditorOpen,setCategoryEditorOpen]=useState(false);
  const [categoryFlow,setCategoryFlow]=useState<'expense'|'income'>('expense');
  const [categoryName,setCategoryName]=useState('');

  async function refresh(){
    const active = await db.accounts.filter(x=>!x.isArchived).sortBy('sortOrder');
    setAccounts(await Promise.all(active.map(async x => ({ ...x, balance: await getAccountBalance(x) }))));
    setCategories(await db.categories.filter(x=>!x.isArchived).sortBy('sortOrder'));
    setPeople(await db.people.filter(x=>!x.isArchived).sortBy('sortOrder'));
  }
  useEffect(()=>{refresh()},[]);

  function openAddAccount(){
    setEditingAccount(null);
    setEditName('');
    setEditOpeningBalance('0');
    setEditIncludeInNetWorth(true);
    setAccountEditorMode('add');
}

function openEditAccount(account: Account & { balance:number }){
    setEditingAccount(account);
    setEditName(account.name);
    setEditOpeningBalance(String(account.openingBalance ?? 0));
    setEditIncludeInNetWorth(account.includeInNetWorth);
    setAccountEditorMode('edit');
}

async function saveAccountEditor(){
    const name=editName.trim();

    if(!name) return;

    const openingBalance=
        editOpeningBalance.trim()==='' ? 0 : Number(editOpeningBalance);

    if(!Number.isFinite(openingBalance)){
        alert('Opening balance must be a number.');
        return;
    }

    if(accountEditorMode==='add'){
        await db.accounts.add({
            id:uid(),
            name,
            currency:'CNY',
            kind:'other',
            openingBalance,
            includeInNetWorth:editIncludeInNetWorth,
            sortOrder:Date.now(),
            isArchived:false
        });
    }

    if(accountEditorMode==='edit' && editingAccount){
        await db.accounts.update(editingAccount.id,{
            name,
            openingBalance,
            includeInNetWorth:editIncludeInNetWorth
        });
    }

    setAccountEditorMode(null);
    setEditingAccount(null);
    await refresh();
}

async function deleteAccountEditor(account: Account){
    const confirmed=confirm(
        `Delete account "${account.name}"?\n\nHistorical transactions will NOT be deleted.`
    );

    if(!confirmed) return;

    await db.accounts.update(account.id,{
        isArchived:true
    });

    setAccountEditorMode(null);
    setEditingAccount(null);
    await refresh();
}

async function moveAccount(accountId: string, direction: -1 | 1) {
    const index = accounts.findIndex(a => a.id === accountId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= accounts.length) return;

    const next = [...accounts];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];

    await Promise.all(
      next.map((account, i) =>
        db.accounts.update(account.id, { sortOrder: i })
      )
    );

    await refresh();
  }

  function addCategory(){
    setCategoryFlow('expense');
    setCategoryName('');
    setCategoryEditorOpen(true);
  }

  async function saveCategory(){
    const name=categoryName.trim();
    if(!name) return;
    await db.categories.add({
      id:uid(),
      name,
      flow:categoryFlow,
      sortOrder:Date.now(),
      isArchived:false
    });
    setCategoryEditorOpen(false);
    setCategoryName('');
    await refresh();
  }
  async function addPerson(){
    const name=prompt('Person name');
    if(name?.trim()) { await db.people.add({id:uid(),name:name.trim(),isArchived:false,sortOrder:Date.now()}); refresh(); }
  }

  async function editPerson(person: Person){
    const name=prompt('Person name',person.name);
    if(!name?.trim()) return;
    await db.people.update(person.id,{name:name.trim()});
    await refresh();
  }

  async function deletePerson(person: Person){
    const confirmed=confirm(`Delete person "${person.name}"?\n\nHistorical transactions will NOT be deleted.`);
    if(!confirmed) return;
    await db.people.update(person.id,{isArchived:true});
    await refresh();
  }

  async function backup(){
    const blob=new Blob([await exportBackup()],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`carina-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(a.href);
  }
  async function restore(file:File){ await importBackup(await file.text()); await refresh(); if(fileRef.current) fileRef.current.value=''; alert('Restore complete'); }

  
    if(accountEditorMode){
      return (
        <section>
          <header className="hero-head inner-head">
            <div>
              <div className="script-title">Atelier</div>
              <div className="brand-subtitle">YOUR PRIVATE WORKSHOP</div>
            </div>
          </header>

          <div className="settings-intro">
            Shape the ledger to fit your life.
          </div>

          <div className="atelier-section">
            <div className="atelier-title">
              <Wallet size={17}/>
              <div>
                <span>
                  {accountEditorMode==='add' ? 'ADD ACCOUNT' : 'EDIT ACCOUNT'}
                </span>
                <small>
                  {accountEditorMode==='add'
                    ? 'Create a new place for your money'
                    : 'Edit this account'}
                </small>
              </div>
            </div>

            <div style={{paddingTop:"10px"}}>

              <label style={{
                display:"block",
                marginBottom:"20px"
              }}>
                <span style={{
                  display:"block",
                  fontSize:"12px",
                  marginBottom:"7px",
                  opacity:.7
                }}>
                  Account name
                </span>

                <input
                  autoFocus
                  value={editName}
                  onChange={e=>setEditName(e.target.value)}
                  style={{
                    width:"100%",
                    boxSizing:"border-box",
                    padding:"12px 13px",
                    border:"1px solid rgba(100,80,55,.28)",
                    background:"transparent",
                    color:"inherit",
                    font:"inherit",
                    outline:"none"
                  }}
                />
              </label>

              <label style={{
                display:"block",
                marginBottom:"20px"
              }}>
                <span style={{
                  display:"block",
                  fontSize:"12px",
                  marginBottom:"7px",
                  opacity:.7
                }}>
                  Opening balance
                </span>

                <input
                  type="number"
                  inputMode="decimal"
                  value={editOpeningBalance}
                  onChange={e=>setEditOpeningBalance(e.target.value)}
                  style={{
                    width:"100%",
                    boxSizing:"border-box",
                    padding:"12px 13px",
                    border:"1px solid rgba(100,80,55,.28)",
                    background:"transparent",
                    color:"inherit",
                    font:"inherit",
                    outline:"none"
                  }}
                />
              </label>

              <label style={{
                display:"flex",
                alignItems:"center",
                gap:"10px",
                marginBottom:"28px",
                cursor:"pointer",
                fontSize:"13px"
              }}>
                <span
  onClick={()=>setEditIncludeInNetWorth(!editIncludeInNetWorth)}
  style={{
    width:"18px",
    height:"18px",
    border:"1px solid rgba(120,100,70,.5)",
    borderRadius:"3px",
    display:"inline-flex",
    alignItems:"center",
    justifyContent:"center",
    cursor:"pointer",
    background:editIncludeInNetWorth ? "#78613f" : "transparent",
    color:"white",
    fontSize:"14px",
    lineHeight:"18px"
  }}
>
  {editIncludeInNetWorth ? "✓" : ""}
</span>
                <span>Include in net assets</span>
              </label>

              <div style={{
                display:"flex",
                justifyContent:"flex-end",
                gap:"18px",
                paddingTop:"18px",
                borderTop:"1px solid rgba(120,100,70,.14)"
              }}>
                <button
                  type="button"
                  onClick={()=>{
                    setAccountEditorMode(null);
                    setEditingAccount(null);
                  }}
                  style={{
                    border:0,
                    background:"transparent",
                    color:"inherit",
                    font:"inherit",
                    cursor:"pointer",
                    padding:"9px 4px",
                    opacity:.7
                  }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={saveAccountEditor}
                  disabled={!editName.trim()}
                  style={{
                    border:"1px solid rgba(100,80,55,.35)",
                    background:"transparent",
                    color:"inherit",
                    font:"inherit",
                    cursor:"pointer",
                    padding:"9px 20px",
                    opacity:editName.trim()?1:.45
                  }}
                >
                  Save
                </button>
              </div>

              {accountEditorMode==='edit' && editingAccount && (
                <div style={{
                  marginTop:"34px",
                  paddingTop:"22px",
                  borderTop:"1px solid rgba(155,55,45,.20)"
                }}>
                  <button
                    type="button"
                    onClick={()=>deleteAccountEditor(editingAccount)}
                    style={{
                      border:0,
                      background:"transparent",
                      color:"#a33b31",
                      font:"inherit",
                      fontSize:"13px",
                      cursor:"pointer",
                      padding:"8px 0"
                    }}
                  >
                    Delete account
                  </button>
                </div>
              )}

            </div>
          </div>
        </section>
      );
    }

return <section>
    <header className="hero-head inner-head">
      <div><div className="script-title">Atelier</div><div className="brand-subtitle">YOUR PRIVATE WORKSHOP</div></div>
    </header>

    <div className="settings-intro">Shape the ledger to fit your life.</div>

    <div className="atelier-section">
      <div className="atelier-title"><Wallet size={17}/><div><span>ACCOUNTS</span><small>Where your money lives</small></div></div>
      {accounts.map(x=>(
              <div
                key={x.id}
                className="atelier-row"
                style={{
                  display:"flex",
                  alignItems:"center",
                  width:"100%",
                  minHeight:"64px",
                  padding:"14px 0",
                  borderBottom:"1px solid rgba(120,100,70,.14)",
                  background:"transparent"
                }}
              >
                <div style={{
                  flex:1,
                  minWidth:0
                }}>
                  <strong>{x.name}</strong>

                  <small style={{
                    display:"block",
                    marginTop:"4px",
                    opacity:.55
                  }}>
                    {x.currency} · Opening ¥{x.openingBalance.toLocaleString('en-US',{
                      minimumFractionDigits:2,
                      maximumFractionDigits:2
                    })}
                    {" · "}
                    {x.includeInNetWorth ? "Net assets" : "Spending only"}
                  </small>
                </div>

                <em style={{
                  marginLeft:"16px",
                  flexShrink:0,
                  fontStyle:"normal"
                }}>
                  {x.balance.toLocaleString('en-US',{
                    minimumFractionDigits:2,
                    maximumFractionDigits:2
                  })}
                </em>

                <button
                  type="button"
                  onClick={() => moveAccount(x.id, -1)}
                  disabled={accounts.findIndex(a => a.id === x.id) === 0}
                  aria-label={`Move ${x.name} up`}
                  style={{
                    marginLeft:"16px",
                    flexShrink:0,
                    border:0,
                    background:"transparent",
                    color:"inherit",
                    font:"inherit",
                    fontSize:"13px",
                    opacity:accounts.findIndex(a => a.id === x.id) === 0 ? .2 : .58,
                    cursor:"pointer",
                    padding:"8px 4px"
                  }}
                >
                  ↑
                </button>

                <button
                  type="button"
                  onClick={() => moveAccount(x.id, 1)}
                  disabled={accounts.findIndex(a => a.id === x.id) === accounts.length - 1}
                  aria-label={`Move ${x.name} down`}
                  style={{
                    flexShrink:0,
                    border:0,
                    background:"transparent",
                    color:"inherit",
                    font:"inherit",
                    fontSize:"13px",
                    opacity:accounts.findIndex(a => a.id === x.id) === accounts.length - 1 ? .2 : .58,
                    cursor:"pointer",
                    padding:"8px 4px"
                  }}
                >
                  ↓
                </button>

                <button
                  type="button"
                  onClick={() => openEditAccount(x)}
                  style={{
                    marginLeft:"8px",
                    flexShrink:0,
                    border:0,
                    background:"transparent",
                    color:"inherit",
                    font:"inherit",
                    fontSize:"12px",
                    opacity:.58,
                    cursor:"pointer",
                    padding:"8px 0"
                  }}
                >
                  Edit
                </button>
              </div>
            ))}

            <button className="atelier-add" onClick={openAddAccount} style={{marginBottom:"24px"}}><Plus size={15}/> Add account</button>

            </div>

      <div className="atelier-section">
        {categories.map(x=><div className="atelier-row" key={x.id}><span>{x.name}</span><em>{x.flow==='expense'?'Expense':'Income'}</em></div>)}
      <button className="atelier-add" onClick={addCategory}><Plus size={15}/> Add category</button>
      {categoryEditorOpen && (
        <div style={{
          position:"fixed", inset:0, zIndex:1000,
          display:"flex", alignItems:"center", justifyContent:"center",
          padding:"20px", background:"rgba(20,28,45,.18)"
        }}>
          <div style={{
            width:"min(360px,calc(100vw - 40px))",
            boxSizing:"border-box", padding:"24px",
            background:"#fffdf7", color:"var(--ink)",
            border:"1px solid var(--line)", borderRadius:"4px",
            boxShadow:"0 20px 50px rgba(20,28,45,.22)"
          }}>
            <div style={{fontSize:"18px",fontWeight:600,marginBottom:"18px"}}>Add category</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"16px"}}>
              <button type="button" onClick={()=>setCategoryFlow('expense')} style={{
                padding:"10px", border:"1px solid rgba(100,80,55,.28)",
                background:categoryFlow==='expense' ? "#111827" : "transparent",
                color:categoryFlow==='expense' ? "#fff" : "inherit", font:"inherit"
              }}>Expense</button>
              <button type="button" onClick={()=>setCategoryFlow('income')} style={{
                padding:"10px", border:"1px solid rgba(100,80,55,.28)",
                background:categoryFlow==='income' ? "#111827" : "transparent",
                color:categoryFlow==='income' ? "#fff" : "inherit", font:"inherit"
              }}>Income</button>
            </div>
            <input
              autoFocus
              value={categoryName}
              onChange={e=>setCategoryName(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter') saveCategory(); if(e.key==='Escape') setCategoryEditorOpen(false)}}
              placeholder={categoryFlow==='expense' ? 'Expense category name' : 'Income category name'}
              style={{
                width:"100%", boxSizing:"border-box", padding:"12px 13px",
                border:"1px solid rgba(100,80,55,.28)", background:"transparent",
                color:"inherit", font:"inherit", outline:"none", marginBottom:"18px"
              }}
            />
            <div style={{display:"flex",justifyContent:"flex-end",gap:"18px",borderTop:"1px solid rgba(120,100,70,.14)",paddingTop:"16px"}}>
              <button type="button" onClick={()=>setCategoryEditorOpen(false)} style={{border:0,background:"transparent",color:"inherit",font:"inherit",padding:"9px 4px"}}>Cancel</button>
              <button type="button" onClick={saveCategory} disabled={!categoryName.trim()} style={{
                border:"1px solid rgba(100,80,55,.35)", background:"transparent",
                color:"inherit", font:"inherit", padding:"9px 20px",
                opacity:categoryName.trim()?1:.45
              }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>

    <div className="atelier-section">
      <div className="atelier-title"><Users size={17}/><div><span>PEOPLE</span><small>Names that matter to your ledger</small></div></div>
      {people.map(x=>(
              <div className="atelier-row" key={x.id}>
                <span style={{flex:1,minWidth:0}}>{x.name}</span>
                <button
                  type="button"
                  onClick={()=>editPerson(x)}
                  style={{
                    marginLeft:"16px",
                    flexShrink:0,
                    border:0,
                    background:"transparent",
                    color:"inherit",
                    font:"inherit",
                    fontSize:"12px",
                    opacity:.58,
                    cursor:"pointer",
                    padding:"8px 0"
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={()=>deletePerson(x)}
                  style={{
                    marginLeft:"12px",
                    flexShrink:0,
                    border:0,
                    background:"transparent",
                    color:"inherit",
                    font:"inherit",
                    fontSize:"12px",
                    opacity:.58,
                    cursor:"pointer",
                    padding:"8px 0"
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
      <button className="atelier-add" onClick={addPerson}><Plus size={15}/> Add person</button>
    </div>

    <div className="atelier-section">
      <div className="atelier-title"><Database size={17}/><div><span>ARCHIVE</span><small>Keep a safe copy of Carina</small></div></div>
      <button className="data-action" onClick={backup}><Download size={15}/> Export backup</button>
      <button className="data-action" onClick={()=>fileRef.current?.click()}><Upload size={15}/> Restore backup</button>
      <input ref={fileRef} type="file" accept="application/json" hidden onChange={e=>{const f=e.target.files?.[0];if(f)restore(f).catch(err=>alert(err.message))}}/>
    </div></section>;
}
