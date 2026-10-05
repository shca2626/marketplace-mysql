'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN · WHATSAPP SUITE (agent 8-a) — five-tab console:
// Templates · Rules · Campaigns · Inbox · Connection
// Built against /api/whatsapp/* and the :3031 bridge mini-service.
// ─────────────────────────────────────────────────────────────────────────────

import {
  FileText,
  Inbox,
  Megaphone,
  MessageSquareText,
  Plug,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TemplatesTab } from './whatsapp/templates-tab'
import { RulesTab } from './whatsapp/rules-tab'
import { CampaignsTab } from './whatsapp/campaigns-tab'
import { InboxTab } from './whatsapp/inbox-tab'
import { ConnectionTab } from './whatsapp/connection-tab'

export function WhatsAppTab() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-bh-navy">
          <MessageSquareText size={20} className="text-bh-gold-dark" />
          WhatsApp Suite
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-bh-muted">
          The Yemen solar marketplace’s customer channel — message templates, a chatbot that answers Arabic and English
          instantly, bulk campaigns, one unified inbox for WhatsApp and website chat, and the phone connection.
        </p>
      </div>

      <Tabs defaultValue="templates">
        <div className="w-full overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList className="h-auto w-max gap-1 rounded-xl bg-muted/60 p-1">
            <TabsTrigger
              value="templates"
              className="gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold data-[state=active]:bg-background sm:text-sm"
            >
              <FileText size={14} /> Templates
            </TabsTrigger>
            <TabsTrigger
              value="rules"
              className="gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold data-[state=active]:bg-background sm:text-sm"
            >
              <MessageSquareText size={14} /> Chatbot
            </TabsTrigger>
            <TabsTrigger
              value="campaigns"
              className="gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold data-[state=active]:bg-background sm:text-sm"
            >
              <Megaphone size={14} /> Campaigns
            </TabsTrigger>
            <TabsTrigger
              value="inbox"
              className="gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold data-[state=active]:bg-background sm:text-sm"
            >
              <Inbox size={14} /> Inbox
            </TabsTrigger>
            <TabsTrigger
              value="connection"
              className="gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold data-[state=active]:bg-background sm:text-sm"
            >
              <Plug size={14} /> Connection
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="templates" className="mt-4">
          <TemplatesTab />
        </TabsContent>
        <TabsContent value="rules" className="mt-4">
          <RulesTab />
        </TabsContent>
        <TabsContent value="campaigns" className="mt-4">
          <CampaignsTab />
        </TabsContent>
        <TabsContent value="inbox" className="mt-4">
          <InboxTab />
        </TabsContent>
        <TabsContent value="connection" className="mt-4">
          <ConnectionTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
