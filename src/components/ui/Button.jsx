export default function Button({ className='', variant='primary', ...props }){
const style = variant==='primary' ? 'btn btn-primary' : 'btn btn-ghost'
return <button className={`${style} ${className}`} {...props} />
}