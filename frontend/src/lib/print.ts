/**
 * Print utility functions for Parameter Real Estate Accounting
 * Delegates to the branded print template engine.
 */

export { printElement, printTable as generatePrintableTable, openBrandedPrintWindow } from './printTemplate'

/**
 * Print current window
 */
export function printPage() {
  window.print()
}
