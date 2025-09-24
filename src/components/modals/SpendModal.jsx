import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import { useState } from 'react'


export default function SpendModal({ open, onClose, onSubmit }){
const [form, setForm] = useState({ amount:'', date: new Date().toISOString().slice(0,10), category:'Other', description:'' })
return (
<Modal open={open} onClose={onClose}>
<h3 className="font-semibold mb-3">Add Expense</h3>
<form className="grid gap-3" onSubmit={e=>{ e.preventDefault(); onSubmit({ ...form, amount:Number(form.amount||0), type:'expense' }) }}>
<input className="input" type="number" placeholder="Amount" value={form.amount} onChange={e=>setForm(f=>({...f, amount:e.target.value}))} required />
<input className="input" type="date" value={form.date} onChange={e=>setForm(f=>({...f, date:e.target.value}))} required />
<input className="input" type="text" placeholder="Category" value={form.category} onChange={e=>setForm(f=>({...f, category:e.target.value}))} />
<input className="input" type="text" placeholder="Description" value={form.description} onChange={e=>setForm(f=>({...f, description:e.target.value}))} />
<div className="flex justify-end gap-2 mt-2">
<Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
<Button type="submit">Save</Button>
</div>
</form>
</Modal>
)
}