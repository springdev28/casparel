import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useIntlLocale } from "@/lib/date-locale";
import { useSearch } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Input } from "@workspace/edu-ds/components/ui/input";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import { Switch } from "@workspace/edu-ds/components/ui/switch";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import { Check, Loader2, MessageCircle, Send, ShieldCheck, X } from "lucide-react";
import { useUpdateUserPreferences, useUserPreferences } from "../lib/user-preferences";
import { useDocumentVisibility } from "../lib/use-document-visibility";

type Message = {
  id: number;
  conversationId: number;
  senderId: number;
  body: string;
  isAdminMessage: boolean;
  readAt: string | null;
  createdAt: string;
};
type Conversation = {
  id: number;
  firstUserId: number;
  secondUserId: number;
  requestedById: number;
  status: "pending" | "accepted" | "declined";
  updatedAt: string;
  other: { id: number; name: string; role: string; avatarUrl: string | null };
  lastMessage: Message | null;
  unreadCount: number;
  incomingRequest: boolean;
};
type ConversationDetails = Conversation & { messages: Message[] };

function apiUrl(path: string) {
  return import.meta.env.BASE_URL.replace(/\/$/, "") + "/api" + path;
}

async function messageRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Authorization: "Bearer " + localStorage.getItem("schoolar_token"),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { error?: string }).error || "Messaging failed");
  return payload as T;
}

export default function MessagesPage() {
  const intlLocale = useIntlLocale();
  const search = useSearch();
  const targetUserId = Number(new URLSearchParams(search).get("userId"));
  const { data: me } = useGetMe();
  const preferences = useUserPreferences(Boolean(me));
  const updatePreferences = useUpdateUserPreferences();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<ConversationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const documentVisible = useDocumentVisibility();

  async function loadConversations(silent = false) {
    if (!silent) setLoading(true);
    try {
      const rows = await messageRequest<Conversation[]>("/direct-messages/conversations");
      setConversations(rows);
      if (active) {
        const updated = rows.find((item) => item.id === active.id);
        if (updated) setActive((current) => current ? { ...current, ...updated } : current);
      }
      return rows;
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function openConversation(conversation: Conversation) {
    const details = await messageRequest<ConversationDetails>(`/direct-messages/conversations/${conversation.id}`);
    setActive(details);
    setConversations((current) => current.map((item) => item.id === details.id ? { ...item, unreadCount: 0 } : item));
  }

  useEffect(() => {
    let activeEffect = true;
    void loadConversations().then(async (rows) => {
      if (!activeEffect) return;
      let selected = Number.isInteger(targetUserId) && targetUserId > 0
        ? rows.find((item) => item.other.id === targetUserId)
        : rows[0];
      if (!selected && Number.isInteger(targetUserId) && targetUserId > 0) {
        try {
          selected = await messageRequest<Conversation>("/direct-messages/conversations", {
            method: "POST",
            body: JSON.stringify({ userId: targetUserId }),
          });
          setConversations((current) => [selected!, ...current]);
        } catch (error) {
          toast({ title: "Cannot start this conversation", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
        }
      }
      if (selected) await openConversation(selected);
    }).catch((error) => toast({ title: "Could not load messages", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }));
    return () => { activeEffect = false; };
  }, [targetUserId]);

  useEffect(() => {
    if (!documentVisible) return;
    const interval = window.setInterval(
      () => void loadConversations(true).catch(() => undefined),
      10_000,
    );
    return () => window.clearInterval(interval);
  }, [documentVisible, targetUserId]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active || !me) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = String(data.get("body") ?? "").trim();
    if (!body) return;
    const optimistic: Message = {
      id: -Date.now(), conversationId: active.id, senderId: me.id, body,
      isAdminMessage: me.role === "admin", readAt: null, createdAt: new Date().toISOString(),
    };
    form.reset();
    setActive((current) => current ? { ...current, messages: [...current.messages, optimistic] } : current);
    setSending(true);
    try {
      const created = await messageRequest<Message>(`/direct-messages/conversations/${active.id}/messages`, { method: "POST", body: JSON.stringify({ body }) });
      setActive((current) => current ? { ...current, messages: current.messages.map((item) => item.id === optimistic.id ? created : item) } : current);
      setConversations((current) => current.map((item) => item.id === active.id ? { ...item, lastMessage: created, updatedAt: created.createdAt } : item));
    } catch (error) {
      setActive((current) => current ? { ...current, messages: current.messages.filter((item) => item.id !== optimistic.id) } : current);
      toast({ title: "Message was not sent", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally { setSending(false); }
  }

  async function respond(action: "accept" | "decline") {
    if (!active) return;
    const updated = await messageRequest<Conversation>(`/direct-messages/conversations/${active.id}/request`, { method: "PATCH", body: JSON.stringify({ action }) });
    if (action === "decline") setActive(null);
    setConversations((current) => action === "decline" ? current.filter((item) => item.id !== active.id) : current.map((item) => item.id === updated.id ? updated : item));
    if (action === "accept") setActive((current) => current ? { ...current, status: "accepted", incomingRequest: false } : current);
  }

  const orderedMessages = useMemo(() => active?.messages ?? [], [active?.messages]);
  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-7xl flex-col p-3 sm:p-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Messages</h1><p className="text-sm text-muted-foreground">Private conversations and message requests</p></div>
        {/*
          The switch renders as a button, and a wrapping <label> names form
          controls, not buttons -- so this announced as "switch, on" with no
          hint of what it governs. aria-labelledby rather than aria-label
          because the visible text is what the translation bridge replaces; an
          aria-label would leave a Turkish reader hearing English.
        */}
        <label className="flex items-center gap-2 border bg-card px-3 py-2 text-sm text-card-foreground" style={{ borderRadius: 8 }}>
          <Switch
            aria-labelledby="allow-message-requests-label"
            checked={preferences.data?.allowMessageRequests ?? true}
            onCheckedChange={(checked) => updatePreferences.mutate({ allowMessageRequests: checked })}
          />
          <span id="allow-message-requests-label">Allow requests from new people</span>
        </label>
      </header>
      <div className="grid min-h-0 flex-1 overflow-hidden border bg-card text-card-foreground md:grid-cols-[19rem_1fr]" style={{ borderRadius: 8 }}>
        <aside className={(active ? "hidden md:block " : "") + "overflow-y-auto border-r"}>
          {loading ? <div className="p-6 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></div> : conversations.map((conversation) => (
            <button key={conversation.id} onClick={() => void openConversation(conversation)} className={(active?.id === conversation.id ? "bg-muted " : "") + "flex w-full gap-3 border-b p-3 text-left hover:bg-muted/60"}>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold">{conversation.other.name.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1"><span translate="no" className="flex items-center gap-1 font-medium">{conversation.other.name}{conversation.other.role === "admin" ? <ShieldCheck className="size-3.5 text-primary-text" /> : null}</span><span className="block truncate text-xs text-muted-foreground">{conversation.incomingRequest ? "Message request" : conversation.lastMessage?.body ? <span translate="no">{conversation.lastMessage.body}</span> : "Start a conversation"}</span></span>
              {conversation.unreadCount ? <Badge>{conversation.unreadCount}</Badge> : null}
            </button>
          ))}
          {!loading && conversations.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Open a person’s profile and choose Message.</p> : null}
        </aside>
        <main className={(active ? "flex" : "hidden md:flex") + " min-h-0 flex-col"}>
          {active ? <>
            <div className="flex items-center gap-3 border-b px-4 py-3"><Button className="md:hidden" size="icon" variant="ghost" onClick={() => setActive(null)} aria-label="Back to conversations"><X className="size-4" aria-hidden="true" /></Button><div className="min-w-0 flex-1"><p translate="no" className="font-semibold">{active.other.name}</p><p className="text-xs capitalize text-muted-foreground">{active.other.role}</p></div>{active.other.role === "admin" ? <Badge className="gap-1"><ShieldCheck className="size-3" />Official administrator</Badge> : null}</div>
            {active.incomingRequest ? <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/50 p-3 text-sm"><span>Accept this request before replying.</span><span className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void respond("decline")}><X className="mr-1 size-4" />Decline</Button><Button size="sm" onClick={() => void respond("accept")}><Check className="mr-1 size-4" />Accept</Button></span></div> : null}
            <div className="flex-1 space-y-3 overflow-y-auto p-4">{orderedMessages.map((message) => { const mine = message.senderId === me?.id; return <div key={message.id} className={"flex " + (mine ? "justify-end" : "justify-start")}><div className={(message.isAdminMessage ? "border-primary bg-primary/10 " : mine ? "bg-primary text-primary-foreground " : "bg-muted ") + "max-w-[82%] border px-3 py-2 text-sm"} style={{ borderRadius: 8 }}>{message.isAdminMessage ? <p className="mb-1 flex items-center gap-1 text-xs font-bold text-primary-text"><ShieldCheck className="size-3" />Official administrator message</p> : null}<p translate="no" className="whitespace-pre-wrap break-words">{message.body}</p><p className="mt-1 text-[10px] opacity-70">{new Date(message.createdAt).toLocaleString(intlLocale)}</p></div></div>; })}</div>
            <form onSubmit={send} className="flex gap-2 border-t p-3"><Input name="body" autoComplete="off" aria-label="Message" placeholder={active.incomingRequest ? "Accept the request to reply" : "Write a private message…"} disabled={active.incomingRequest || active.status === "declined"} /><Button size="icon" type="submit" disabled={sending || active.incomingRequest} aria-label="Send message"><Send className="size-4" aria-hidden="true" /></Button></form>
          </> : <div className="m-auto text-center text-muted-foreground"><MessageCircle className="mx-auto mb-2 size-8" /><p>Select a conversation</p></div>}
        </main>
      </div>
    </div>
  );
}
