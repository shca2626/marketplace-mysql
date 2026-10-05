'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIER TEAM SECTION — Phase 5.2 (financier team roles).
//
// Institution staff management on the Phase 2 RBAC substrate: members with
// granular org-scoped roles (admin / underwriter / reviewer / branch-officer),
// email invitations with copyable codes (the register modal accepts them),
// role swaps and removals. Only OWNER/ADMIN members reach this screen — the
// API enforces the same gate server-side.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  BadgeCheck,
  Copy,
  Loader2,
  Mail,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { useMarketplace } from '@/store/marketplace'
import { apiRequest, toastApiError } from '@/components/marketplace/admin/shared'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface TeamMember {
  userId: string
  name: string
  email: string | null
  phone: string | null
  memberRole: string
  joinedAt: string
  financierRoles: { roleId: string; roleKey: string; roleName: string }[]
}

interface TeamInvitation {
  id: string
  email: string
  name: string | null
  roleKey: string
  roleName: string
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED'
  invitedByName: string | null
  expiresAt: string
  createdAt: string
  token: string
}

interface TeamResponse {
  members: TeamMember[]
  invitations: TeamInvitation[]
  assignableRoles: { id: string; key: string; name: string; description: string | null; permissions: string[] }[]
  myMemberRole: string
}

const ROLE_BADGE_STYLES: Record<string, string> = {
  'financier.admin': 'bg-bh-navy/10 text-bh-navy dark:bg-bh-gold/20 dark:text-bh-gold',
  'financier.underwriter': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  'financier.reviewer': 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  'financier.branch-officer': 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function TeamSection() {
  const user = useMarketplace((s) => s.user)
  const { data, loading, refetch } = useApi<TeamResponse>('/api/financier/team')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // invite form
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [roleKey, setRoleKey] = useState('financier.underwriter')

  const members = data?.members ?? []
  const invitations = (data?.invitations ?? []).filter((i) => i.status === 'PENDING')
  const assignable = data?.assignableRoles ?? []

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    const res = await apiRequest<{ invitation: TeamInvitation }>('/api/financier/team', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), name: name.trim() || null, roleKey }),
    })
    setBusy(false)
    if (!res.ok || !res.data) {
      toastApiError(res.error, 'Invitation failed')
      return
    }
    setInviteOpen(false)
    setEmail('')
    setName('')
    setRoleKey('financier.underwriter')
    void refetch()
    toast({
      title: 'Invitation created',
      description: `${res.data.invitation.email} can register with the code ${res.data.invitation.token.slice(0, 8)}…`,
    })
  }

  const changeRole = async (memberUserId: string, nextRole: string | null) => {
    const res = await apiRequest<TeamResponse>('/api/financier/team', {
      method: 'PATCH',
      body: JSON.stringify({ memberUserId, roleKey: nextRole }),
    })
    if (!res.ok) {
      toastApiError(res.error, 'Role update failed')
      return
    }
    toast({ title: 'Role updated' })
    void refetch()
  }

  const removeMember = async (memberUserId: string, memberName: string) => {
    if (!confirm(`Remove ${memberName} from the institution team?`)) return
    const res = await apiRequest(`/api/financier/team?memberId=${memberUserId}`, { method: 'DELETE' })
    if (!res.ok) {
      toastApiError(res.error, 'Removal failed')
      return
    }
    toast({ title: 'Removed from the team' })
    void refetch()
  }

  const revokeInvitation = async (invitationId: string) => {
    const res = await apiRequest(`/api/financier/team?invitationId=${invitationId}`, { method: 'DELETE' })
    if (!res.ok) {
      toastApiError(res.error, 'Revoke failed')
      return
    }
    toast({ title: 'Invitation revoked' })
    void refetch()
  }

  const copyCode = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token)
      toast({ title: 'Invitation code copied', description: 'Share it with your colleague — they enter it at signup.' })
    } catch {
      toast({ title: 'Copy failed', description: 'Select the code and copy it manually.', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck size={15} className="text-primary" />
          {members.length} {members.length === 1 ? 'member' : 'members'}
          {invitations.length > 0 && <> · {invitations.length} pending invitation{invitations.length > 1 ? 's' : ''}</>}
        </div>
        <Button className="rounded-xl" onClick={() => setInviteOpen(true)}>
          <UserPlus size={15} className="mr-1.5" /> Invite staff
        </Button>
      </div>

      {/* Role legend */}
      <Card>
        <CardContent className="p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <UserCog size={13} className="text-primary" /> What each role can do
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {assignable.map((r) => (
              <div key={r.key} className="rounded-xl border bg-muted/30 p-3">
                <p className="text-xs font-bold">{r.name}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {r.description ?? `${r.permissions.length} permissions`}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b px-5 py-4">
            <h3 className="text-sm font-bold">Institution staff</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Granular roles scope what each teammate sees — owners and admins manage everything.
            </p>
          </div>
          {loading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <ul className="max-h-96 divide-y overflow-y-auto">
              {members.map((m) => {
                const isSelf = m.userId === user?.id
                const granular = m.financierRoles[0]?.roleKey ?? null
                return (
                  <li key={m.userId} className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-bh-navy/10 text-xs font-bold text-bh-navy dark:bg-bh-gold/20 dark:text-bh-gold">
                        {initialsOf(m.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-semibold">
                        {m.name}
                        {isSelf && (
                          <Badge variant="outline" className="h-5 rounded-full px-2 text-[10px]">
                            You
                          </Badge>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{m.email ?? m.phone}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {m.memberRole === 'OWNER' ? (
                        <Badge className="rounded-full bg-bh-gold/20 text-[11px] text-bh-navy dark:text-bh-gold">
                          <BadgeCheck size={11} className="mr-1" /> Owner
                        </Badge>
                      ) : m.memberRole === 'ADMIN' ? (
                        <Badge className="rounded-full bg-bh-navy/10 text-[11px] text-bh-navy dark:bg-bh-gold/20 dark:text-bh-gold">
                          Admin
                        </Badge>
                      ) : granular ? (
                        <Badge className={cn('rounded-full text-[11px]', ROLE_BADGE_STYLES[granular] ?? '')}>
                          {m.financierRoles[0].roleName}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="rounded-full text-[11px] text-muted-foreground">
                          No lender role
                        </Badge>
                      )}
                      {!isSelf && m.memberRole !== 'OWNER' && (
                        <>
                          <Select
                            value={granular ?? 'none'}
                            onValueChange={(v) => void changeRole(m.userId, v === 'none' ? null : v)}
                          >
                            <SelectTrigger className="h-8 w-[150px] rounded-lg text-xs" aria-label={`Role for ${m.name}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none" className="text-xs">
                                No lender role
                              </SelectItem>
                              {assignable.map((r) => (
                                <SelectItem key={r.key} value={r.key} className="text-xs">
                                  {r.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                            onClick={() => void removeMember(m.userId, m.name)}
                            aria-label={`Remove ${m.name}`}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="border-b px-5 py-4">
              <h3 className="text-sm font-bold">Pending invitations</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Share the code — your colleague enters it in the signup form to join with the role you picked.
              </p>
            </div>
            <ul className="divide-y">
              {invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                    <Mail size={15} className="text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{i.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.roleName} · expires {new Date(i.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <code className="max-w-[140px] truncate rounded-lg border bg-muted/50 px-2 py-1 text-[11px]">
                    {i.token}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg px-2.5"
                    onClick={() => void copyCode(i.token)}
                  >
                    <Copy size={13} className="mr-1" /> Copy code
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-lg text-muted-foreground hover:text-destructive"
                    onClick={() => void revokeInvitation(i.id)}
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus size={17} className="text-primary" /> Invite institution staff
            </DialogTitle>
            <DialogDescription>
              They register with the invitation code and join this institution with the role you pick.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={sendInvite} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">Work email</Label>
              <Input
                id="inv-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@institution.com"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                The code is bound to this address — it must match at signup.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">Name (optional)</Label>
              <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Their full name" maxLength={60} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={roleKey} onValueChange={setRoleKey}>
                <SelectTrigger className="w-full rounded-lg" aria-label="Role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignable.map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl" disabled={busy}>
                {busy ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Mail size={15} className="mr-1.5" />}
                Create invitation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
