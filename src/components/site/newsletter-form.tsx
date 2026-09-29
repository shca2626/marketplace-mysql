'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, Mail } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Newsletter signup island — posts to /api/contact (topic=newsletter),
 * the same pipeline as the contact form (pagedesign.md §5.5 / S8).
 */
export function NewsletterForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading || done) return
    setLoading(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Newsletter', email, topic: 'newsletter' }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not subscribe', description: json.error ?? 'Please try again.', variant: 'destructive' })
        return
      }
      setDone(true)
      toast({
        title: 'You’re on the list! ☀️',
        description: 'Monthly solar insights and platform news. No spam, unsubscribe anytime.',
      })
    } catch {
      toast({ title: 'Network error', description: 'Please try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-primary" role="status">
        <CheckCircle2 size={16} /> Subscribed — see you in your inbox.
      </p>
    )
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-md gap-2" aria-label="Newsletter signup">
      <div className="relative flex-1">
        <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={compact ? 'you@email.com' : 'Your email — monthly solar insights'}
          aria-label="Email address"
          className="h-11 rounded-full pl-9"
        />
      </div>
      <Button type="submit" size="lg" className="h-11 rounded-full px-5" disabled={loading}>
        {loading ? <Loader2 size={16} className="animate-spin" /> : 'Subscribe'}
      </Button>
    </form>
  )
}
