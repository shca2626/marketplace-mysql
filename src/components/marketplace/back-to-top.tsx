'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Floating back-to-top button — appears after scrolling past the fold. */
export function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        setVisible(window.scrollY > 600)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.9 }}
          transition={{ duration: 0.18 }}
          className="fixed bottom-20 right-4 z-40 sm:bottom-6"
        >
          <Button
            size="icon"
            className="h-11 w-11 rounded-full shadow-lg shadow-primary/20 transition-transform hover:scale-105"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Back to top"
          >
            <ArrowUp size={18} />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
