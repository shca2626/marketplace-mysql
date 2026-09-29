'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * Contact form island (pagedesign.md §5.5) — posts to POST /api/contact.
 * Inline error + success states, no external form library: plain controlled
 * inputs with native validation, server-side validation surfaced inline.
 */

const TOPICS = [
  { value: 'order', label: 'Order support' },
  { value: 'funding', label: 'Funding & financing' },
  { value: 'selling', label: 'Selling on Vendora' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'general', label: 'Something else' },
] as const

export function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [topic, setTopic] = useState<string>('general')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, topic, message }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(json.error ?? 'Something went wrong — please try again.')
        return
      }
      setDone(true)
    } catch {
      setError('Network error — please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setName('')
    setEmail('')
    setTopic('general')
    setMessage('')
    setError(null)
    setDone(false)
  }

  if (done) {
    return (
      <div role="status" className="flex flex-col items-center gap-4 py-8 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
          <CheckCircle2 size={28} aria-hidden />
        </span>
        <div>
          <h3 className="text-lg font-bold">Message sent</h3>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
            Thanks — we&apos;ve got it. We&apos;ll reply to{' '}
            <span className="font-medium text-foreground">{email}</span> within 1 business day.
          </p>
        </div>
        <Button variant="outline" className="rounded-xl" onClick={reset}>
          Send another message
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-label="Contact form" noValidate={false}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contact-name">Name</Label>
          <Input
            id="contact-name"
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-email">Email</Label>
          <Input
            id="contact-email"
            type="email"
            required
            maxLength={160}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            autoComplete="email"
            className="h-11"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-topic">Topic</Label>
        <Select value={topic} onValueChange={setTopic}>
          <SelectTrigger id="contact-topic" className="h-11 w-full">
            <SelectValue placeholder="Choose a topic" />
          </SelectTrigger>
          <SelectContent>
            {TOPICS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-message">Message</Label>
        <Textarea
          id="contact-message"
          required
          minLength={10}
          maxLength={2000}
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us a little about what you need — include your order number if it's about an order."
          className="min-h-32"
        />
        <p className="text-xs text-muted-foreground">Minimum 10 characters, maximum 2000.</p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" className="rounded-xl" disabled={loading}>
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden /> Sending…
            </>
          ) : (
            <>
              <Send size={16} className="mr-1" aria-hidden /> Send message
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground">We reply within 1 business day.</p>
      </div>
    </form>
  )
}
