export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

/** Display name for a stored month (1–12, number or string), or '' if unset/invalid. */
export function monthName(month) {
  return MONTH_NAMES[Number(month) - 1] || ''
}
