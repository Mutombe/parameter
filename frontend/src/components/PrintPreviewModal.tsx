import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Printer, Download, X } from 'lucide-react'
import { usePrintStore } from '../stores/printStore'

export default function PrintPreviewModal() {
  const { html, isOpen, close } = usePrintStore()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loading, setLoading] = useState(true)

  // Write HTML into iframe once it mounts
  useEffect(() => {
    if (!isOpen || !html || !iframeRef.current) return
    setLoading(true)

    const iframe = iframeRef.current
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) return

    doc.open()
    doc.write(html)
    doc.close()

    // Wait for images to load
    const images = doc.querySelectorAll('img')
    if (images.length === 0) {
      setLoading(false)
    } else {
      let loaded = 0
      const total = images.length
      const onReady = () => {
        loaded++
        if (loaded >= total) setLoading(false)
      }
      images.forEach((img) => {
        if (img.complete) {
          onReady()
        } else {
          img.onload = onReady
          img.onerror = onReady
        }
      })
    }
  }, [isOpen, html])

  // Escape key closes modal
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, close])

  const handlePrint = useCallback(() => {
    iframeRef.current?.contentWindow?.print()
  }, [])

  const [downloading, setDownloading] = useState(false)

  const handleDownloadPdf = useCallback(async () => {
    const iframeDoc = iframeRef.current?.contentDocument
    if (!iframeDoc?.body) return

    setDownloading(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')

      const title = iframeDoc.title || 'Document'

      // Extract CSS from the iframe's <head> and clean it up
      let css = iframeDoc.querySelector('style')?.textContent || ''
      css = css.replace(/@import[^;]+;/g, '')
      // Strip @media print block (sets .page padding to 0)
      const pi = css.indexOf('@media print')
      if (pi !== -1) {
        let d = 0, e = pi
        for (let i = pi; i < css.length; i++) {
          if (css[i] === '{') d++
          if (css[i] === '}') { d--; if (d === 0) { e = i + 1; break } }
        }
        css = css.substring(0, pi) + css.substring(e)
      }

      // Images are already embedded as base64 data URLs (done in useEffect
      // via embedImages before writing to iframe), so no CORS issues here.
      const canvas = await html2canvas(iframeDoc.body, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: iframeDoc.body.scrollWidth,
        height: iframeDoc.body.scrollHeight,
        onclone: (clonedDoc: Document) => {
          const s = clonedDoc.createElement('style')
          s.textContent = css
          clonedDoc.head.appendChild(s)
        },
      })

      // Build PDF from the rendered canvas
      const imgData = canvas.toDataURL('image/jpeg', 0.98)
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 10
      const contentWidth = pageWidth - margin * 2
      const contentHeight = (canvas.height * contentWidth) / canvas.width

      // If content fits one page
      if (contentHeight <= pageHeight - margin * 2) {
        pdf.addImage(imgData, 'JPEG', margin, margin, contentWidth, contentHeight)
      } else {
        // Multi-page: slice the canvas into page-sized chunks
        const pageContentHeight = pageHeight - margin * 2
        const sourcePageHeight = (pageContentHeight / contentWidth) * canvas.width
        let srcY = 0
        let page = 0

        while (srcY < canvas.height) {
          if (page > 0) pdf.addPage()

          const sliceHeight = Math.min(sourcePageHeight, canvas.height - srcY)
          const sliceCanvas = document.createElement('canvas')
          sliceCanvas.width = canvas.width
          sliceCanvas.height = sliceHeight
          const ctx = sliceCanvas.getContext('2d')
          if (ctx) {
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height)
            ctx.drawImage(canvas, 0, srcY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
          }

          const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.98)
          const slicePdfHeight = (sliceHeight * contentWidth) / canvas.width
          pdf.addImage(sliceData, 'JPEG', margin, margin, contentWidth, slicePdfHeight)

          srcY += sourcePageHeight
          page++
        }
      }

      pdf.save(`${title}.pdf`)
    } finally {
      setDownloading(false)
    }
  }, [])

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={close}
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.35 }}
            className="relative flex flex-col bg-white rounded-2xl shadow-2xl m-4 md:m-8 w-full h-[calc(100vh-2rem)] md:h-[calc(100vh-4rem)] max-w-6xl"
          >
            {/* Header Bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center">
                  <Printer className="w-5 h-5 text-primary-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Print Preview</h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  Print
                </button>
                <button
                  onClick={handleDownloadPdf}
                  disabled={downloading}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {downloading ? (
                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {downloading ? 'Saving...' : 'Save as PDF'}
                </button>
                <button
                  onClick={close}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors ml-1"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Preview Body */}
            <div className="flex-1 overflow-auto bg-gray-100 p-6 flex justify-center">
              <div className="relative w-full max-w-[850px]">
                {/* Loading overlay */}
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg z-10">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-3 border-primary-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm text-gray-500">Loading preview...</span>
                    </div>
                  </div>
                )}

                {/* Paper iframe */}
                <iframe
                  ref={iframeRef}
                  title="Print Preview"
                  className="w-full bg-white rounded-lg shadow-xl border-0"
                  style={{ minHeight: '1000px', height: '100%' }}
                />
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
