export function cls(...args) {
  let str = ''
  for (const arg of args) {
    if (typeof arg === 'string') {
      str += ' ' + arg
    } else if (typeof arg === 'object') {
      for (const key in arg) {
        const value = arg[key]
        if (value) str += ' ' + key
      }
    }
  }
  return str
}

// export const isTouch = !!navigator.userAgent.match(/OculusBrowser|iPhone|iPad|iPod|Android/i)

// if at least two indicators point to touch, consider it primarily touch-based:
const coarse = window.matchMedia('(pointer: coarse)').matches
const noHover = window.matchMedia('(hover: none)').matches
const hasTouch = navigator.maxTouchPoints > 0
export const isTouch = (coarse && hasTouch) || (noHover && hasTouch)

export function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes'
  
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}
