'use client'

// ─────────────────────────────────────────────────────────────────────────────
// RBAC TAB — "Roles & Access" (mergedplan.md Phase 2)
//
// The owner's #2 and #3 gaps, closed:
//   • Roles & Permissions — full permission catalog, system + custom roles,
//     permission-matrix editor (create/duplicate/edit/delete custom roles).
//   • Platform Staff — grant/revoke platform roles to existing users,
//     effective-permission viewer, super-admin badges.
//   • Invitations — invite future staff by email with a scoped role,
//     revoke pending invitations.
//   • Organization teams — read-only visibility into org/lender role
//     assignments (org self-service management ships with the org console
//     upgrade; the data model + admin override already works here).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import {
  BadgeCheck,
  ChevronDown,
  Copy,
  Crown,
  Loader2,
  Lock,
  MailPlus,
  Pencil,
  Plus,
  RefreshCcw,
  ShieldCheck,
  ShieldQuestion,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { PERMISSION_DOMAINS, type PermissionDomain } from '@/lib/rbac-catalog'
import type {
  RbacAssignmentDTO,
  RbacInvitationDTO,
  RbacRoleDTO,
  RbacStaffDTO,
  RbacStaffUserDTO,
  SessionUser,
} from '@/lib/types'
import { timeAgo } from '@/lib/format'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  AdminEmptyState,
  FilterChips,
  SearchInput,
  apiRequest,
  toastApiError,
  useDebounced,
} from './shared'

// ── Shared bits ─────────────────────────────────────────────────────────────

const SCOPE_BADGE: Record<string, string> = {
  PLATFORM: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  ORG: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
}

const ROLE_STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  ACCEPTED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  REVOKED: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
}

function ScopeBadge({ scope }: { scope: 'PLATFORM' | 'ORG' }) {
  return (
    <Badge className={cn('rounded-full border-0 text-[11px] font-semibold', SCOPE_BADGE[scope])}>
      {scope === 'PLATFORM' ? 'Platform' : 'Organization'}
    </Badge>
  )
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// ── Permission matrix (create/edit role dialog body) ─────────────────────────

function PermissionMatrix({
  domains,
  selected,
  onToggle,
  onToggleDomain,
  locked,
}: {
  domains: PermissionDomain[]
  selected: Set<string>
  onToggle: (key: string) => void
  onToggleDomain: (domain: PermissionDomain, on: boolean) => void
  locked?: boolean
}) {
  return (
    <div className={cn('space-y-3', locked && 'pointer-events-none opacity-60')}>
      {domains.map((domain) => {
        const domainKeys = domain.permissions.map((p) => p.key)
        const selectedCount = domainKeys.filter((k) => selected.has(k)).length
        const all = selectedCount === domainKeys.length
        return (
          <div key={domain.key} className="rounded-xl border bg-card">
            <div className="flex items-center justify-between gap-2 border-b px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{domain.label}</p>
                <p className="truncate text-xs text-muted-foreground">{domain.description}</p>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Checkbox
                  checked={all}
                  onCheckedChange={(v) => onToggleDomain(domain, v === true)}
                  aria-label={`Select all ${domain.label} permissions`}
                />
                All
              </label>
            </div>
            <div className="divide-y">
              {domain.permissions.map((p) => (
                <label
                  key={p.key}
                  className="flex cursor-pointer items-start gap-3 px-3.5 py-2.5 transition-colors hover:bg-accent/50"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={selected.has(p.key)}
                    onCheckedChange={() => onToggle(p.key)}
                    aria-label={p.label}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{p.label}</span>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{p.key}</code>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{p.description}</span>
                  </span>
                  {selected.has(p.key) && (
                    <BadgeCheck size={15} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  )}
                </label>
              ))}
            </div>
            <p className="px-3.5 py-2 text-[11px] text-muted-foreground">
              {selectedCount}/{domainKeys.length} selected
            </p>
          </div>
        )
      })}
    </div>
  )
}

// ── Role dialog state type ──────────────────────────────────────────────────

interface RoleDialogState {
  mode: 'create' | 'edit'
  roleId?: string
  name: string
  description: string
  scope: 'PLATFORM' | 'ORG'
  selected: Set<string>
  locked?: boolean
  lockReason?: string
}

// ── Main tab ────────────────────────────────────────────────────────────────

type SubView = 'roles' | 'staff' | 'invitations'

export function RbacTab({ user }: { user: SessionUser | null }) {
  const [subView, setSubView] = useState<SubView>('roles')
  const [scopeFilter, setScopeFilter] = useState<'' | 'PLATFORM' | 'ORG'>('')

  // RBACSEC-1 — button-level permission gating (the API is the security
  // boundary; this is UX so staff don't see buttons that would 403).
  const isSuperAdmin = user?.role === 'ADMIN'
  const perms = useMemo(() => new Set(user?.permissions ?? []), [user])
  const can = (...keys: string[]) => isSuperAdmin || keys.some((k) => perms.has(k))
  const canCreateRoles = can('rbac.roles.create', 'rbac.manage')
  const canUpdateRoles = can('rbac.roles.update', 'rbac.manage')
  const canDeleteRoles = can('rbac.roles.delete', 'rbac.manage')

  // RBACSEC-2 — per-card delete gating, mirroring the server exactly:
  //   • locked roles (platform.super-admin, org.owner) — permanent for everyone
  //   • other system-role templates — deletable by super admins only
  //   • custom roles — any holder of rbac.roles.delete (bracketing applies server-side)
  // When blocked we render a disabled locked button with the reason as its
  // tooltip instead of silently hiding it, so the rule is always legible.
  const deleteBlockedReason = (role: RbacRoleDTO): string | null => {
    if (role.isProtected)
      return 'Locked role — permanent by design. Super Administrators and Organization Owners can never be deleted; revoke their assignments instead if you need to limit who holds them.'
    if (role.isSystem && !isSuperAdmin)
      return 'System roles can only be deleted by super administrators.'
    return null
  }
  const canManageAssignments = can('staff.manage', 'rbac.manage')
  const canInviteStaff = can('staff.invite', 'rbac.manage')

  // Roles + staff + invitations + org assignments (org assignments feed the
  // org-teams visibility block).
  const rolesQ = useApi<{ roles: RbacRoleDTO[] }>('/api/admin/rbac/roles')
  const staffQ = useApi<{ staff: RbacStaffDTO[] }>('/api/admin/rbac/staff')
  const invitesQ = useApi<{ invitations: RbacInvitationDTO[] }>('/api/admin/rbac/invitations')
  const orgAssignmentsQ = useApi<{ assignments: RbacAssignmentDTO[] }>('/api/admin/rbac/assignments?scope=org')

  const roles = rolesQ.data?.roles ?? []
  const staff = staffQ.data?.staff ?? []
  const invitations = invitesQ.data?.invitations ?? []
  const orgAssignments = orgAssignmentsQ.data?.assignments ?? []

  const pendingInvites = invitations.filter((i) => i.status === 'PENDING').length

  const refreshAll = () => {
    void rolesQ.refetch()
    void staffQ.refetch()
    void invitesQ.refetch()
    void orgAssignmentsQ.refetch()
  }

  const visibleRoles = useMemo(
    () => (scopeFilter ? roles.filter((r) => r.scope === scopeFilter) : roles),
    [roles, scopeFilter]
  )

  // ── Role dialog state ──
  const [dialog, setDialog] = useState<RoleDialogState | null>(null)
  const [saving, setSaving] = useState(false)

  const openCreate = () =>
    setDialog({ mode: 'create', name: '', description: '', scope: 'PLATFORM', selected: new Set() })
  const openEdit = (role: RbacRoleDTO) =>
    setDialog({
      mode: 'edit',
      roleId: role.id,
      name: role.name,
      description: role.description ?? '',
      scope: role.scope,
      selected: new Set(role.permissions),
      locked: role.isProtected || (role.isSystem && !isSuperAdmin),
      lockReason: role.isProtected
        ? role.key === 'platform.super-admin'
          ? 'Super Administrators always hold every platform permission — this role cannot be narrowed.'
          : 'Organization Owners always hold every organization permission — this role cannot be narrowed.'
        : role.isSystem && !isSuperAdmin
          ? 'System roles can only be edited by super administrators.'
          : undefined,
    })
  const openDuplicate = (role: RbacRoleDTO) =>
    setDialog({
      mode: 'create',
      name: `${role.name} (copy)`,
      description: role.description ?? '',
      scope: role.scope,
      selected: new Set(role.permissions),
    })

  const togglePermission = (key: string) => {
    setDialog((d) => {
      if (!d || d.locked) return d
      const next = new Set(d.selected)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { ...d, selected: next }
    })
  }
  const toggleDomain = (domain: PermissionDomain, on: boolean) => {
    setDialog((d) => {
      if (!d || d.locked) return d
      const next = new Set(d.selected)
      for (const p of domain.permissions) {
        if (on) next.add(p.key)
        else next.delete(p.key)
      }
      return { ...d, selected: next }
    })
  }

  const saveRole = async () => {
    if (!dialog) return
    setSaving(true)
    try {
      const body = {
        name: dialog.name,
        description: dialog.description || null,
        ...(dialog.mode === 'create' ? { scope: dialog.scope, permissionKeys: [...dialog.selected] } : {}),
        ...(dialog.mode === 'edit' && !dialog.locked ? { permissionKeys: [...dialog.selected] } : {}),
      }
      const res =
        dialog.mode === 'create'
          ? await apiRequest<{ role: RbacRoleDTO }>('/api/admin/rbac/roles', {
              method: 'POST',
              body: JSON.stringify(body),
            })
          : await apiRequest<{ role: RbacRoleDTO }>(`/api/admin/rbac/roles/${dialog.roleId}`, {
              method: 'PATCH',
              body: JSON.stringify(body),
            })
      if (!res.ok || !res.data) {
        toastApiError(res.error)
        return
      }
      toast({
        title: dialog.mode === 'create' ? 'Role created' : 'Role updated',
        description: `"${res.data.role.name}" now grants ${res.data.role.permissions.length} permission(s).`,
      })
      setDialog(null)
      void rolesQ.refetch()
    } finally {
      setSaving(false)
    }
  }

  const deleteRole = async (role: RbacRoleDTO) => {
    // RBACSEC-1 — force-delete flow: roles with members can only be removed
    // by un-assigning everyone first (the server does it in one transaction).
    const systemWarning = role.isSystem
      ? '\n\nHeads-up: this is a built-in SYSTEM role — deleting it is permanent. (It can be restored later by re-running the RBAC seed.)'
      : ''
    let force = false
    if (role.memberCount > 0) {
      force = confirm(
        `The role "${role.name}" is still assigned to ${role.memberCount} member(s).${systemWarning}\n\nDelete it anyway? Their access from this role is revoked immediately.`
      )
      if (!force) return
    } else {
      if (!confirm(`Delete the role "${role.name}"? This cannot be undone.${systemWarning}`)) return
    }
    const res = await apiRequest<{ revoked: number }>(
      `/api/admin/rbac/roles/${role.id}${force ? '?force=1' : ''}`,
      { method: 'DELETE' }
    )
    if (!res.ok) {
      toastApiError(res.error)
      return
    }
    const revoked = res.data?.revoked ?? 0
    toast({
      title: 'Role deleted',
      description:
        revoked > 0
          ? `"${role.name}" is gone — ${revoked} member assignment(s) revoked.`
          : `"${role.name}" is gone.`,
    })
    refreshAll()
  }

  // ── Grant-role dialog state ──
  const [grantOpen, setGrantOpen] = useState(false)
  const [grantQuery, setGrantQuery] = useState('')
  const debouncedGrantQuery = useDebounced(grantQuery)
  const [grantUser, setGrantUser] = useState<RbacStaffUserDTO | null>(null)
  const [grantRoleId, setGrantRoleId] = useState('')
  const [granting, setGranting] = useState(false)

  const usersQ = useApi<{ users: RbacStaffUserDTO[] }>(
    grantOpen && !grantUser && debouncedGrantQuery.trim().length >= 2
      ? `/api/admin/rbac/users?q=${encodeURIComponent(debouncedGrantQuery.trim())}`
      : null
  )
  const platformRoles = roles.filter((r) => r.scope === 'PLATFORM')

  const grantRole = async () => {
    if (!grantUser || !grantRoleId) return
    setGranting(true)
    try {
      const res = await apiRequest<{ assignment: RbacAssignmentDTO }>('/api/admin/rbac/assignments', {
        method: 'POST',
        body: JSON.stringify({ userId: grantUser.id, roleId: grantRoleId }),
      })
      if (!res.ok || !res.data) {
        toastApiError(res.error)
        return
      }
      toast({
        title: 'Role granted',
        description: `${res.data.assignment.userName} is now ${res.data.assignment.roleName}.`,
      })
      setGrantOpen(false)
      setGrantUser(null)
      setGrantQuery('')
      setGrantRoleId('')
      void staffQ.refetch()
    } finally {
      setGranting(false)
    }
  }

  const revoke = async (assignmentId: string, who: string, role: string) => {
    if (!confirm(`Revoke "${role}" from ${who}?`)) return
    const res = await apiRequest(`/api/admin/rbac/assignments/${assignmentId}`, { method: 'DELETE' })
    if (!res.ok) {
      toastApiError(res.error)
      return
    }
    toast({ title: 'Role revoked', description: `${who} no longer holds "${role}".` })
    void staffQ.refetch()
  }

  // ── Invite dialog state ──
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRoleId, setInviteRoleId] = useState('')
  const [inviting, setInviting] = useState(false)

  const inviteStaff = async () => {
    if (!inviteEmail || !inviteRoleId) return
    setInviting(true)
    try {
      const res = await apiRequest<{ invitation: RbacInvitationDTO }>('/api/admin/rbac/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, name: inviteName || null, roleId: inviteRoleId }),
      })
      if (!res.ok || !res.data) {
        toastApiError(res.error)
        return
      }
      // The raw token exists ONLY in this response (hashed at rest afterwards) —
      // copy it to the clipboard immediately so the inviter can hand it over.
      if (res.data.invitation.token) {
        try {
          await navigator.clipboard.writeText(res.data.invitation.token)
        } catch {
          /* clipboard unavailable — the token still shows in the toast */
        }
      }
      toast({
        title: 'Invitation created',
        description: res.data.invitation.token
          ? `Token (copied — shown ONCE): ${res.data.invitation.token}`
          : `${res.data.invitation.email} can register with the invitation token to join as ${res.data.invitation.roleName}.`,
      })
      setInviteOpen(false)
      setInviteEmail('')
      setInviteName('')
      setInviteRoleId('')
      void invitesQ.refetch()
    } finally {
      setInviting(false)
    }
  }

  const revokeInvitation = async (inv: RbacInvitationDTO) => {
    if (!confirm(`Revoke the invitation to ${inv.email}?`)) return
    const res = await apiRequest(`/api/admin/rbac/invitations/${inv.id}`, { method: 'DELETE' })
    if (!res.ok) {
      toastApiError(res.error)
      return
    }
    toast({ title: 'Invitation revoked', description: `${inv.email} can no longer accept it.` })
    void invitesQ.refetch()
  }

  const copyToken = async (token: string | null) => {
    if (!token) {
      toastApiError('Tokens are hashed at rest — only the creation response shows the raw token once')
      return
    }
    try {
      await navigator.clipboard.writeText(token)
      toast({ title: 'Token copied', description: 'Registration consumes it automatically via the inviteToken field.' })
    } catch {
      toastApiError('Could not copy — select the token text manually')
    }
  }

  // ── Effective-permission expansion (staff cards) ──
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null)

  const subViews: { key: SubView; label: string; count?: number }[] = [
    { key: 'roles', label: 'Roles & Permissions', count: roles.length },
    { key: 'staff', label: 'Platform Staff', count: staff.length },
    { key: 'invitations', label: 'Invitations', count: pendingInvites || invitations.length },
  ]

  return (
    <div className="space-y-5">
      {/* Header row: sub-view chips + primary actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChips
            ariaLabel="RBAC sections"
            value={subView}
            onChange={(v) => setSubView(v as SubView)}
            options={subViews.map((s) => ({ value: s.key, label: s.label, count: s.count }))}
          />
          <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={refreshAll}>
            <RefreshCcw size={13} className="mr-1.5" /> Refresh
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {subView === 'roles' && canCreateRoles && (
            <Button size="sm" className="rounded-xl" onClick={openCreate}>
              <Plus size={15} className="mr-1.5" /> New role
            </Button>
          )}
          {subView === 'staff' && (
            <>
              {canInviteStaff && (
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setInviteOpen(true)}>
                  <MailPlus size={15} className="mr-1.5" /> Invite staff
                </Button>
              )}
              {canManageAssignments && (
                <Button size="sm" className="rounded-xl" onClick={() => setGrantOpen(true)}>
                  <UserPlus size={15} className="mr-1.5" /> Grant role
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── ROLES ── */}
      {subView === 'roles' && (
        <div className="space-y-4">
          <div className="max-w-sm">
            <FilterChips
              ariaLabel="Role scope filter"
              value={scopeFilter}
              onChange={(v) => setScopeFilter(v as '' | 'PLATFORM' | 'ORG')}
              options={[
                { value: '', label: 'All scopes', count: roles.length },
                { value: 'PLATFORM', label: 'Platform', count: roles.filter((r) => r.scope === 'PLATFORM').length },
                { value: 'ORG', label: 'Organization', count: roles.filter((r) => r.scope === 'ORG').length },
              ]}
            />
          </div>

          {/* RBACSEC-2 — delete rules legend: who can delete what, at a glance. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border bg-muted/40 px-4 py-2.5 text-[11px] leading-snug text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
              <Trash2 size={12} className="text-destructive" /> Who can delete:
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Badge className="rounded-full border-0 bg-muted text-[9px] font-semibold">Custom</Badge>
              anyone holding <code className="text-foreground">rbac.roles.delete</code>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Badge className="rounded-full border-0 bg-muted text-[9px] font-semibold">System</Badge>
              super administrators only
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Badge className="rounded-full border-0 bg-amber-100 text-[9px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                <Lock size={9} className="mr-0.5" /> LOCKED
              </Badge>
              never deletable — permanent by design
            </span>
            {canDeleteRoles && !isSuperAdmin && (
              <span className="inline-flex items-center gap-1.5 italic">
                You can delete custom roles; system-role deletion needs a super administrator.
              </span>
            )}
          </div>

          {rolesQ.loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-52 rounded-2xl" />
              ))}
            </div>
          ) : rolesQ.error ? (
            <AdminEmptyState
              icon={ShieldQuestion}
              title="Could not load roles"
              description={rolesQ.error}
            />
          ) : visibleRoles.length === 0 ? (
            <AdminEmptyState icon={ShieldCheck} title="No roles here" description="Adjust the scope filter or create a role." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleRoles.map((role) => (
                <Card key={role.id} className="gap-3 py-5">
                  <CardContent className="space-y-3 px-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold">{role.name}</p>
                          {role.isProtected && (
                            <Badge
                              className="rounded-full border-0 bg-amber-100 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              title="Locked role — visible only to super administrators; cannot be deleted or narrowed"
                            >
                              <Lock size={10} className="mr-1" /> LOCKED
                            </Badge>
                          )}
                          {role.key === 'platform.super-admin' && (
                            <Badge className="rounded-full border-0 bg-amber-100 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              <Crown size={10} className="mr-1" /> ALL ACCESS
                            </Badge>
                          )}
                        </div>
                        <code className="mt-0.5 block truncate text-[11px] text-muted-foreground">{role.key}</code>
                      </div>
                      <ScopeBadge scope={role.scope} />
                    </div>
                    <p className="line-clamp-2 min-h-8 text-xs text-muted-foreground">
                      {role.description ?? 'No description.'}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <ShieldCheck size={13} className="text-emerald-600 dark:text-emerald-400" />
                        <strong className="font-semibold text-foreground">{role.permissions.length}</strong> perms
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users size={13} />
                        <strong className="font-semibold text-foreground">{role.memberCount}</strong> members
                      </span>
                      {role.isSystem && (
                        <Badge className="rounded-full border-0 bg-muted text-[10px] font-semibold text-muted-foreground">
                          System
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
                      {canUpdateRoles && (
                        <Button variant="outline" size="sm" className="h-8 rounded-lg px-2.5 text-xs" onClick={() => openEdit(role)}>
                          <Pencil size={13} className="mr-1" /> Permissions
                        </Button>
                      )}
                      {canCreateRoles && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg px-2.5 text-xs"
                          onClick={() => openDuplicate(role)}
                        >
                          <Copy size={13} className="mr-1" /> Duplicate
                        </Button>
                      )}
                      {/* RBACSEC-2 — delete: enabled when permitted, visibly locked
                          (with the reason as tooltip) when not. Never silently hidden
                          when the viewer holds the delete permission. */}
                      {canDeleteRoles && !deleteBlockedReason(role) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg border-destructive/40 px-2.5 text-xs text-destructive hover:bg-destructive/10"
                          onClick={() => deleteRole(role)}
                        >
                          <Trash2 size={13} className="mr-1" /> Delete
                        </Button>
                      )}
                      {canDeleteRoles && deleteBlockedReason(role) && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled
                          className="h-8 cursor-not-allowed rounded-lg px-2.5 text-xs text-muted-foreground"
                          title={deleteBlockedReason(role) ?? undefined}
                        >
                          <Lock size={13} className="mr-1" /> Delete
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Organization team assignments — visibility into org/lender roles */}
          <div className="rounded-2xl border bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Users size={16} className="text-muted-foreground" />
              <h3 className="text-sm font-semibold">Organization team assignments</h3>
              <Badge className="rounded-full border-0 bg-muted text-[10px] font-semibold text-muted-foreground">
                {orgAssignments.length}
              </Badge>
              <span className="ml-auto text-[11px] text-muted-foreground">
                Org-level role grants across companies & lenders (manage members per organization)
              </span>
            </div>
            {orgAssignmentsQ.loading ? (
              <Skeleton className="h-24 rounded-xl" />
            ) : orgAssignments.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No organization role assignments yet — they appear when members join organizations or you grant org roles.
              </p>
            ) : (
              <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {orgAssignments.slice(0, 60).map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border bg-background px-3 py-2 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <strong className="font-semibold">{a.userName}</strong>
                      <span className="text-muted-foreground"> · {a.userEmail}</span>
                    </span>
                    {a.organizationName && (
                      <Badge className="rounded-full border-0 bg-violet-100 text-[10px] font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                        {a.organizationName}
                      </Badge>
                    )}
                    <Badge className="rounded-full border-0 bg-muted text-[10px] font-semibold text-muted-foreground">
                      {a.roleName}
                    </Badge>
                    {canManageAssignments && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 rounded-md px-1.5 text-[11px] text-destructive hover:bg-destructive/10"
                        onClick={() => revoke(a.id, a.userName, a.roleName)}
                        aria-label={`Revoke ${a.roleName} from ${a.userName}`}
                      >
                        <X size={12} />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── STAFF ── */}
      {subView === 'staff' && (
        <div className="space-y-4">
          {staffQ.loading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-2xl" />
              ))}
            </div>
          ) : staffQ.error ? (
            <AdminEmptyState icon={ShieldQuestion} title="Could not load staff" description={staffQ.error} />
          ) : staff.length === 0 ? (
            <AdminEmptyState
              icon={Users}
              title="No platform staff yet"
              description="Grant a platform role to an existing user, or send an invitation."
            >
              <div className="flex gap-2">
                {canManageAssignments && (
                  <Button size="sm" className="rounded-xl" onClick={() => setGrantOpen(true)}>
                    <UserPlus size={15} className="mr-1.5" /> Grant role
                  </Button>
                )}
                {canInviteStaff && (
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setInviteOpen(true)}>
                    <MailPlus size={15} className="mr-1.5" /> Invite staff
                  </Button>
                )}
              </div>
            </AdminEmptyState>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {staff.map((member) => (
                <Card key={member.userId} className="gap-3 py-5">
                  <CardContent className="space-y-3 px-5">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-10 w-10 border">
                        <AvatarFallback className="text-xs font-semibold">{initials(member.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold">{member.name}</p>
                          {member.isSuperAdmin && (
                            <Badge className="rounded-full border-0 bg-amber-100 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              <Crown size={10} className="mr-1" /> SUPER ADMIN
                            </Badge>
                          )}
                          {member.userRole === 'ADMIN' && !member.roles.length && (
                            <Badge className="rounded-full border-0 bg-muted text-[10px] font-semibold text-muted-foreground">
                              legacy admin
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] font-semibold">{member.permissions.length}</p>
                        <p className="text-[10px] text-muted-foreground">permissions</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {member.roles.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No explicit roles — full access comes from the legacy admin flag.
                        </p>
                      )}
                      {member.roles.map((r) => (
                        <span
                          key={r.assignmentId}
                          className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-[11px] font-semibold"
                        >
                          {r.roleName}
                          {canManageAssignments && (
                            <button
                              type="button"
                              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              aria-label={`Revoke ${r.roleName}`}
                              onClick={() => revoke(r.assignmentId, member.name, r.roleName)}
                            >
                              <X size={11} />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 border-t pt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-lg px-2 text-[11px]"
                        onClick={() => setExpandedStaff(expandedStaff === member.userId ? null : member.userId)}
                        aria-expanded={expandedStaff === member.userId}
                      >
                        <ChevronDown
                          size={13}
                          className={cn('mr-1 transition-transform', expandedStaff === member.userId && 'rotate-180')}
                        />
                        Effective permissions
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto h-7 rounded-lg px-2 text-[11px]"
                        disabled={!canManageAssignments}
                        title={canManageAssignments ? undefined : 'Requires the staff.manage permission'}
                        onClick={() => {
                          setGrantUser({ id: member.userId, name: member.name, email: member.email, role: member.userRole })
                          setGrantOpen(true)
                        }}
                      >
                        <Plus size={12} className="mr-1" /> Add role
                      </Button>
                    </div>

                    {expandedStaff === member.userId && (
                      <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border bg-background p-2.5">
                        {member.permissions.length === 0 ? (
                          <p className="px-1 py-2 text-[11px] text-muted-foreground">
                            No platform permissions (legacy admin bypass applies instead).
                          </p>
                        ) : (
                          member.permissions.map((p) => (
                            <p key={p} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <ShieldCheck size={11} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                              <code>{p}</code>
                            </p>
                          ))
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── INVITATIONS ── */}
      {subView === 'invitations' && (
        <div className="space-y-4">
          {invitesQ.loading ? (
            <Skeleton className="h-48 rounded-2xl" />
          ) : invitesQ.error ? (
            <AdminEmptyState icon={ShieldQuestion} title="Could not load invitations" description={invitesQ.error} />
          ) : invitations.length === 0 ? (
            <AdminEmptyState
              icon={MailPlus}
              title="No invitations yet"
              description="Invite future staff by email — when they register with the invitation token, the role is granted automatically."
            >
              {canInviteStaff && (
                <Button size="sm" className="rounded-xl" onClick={() => setInviteOpen(true)}>
                  <MailPlus size={15} className="mr-1.5" /> Invite staff
                </Button>
              )}
            </AdminEmptyState>
          ) : (
            <div className="overflow-hidden rounded-2xl border">
              <div className="divide-y">
                {invitations.map((inv) => (
                  <div key={inv.id} className="flex flex-wrap items-center gap-3 bg-card px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {inv.email}
                        <Badge className={cn('rounded-full border-0 text-[10px] font-semibold', ROLE_STATUS_BADGE[inv.status])}>
                          {inv.status}
                        </Badge>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Role <strong className="font-semibold text-foreground">{inv.roleName}</strong>
                        {inv.name ? ` · for ${inv.name}` : ''} · invited {inv.invitedByName ?? '—'}{' '}
                        {timeAgo(inv.createdAt)}
                        {inv.status === 'PENDING' && ` · expires ${timeAgo(inv.expiresAt)}`}
                      </p>
                    </div>
                    {inv.status === 'PENDING' && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg px-2.5 text-xs"
                          onClick={() => copyToken(inv.token)}
                        >
                          <Copy size={13} className="mr-1" /> Token
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg border-destructive/40 px-2.5 text-xs text-destructive hover:bg-destructive/10"
                          onClick={() => revokeInvitation(inv)}
                        >
                          Revoke
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Role create/edit dialog ── */}
      {dialog && (
        <Dialog open onOpenChange={(open) => !open && setDialog(null)}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {dialog.mode === 'create' ? 'Create a role' : `Edit "${dialog.name}"`}
              </DialogTitle>
              <DialogDescription>
                {dialog.locked
                  ? dialog.lockReason
                  : dialog.mode === 'create'
                    ? 'Name the role, choose its scope, then tick the permissions it grants.'
                    : 'System roles can be re-permissioned — changes apply to every member immediately.'}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="role-name">Role name</Label>
                  <Input
                    id="role-name"
                    value={dialog.name}
                    onChange={(e) => setDialog((d) => (d ? { ...d, name: e.target.value } : d))}
                    placeholder="e.g. Catalog Moderator"
                    maxLength={60}
                  />
                </div>
                {dialog.mode === 'create' && (
                  <div className="space-y-1.5">
                    <Label>Scope</Label>
                    <Select
                      value={dialog.scope}
                      onValueChange={(v) =>
                        setDialog((d) => (d ? { ...d, scope: v as 'PLATFORM' | 'ORG', selected: new Set() } : d))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose scope" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PLATFORM">Platform — admin console staff</SelectItem>
                        <SelectItem value="ORG">Organization — company & lender teams</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role-desc">Description</Label>
                <Textarea
                  id="role-desc"
                  value={dialog.description}
                  onChange={(e) => setDialog((d) => (d ? { ...d, description: e.target.value } : d))}
                  placeholder="What is this role for?"
                  rows={2}
                  maxLength={500}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Permissions ({dialog.selected.size})</Label>
                  <span className="text-[11px] text-muted-foreground">
                    {dialog.locked ? 'Locked role' : 'Tick what this role may do'}
                  </span>
                </div>
                <PermissionMatrix
                  domains={PERMISSION_DOMAINS.filter((d) => d.scope === dialog.scope)}
                  selected={dialog.selected}
                  onToggle={togglePermission}
                  onToggleDomain={toggleDomain}
                  locked={dialog.locked}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" className="rounded-xl" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                className="rounded-xl"
                disabled={saving || dialog.name.trim().length < 2 || (!dialog.locked && dialog.selected.size === 0)}
                onClick={() => void saveRole()}
              >
                {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                {dialog.mode === 'create' ? 'Create role' : 'Save changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Grant role dialog ── */}
      <Dialog open={grantOpen} onOpenChange={(open) => { if (!open) { setGrantOpen(false); setGrantUser(null) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Grant a platform role</DialogTitle>
            <DialogDescription>
              Search for an existing user, pick one of the platform roles — they gain access the moment you save.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Staff member</Label>
              {grantUser ? (
                <div className="flex items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2.5">
                  <Avatar className="h-8 w-8 border">
                    <AvatarFallback className="text-[10px] font-semibold">{initials(grantUser.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{grantUser.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{grantUser.email}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-lg px-2 text-xs"
                    onClick={() => setGrantUser(null)}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <SearchInput
                    value={grantQuery}
                    onChange={setGrantQuery}
                    placeholder="Search by name or email…"
                    ariaLabel="Search users to grant a role"
                  />
                  {usersQ.loading ? (
                    <p className="px-1 text-xs text-muted-foreground">Searching…</p>
                  ) : (usersQ.data?.users ?? []).length === 0 ? (
                    debouncedGrantQuery.trim().length >= 2 && (
                      <p className="px-1 text-xs text-muted-foreground">No matching users.</p>
                    )
                  ) : (
                    <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border bg-card p-1.5">
                      {(usersQ.data?.users ?? []).map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setGrantUser(u)}
                          className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{u.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                          </span>
                          <Badge className="rounded-full border-0 bg-muted text-[10px] font-semibold text-muted-foreground">
                            {u.role}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Platform role</Label>
              <Select value={grantRoleId || undefined} onValueChange={setGrantRoleId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a role…" />
                </SelectTrigger>
                <SelectContent>
                  {platformRoles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} · {r.permissions.length} perms
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Tip: create a custom role first if none fits — the organization assignments live under Roles.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => { setGrantOpen(false); setGrantUser(null) }}>
              Cancel
            </Button>
            <Button className="rounded-xl" disabled={!grantUser || !grantRoleId || granting} onClick={() => void grantRole()}>
              {granting && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Grant role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Invite staff dialog ── */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite platform staff</DialogTitle>
            <DialogDescription>
              For emails without an account yet. When they register with the invitation token, the role is granted
              automatically. Existing users? Use “Grant role” instead.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Work email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="staff.member@company.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Full name (optional)</Label>
              <Input
                id="invite-name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="e.g. Salma Ahmed"
                maxLength={60}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Platform role</Label>
              <Select value={inviteRoleId || undefined} onValueChange={setInviteRoleId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a role…" />
                </SelectTrigger>
                <SelectContent>
                  {platformRoles
                    .filter((r) => r.key !== 'platform.super-admin')
                    .map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} · {r.permissions.length} perms
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-xl"
              disabled={!inviteEmail.includes('@') || !inviteRoleId || inviting}
              onClick={() => void inviteStaff()}
            >
              {inviting && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Send invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
