export default function Button({ className = '', variant = 'primary', onClick, ...props }) {
  const style = variant === 'primary' ? 'btn btn-primary' : 'btn btn-ghost'

  // Unified handler for both click & touch
  const handlePress = (e) => {
    if (onClick) {
      e.preventDefault() // avoid double-firing
      onClick(e)
    }
  }

  return (
    <button
      className={`${style} ${className}`}
      onClick={handlePress}
      onTouchStart={handlePress}
      {...props}
    />
  )
}
