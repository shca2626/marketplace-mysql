'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ROLES SECTION — the company-side Team & Roles console (Phase 4).
// Canonical org-scope RBAC surfaced where the business owner lives:
//   • Role library — system templates + custom roles, with the permission set
//     of each (org-type allowlist enforced server-side, mirrored from
//     @/lib/rbac-catalog client-side for the picker).
//   • Custom role editor — create / edit / delete (system roles read-only).
//   • Assignments — grant multiple roles per member, revoke with one click
//     (revocations are effective immediately — nothing is cached).
// Owner holds every org permission for the org type by definition; owners
// manage this console with org.members.manage (legacy ADMIN bridge applies).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import {
  BadgeCheck,
  Loader2,
  Lock,
  Pencil,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCog,
  X,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useApi } from '@/hooks/use-api'
import { formatDate, initials } from '@/lib/format'
import { COMPANY_ORG_PERMISSIONS } from '@/lib/rbac-catalog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// ── Types (contracts of the org-rbac routes) ─────────────────────────────────

interface OrgRoleDTO {
  id: string
  key: string
  name: string
  description: string | null
  isSystem: boolean
  isProtected: boolean
  memberCount: number
  permissions: string[]
}

interface OrgRbacMember {
  id: string
  userId: string
  name: string
  email: string
  membershipRole: string
  jobTitle: string | null
  isOwner: boolean
  roles: { assignmentId: string; roleId: string; roleName: string; roleKey: string; storeId: string; isCustom: boolean }[]
  createdAt: string
}

const PERMISSION_LABELS: Record<string, string> = {
  'org.profile.view': 'View organization profile',
  'org.profile.update': 'Edit organization profile',
  'org.members.invite': 'Invite members',
  'org.members.manage': 'Manage members & roles',
  'org.orders.view': 'View organization orders',
  'org.rfq.view': 'View RFQs',
  'org.rfq.create': 'Create RFQs',
  'org.approvals.manage': 'Approve purchases & quotes',
  'org.pricelists.view': 'View price lists',
  'org.pricelists.manage': 'Manage price lists',
  'org.finance.view': 'View financing',
  'org.finance.apply': 'Apply for financing',
  'org.selling.view': 'View selling workspace',
  'org.offers.manage': 'Manage offers & inventory',
  'org.proposals.manage': 'Propose new products',
  'org.stores.manage': 'Manage stores',
  'org.sales.view': 'View sales orders',
  'org.sales.fulfill': 'Fulfill sales orders',
}

export function RolesSection({
  organizationId,
  canManage,
}: {
  organizationId: string
  canManage: boolean
}) {
  const rolesApi = useApi<{ roles: OrgRoleDTO[] }>(
    `/api/organizations/${organizationId}/roles`
  )
  const membersApi = useApi<{ members: OrgRbacMember[] }>(
    `/api/organizations/${organizationId}/members`
  )
  const roles = rolesApi.data?.roles ?? []
  const members = membersApi.data?.members ?? []

  const [editorRole, setEditorRole] = useState<OrgRoleDTO | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [assignFor, setAssignFor] = useState<OrgRbacMember | null>(null)
  const [assignRoleId, setAssignRoleId] = useState('')
  const [busy, setBusy] = useState(false)

  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles])
  const assignableRoles = roles.filter((r) => !r.isProtected || r.key !== 'org.owner')

  const refetchAll = () => {
    void rolesApi.refetch()
    void membersApi.refetch()
  }

  // ── Create / edit custom role ──
  const openEditor = (role: OrgRoleDTO | null) => {
    setEditorRole(role)
    setEditorOpen(true)
  }

  const submitRole = async (data: { name: string; permissions: string[]; description?: string | null }) => {
    if (busy) return
    if (data.name.trim().length < 2) {
      toast({ title: 'Role name too short', description: 'Use at least 2 characters.', variant: 'destructive' })
      return
    }
    if (data.permissions.length === 0) {
      toast({ title: 'Pick at least one permission', description: 'A role with no permissions does nothing.', variant: 'destructive' })
      return
    }
    setBusy(true)
    const editing = !!editorRole
    const res = await fetch(
      editing
        ? `/api/organizations/${organizationId}/roles/${editorRole!.id}`
        : `/api/organizations/${organizationId}/roles`,
      {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name.trim(),
          description: data.description?.trim() || null,
          permissions: data.permissions,
        }),
      }
    )
    setBusy(false)
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      toast({ title: editing ? 'Could not update role' : 'Could not create role', description: json.error, variant: 'destructive' })
      return
    }
    setEditorOpen(false)
    toast({
      title: editing ? 'Role updated' : 'Role created',
      description: `"${data.name.trim()}" — ${data.permissions.length} permission(s).`,
    })
    refetchAll()
  }

  // ── Delete custom role ──
  const deleteRole = async (role: OrgRoleDTO) => {
    if (busy) return
    if (!window.confirm(`Delete the custom role "${role.name}"? ${role.memberCount} assignment(s) are revoked immediately.`)) return
    setBusy(true)
    const res = await fetch(`/api/organizations/${organizationId}/roles/${role.id}`, { method: 'DELETE' })
    setBusy(false)
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      toast({ title: 'Could not delete role', description: json.error, variant: 'destructive' })
      return
    }
    toast({ title: 'Role deleted', description: `"${role.name}" and its assignments are gone.` })
    refetchAll()
  }

  // ── Assign / revoke ──
  const grantRole = async () => {
    if (!assignFor || !assignRoleId || busy) return
    setBusy(true)
    const res = await fetch(`/api/organizations/${organizationId}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: assignFor.userId, roleId: assignRoleId }),
    })
    setBusy(false)
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      toast({ title: 'Could not assign role', description: json.error, variant: 'destructive' })
      return
    }
    toast({
      title: 'Role assigned',
      description: `${roleById.get(assignRoleId)?.name ?? 'Role'} → ${assignFor.name}.`,
    })
    setAssignFor(null)
    setAssignRoleId('')
    refetchAll()
  }

  const revokeAssignment = async (member: OrgRbacMember, assignmentId: string, roleName: string) => {
    if (busy) return
    setBusy(true)
    const res = await fetch(
      `/api/organizations/${organizationId}/assignments/${assignmentId}`,
      { method: 'DELETE' }
    )
    setBusy(false)
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      toast({ title: 'Could not revoke', description: json.error, variant: 'destructive' })
      return
    }
    toast({ title: 'Revoked', description: `${roleName} removed from ${member.name}.` })
    refetchAll()
  }

  return (
    <div className="space-y-6">
      {/* ── Role library ── */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck size={16} className="text-primary" /> Role library
              <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold tabular-nums text-muted-foreground">
                {roles.length}
              </span>
            </CardTitle>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              System templates are fixed. Custom roles can combine any permission your company type allows.
            </p>
          </div>
          {canManage && (
            <Button size="sm" className="rounded-xl" onClick={() => openEditor(null)}>
              <Plus size={14} className="mr-1.5" /> Custom role
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {rolesApi.loading ? (
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : roles.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              No roles returned — your membership may have changed.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className={cn(
                    'rounded-xl border p-4 transition-colors',
                    role.isProtected ? 'border-primary/30 bg-primary/[0.04]' : 'bg-card hover:border-primary/40'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-semibold">
                        <span className="truncate">{role.name}</span>
                        {role.isProtected && <Lock size={12} className="shrink-0 text-primary" aria-label="Protected" />}
                      </p>
                      <p className="mt-0.5 line-clamp-1 font-mono text-[11px] text-muted-foreground">{role.key}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge
                        variant="secondary"
                        className="rounded-full text-[10.5px] font-semibold"
                      >
                        {role.memberCount} assigned
                      </Badge>
                      {!role.isSystem && canManage && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => openEditor(role)}
                            aria-label={`Edit ${role.name}`}
                          >
                            <Pencil size={13} />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => void deleteRole(role)}
                            aria-label={`Delete ${role.name}`}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {role.description && (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{role.description}</p>
                  )}
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {role.permissions.slice(0, 5).map((p) => (
                      <span
                        key={p}
                        title={p}
                        className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground"
                      >
                        {PERMISSION_LABELS[p] ?? p}
                      </span>
                    ))}
                    {role.permissions.length > 5 && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">
                        +{role.permissions.length - 5}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Member assignments ── */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog size={16} className="text-primary" /> Who can do what
            <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold tabular-nums text-muted-foreground">
              {members.length}
            </span>
          </CardTitle>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Additional roles stack on top of the membership level. Revoking takes effect immediately.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {membersApi.loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : (
            <ul className="divide-y rounded-xl border">
              {members.map((m) => (
                <li key={m.id} className="space-y-2.5 px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar className="h-9 w-9 border">
                      <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                        {initials(m.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-semibold">
                        <span className="truncate">{m.name}</span>
                        {m.isOwner && (
                          <BadgeCheck size={13} className="shrink-0 text-primary" aria-label="Owner" />
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.email} · joined {formatDate(m.createdAt)}
                      </p>
                    </div>
                    <Badge variant="outline" className="rounded-full text-[11px] font-semibold">
                      {m.membershipRole}
                    </Badge>
                    {canManage && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-full text-xs"
                        onClick={() => {
                          setAssignFor(m)
                          setAssignRoleId('')
                        }}
                      >
                        <Plus size={11} className="mr-1" /> Role
                      </Button>
                    )}
                  </div>
                  {/* Role assignment chips */}
                  <div className="flex flex-wrap items-center gap-1.5 pl-12 sm:pl-0 sm:text-right">
                    {m.roles.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground/70">No extra roles</span>
                    ) : (
                      m.roles.map((r) => (
                        <span
                          key={r.assignmentId}
                          className={cn(
                            'group flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                            r.isCustom
                              ? 'border-primary/40 bg-primary/10 text-primary'
                              : 'border-border bg-muted/50 text-muted-foreground'
                          )}
                          title={r.storeId ? `Store-scoped assignment` : r.roleKey}
                        >
                          {r.roleName}
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => void revokeAssignment(m, r.assignmentId, r.roleName)}
                              className="rounded-full p-0.5 transition-colors hover:bg-destructive/15 hover:text-destructive"
                              aria-label={`Revoke ${r.roleName} from ${m.name}`}
                              disabled={busy}
                            >
                              <X size={11} />
                            </button>
                          )}
                        </span>
                      ))
                    )}
                  </div>

                  {/* Inline assign row */}
                  {assignFor?.id === m.id && (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-2.5 pl-12 sm:pl-3.5">
                      <Select value={assignRoleId || undefined} onValueChange={setAssignRoleId}>
                        <SelectTrigger className="h-8 w-full rounded-lg text-xs sm:w-64" aria-label={`Role for ${m.name}`}>
                          <SelectValue placeholder="Pick a role to grant" />
                        </SelectTrigger>
                        <SelectContent>
                          {assignableRoles.map((r) => (
                            <SelectItem key={r.id} value={r.id} className="text-xs">
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          className="h-8 rounded-lg text-xs"
                          disabled={!assignRoleId || busy}
                          onClick={() => void grantRole()}
                        >
                          {busy ? <Loader2 size={12} className="mr-1 animate-spin" /> : null} Grant
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 rounded-lg text-xs"
                          onClick={() => setAssignFor(null)}
                          disabled={busy}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!canManage && (
            <p className="flex items-start gap-2 rounded-xl bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
              <ShieldAlert size={13} className="mt-px shrink-0" />
              Only owners and admins (or holders of the org.members.manage permission) can change roles.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Create / edit custom role dialog ── */}
      <RoleEditorDialog
        open={editorOpen}
        role={editorRole}
        onClose={() => setEditorOpen(false)}
        onSubmit={(data) => void submitRole(data)}
        busy={busy}
      />
    </div>
  )
}

// ── Role editor dialog ──────────────────────────────────────────────────────

function RoleEditorDialog({
  open,
  role,
  onClose,
  onSubmit,
  busy,
}: {
  open: boolean
  role: OrgRoleDTO | null
  onClose: () => void
  onSubmit: (data: { name: string; description?: string | null; permissions: string[] }) => void
  busy: boolean
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [initializedFor, setInitializedFor] = useState<OrgRoleDTO | 'new' | 'none'>('none')

  // Re-seed the form whenever the dialog opens for a different role
  if (open && initializedFor !== (role ?? 'new')) {
    setInitializedFor(role ?? 'new')
    setName(role?.name ?? '')
    setDescription(role?.description ?? '')
    setSelected(role?.permissions ?? [])
  }
  if (!open && initializedFor !== 'none') setInitializedFor('none')

  const toggle = (key: string) =>
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]))

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-primary" />
            {role ? `Edit "${role.name}"` : 'New custom role'}
          </DialogTitle>
          <DialogDescription>
            Combine any of the {COMPANY_ORG_PERMISSIONS.length} permissions your company type allows. Platform
            permissions are never grantable here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="role-name">Role name</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              placeholder="e.g. Procurement approver"
              className="rounded-xl"
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role-description">
              Description <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="role-description"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              placeholder="What this role is for"
              className="rounded-xl"
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Permissions</Label>
              <span className="text-xs tabular-nums text-muted-foreground">{selected.length} selected</span>
            </div>
            <ScrollArea className="h-56 rounded-xl border">
              <div className="grid grid-cols-1 gap-1 p-2">
                {COMPANY_ORG_PERMISSIONS.map((key) => {
                  const on = selected.includes(key)
                  return (
                    <label
                      key={key}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs transition-colors',
                        on ? 'bg-primary/10 font-semibold text-primary' : 'hover:bg-muted/60'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(key)}
                        className="size-3.5 accent-primary"
                        disabled={busy}
                      />
                      <span className="min-w-0 flex-1">{PERMISSION_LABELS[key] ?? key}</span>
                      <span className="hidden shrink-0 font-mono text-[9.5px] text-muted-foreground/60 sm:block">
                        {key}
                      </span>
                    </label>
                  )
                })}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="rounded-xl"
            disabled={busy || name.trim().length < 2 || selected.length === 0}
            onClick={() => onSubmit({ name, description, permissions: selected })}
          >
            {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
            {role ? 'Save changes' : 'Create role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
