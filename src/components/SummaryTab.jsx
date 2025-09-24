import Card from './ui/Card.jsx'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'


const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AA66CC', '#82ca9d']


export default function SummaryTab({ transactions }){
const data = Object.entries(transactions
.filter(t=>t.type==='expense')
.reduce((m,t)=>{ m[t.category]=(m[t.category]||0)+Number(t.amount||0); return m }, {}))
.map(([name,value])=>({name, value}))


return (
<Card>
<h2 className="font-bold mb-2">Summary</h2>
<div className="h-72 w-full">
<ResponsiveContainer>
<PieChart>
<Pie data={data} dataKey="value" nameKey="name" outerRadius={100} label>
{data.map((_, i)=> <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
</Pie>
<Tooltip />
</PieChart>
</ResponsiveContainer>
</div>
</Card>
)}