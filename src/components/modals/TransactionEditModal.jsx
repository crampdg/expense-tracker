import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import { useEffect, useState } from 'react'


export default function TransactionEditModal({ open, onClose, transaction, onSave, onDelete }){
const [form, setForm] = useState(null)
useEffect(()=>{ setForm(transaction? {...transaction} : null) }, [transaction])
if(!form) return <Modal open={open} onClose={onClose}></Modal>
return (
<Modal open={open} onClose={onClose}>
<h3 className="font-semibold mb-3">Edit Transaction</h3>
<form className="grid gap-3" onSubmit={e=>{ e.preventDefault(); onSave({ ...form, amount:Number(form.amount||0) }) }}>
<input className="input" type="date" value={form.date} onChange={e=>setForm(f=>({...f, date:e.target.value}))} required />
<select className="select" value={form.type} onChange={e=>setForm(f=>({...f, type:e.target.value}))}>
<option value="inflow">Inflow</option>
<option value="expense">Expense</option>
</select>
<input className="input" type="number" value={form.amount} onChange={e=>setForm(f=>({...f, amount:e.target.value}))} required />
<input className="input" type="text" value={form.category} onChange={e=>setForm(f=>({...f, category:e.target.value}))} />
<input className="input" type="text" value={form.description||''} onChange={e=>setForm(f=>({...f, description:e.target.value}))} />
<div className="flex justify-between gap-2">
<Button variant="ghost" type="button" onClick={onDelete}>Delete</Button>
<div className="flex gap-2">
<Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
<Button type="submit">Save</Button>
</div>
</div>
</form>
</Modal>
)
}