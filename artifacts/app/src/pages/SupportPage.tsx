/**
 * @fileOverview Web screen role: provides a searchable help centre and an in-browser support request form.
 * System connection: mounted from App.tsx and submits the OpenAPI support request operation.
 */
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useCreateSupportRequest } from "@workspace/api-client-react";
import type { SupportRequestInputCategory } from "@workspace/api-client-react";
import {
  BookOpen, CheckCircle2, ChevronRight, Clipboard, ExternalLink, LifeBuoy,
  Loader2, LockKeyhole, Mail, Search, Settings, ShieldCheck, Smartphone,
  Trash2, UserRound,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/edu-ds/components/ui/card";
import { Input } from "@workspace/edu-ds/components/ui/input";
import { Textarea } from "@workspace/edu-ds/components/ui/textarea";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import { describeApiError } from "@/lib/api-error";

const SUPPORT_EMAIL = "support@casparel.com";
type GuideCategory = "all" | SupportRequestInputCategory;
type Guide = {
  category: Exclude<GuideCategory, "all">;
  title: string;
  summary: string;
  steps: string[];
  action?: { label: string; href: string };
};

const categories: Array<{ value: GuideCategory; label: string }> = [
  { value: "all", label: "All topics" }, { value: "account", label: "Account" },
  { value: "resources", label: "Resources" }, { value: "classes", label: "Classes" },
  { value: "billing", label: "Subscriptions" }, { value: "privacy", label: "Privacy" },
  { value: "safety", label: "Safety" }, { value: "technical", label: "Technical" },
];

const guides: Guide[] = [
  {
    category: "account", title: "Sign in or reset account access",
    summary: "Recover access when your password or sign-in is not working.",
    steps: [
      "Open the sign-in page and confirm that you are using the email registered to Casparel.",
      "Choose Forgot password and follow the link sent to your inbox. Check spam if it does not arrive.",
      "If an error remains, submit the form below with the exact error and your device. Never include your password.",
    ],
    action: { label: "Open sign in", href: "/login" },
  },
  {
    category: "privacy", title: "Delete your Casparel account",
    summary: "Start deletion in the app or use the public deletion request route.",
    steps: [
      "In Casparel, open Settings and select Delete account.",
      "Read what will be deleted, confirm with your password, then select Delete my account.",
      "If you cannot sign in, open the public deletion page and send a request from the email associated with the account.",
    ],
    action: { label: "Open account deletion", href: "/delete-account" },
  },
  {
    category: "resources", title: "Search, save, and review a resource",
    summary: "Find a source, keep it in a list, and add a useful review.",
    steps: [
      "Open Resources and search with a title, subject, URL, or question.",
      "Open a result to inspect its source details, then choose Save to list.",
      "On the resource page, add a rating and explain what learners should know before using it.",
    ],
    action: { label: "Open resources", href: "/resources" },
  },
  {
    category: "classes", title: "Join a class or invite learners",
    summary: "Use a join code as a learner or manage invitations as a teacher.",
    steps: [
      "Open Classes. Learners select Join class and enter the code supplied by the teacher.",
      "Teachers open a class, select People, and share the join code or invite registered email addresses.",
      "If a code fails, check for spaces and ask the teacher to confirm that the class is still active.",
    ],
    action: { label: "Open classes", href: "/classes" },
  },
  {
    category: "billing", title: "Restore a Pro subscription",
    summary: "Reconnect a purchase made through Apple or Google Play.",
    steps: [
      "Sign in with the same Casparel account and store account used for the original purchase.",
      "In the mobile app, open Settings, then Subscription, and select Restore purchases.",
      "If Pro is still missing, submit the form below with the store, purchase date, and order ID only. Do not send full payment details.",
    ],
    action: { label: "Open settings", href: "/settings" },
  },
  {
    category: "safety", title: "Block or report a user or content",
    summary: "Stop unwanted contact and send a report to moderation.",
    steps: [
      "Open the user profile, message, post, or other content that concerns you.",
      "Open its action menu and choose Block to stop interaction or Report to alert moderation.",
      "Choose the closest reason and add only the context needed to understand the issue.",
    ],
  },
  {
    category: "technical", title: "Fix a page that will not load",
    summary: "Rule out a stale session or browser problem before reporting it.",
    steps: [
      "Refresh the page once and confirm that your internet connection is working.",
      "Sign out and back in. If possible, try a current version of another browser or the mobile app.",
      "If the problem continues, send the page URL, exact error, device, browser, and time using the form below.",
    ],
  },
];

export default function SupportPage() {
  const createRequest = useCreateSupportRequest();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<GuideCategory>("all");
  const [copied, setCopied] = useState(false);
  const [receiptId, setReceiptId] = useState<number | null>(null);
  const [form, setForm] = useState({
    email: "", category: "technical" as SupportRequestInputCategory,
    subject: "", message: "", device: "", website: "",
  });

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Support | Casparel";
    return () => { document.title = previousTitle; };
  }, []);

  const filteredGuides = useMemo(() => {
    const term = search.trim().toLowerCase();
    return guides.filter((guide) => {
      if (category !== "all" && guide.category !== category) return false;
      return !term || [guide.title, guide.summary, ...guide.steps].join(" ").toLowerCase().includes(term);
    });
  }, [category, search]);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({ title: "Copy failed", description: `Select and copy ${SUPPORT_EMAIL}.`, variant: "destructive" });
    }
  }

  async function submitSupportRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReceiptId(null);
    try {
      const receipt = await createRequest.mutateAsync({
        data: { ...form, device: form.device.trim() || undefined },
      });
      setReceiptId(receipt.id);
      setForm((current) => ({ ...current, subject: "", message: "", device: "", website: "" }));
    } catch (error) {
      toast({
        title: "Request could not be sent",
        description: describeApiError(error, "Check the form and try again."),
        variant: "destructive",
      });
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-12 px-4 py-10 text-foreground sm:px-6">
      <header className="overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="grid gap-8 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-10">
          <div className="max-w-2xl space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary-text">Casparel Support Centre</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Find an answer or contact us</h1>
            <p className="text-base text-muted-foreground">Search practical walkthroughs or send a support request directly from this page. You do not need an email app.</p>
            <label className="relative block max-w-xl">
              <span className="sr-only">Search support guides</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sign in, deletion, classes, billing…" className="h-12 pl-12" />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
            <Button asChild size="lg"><Link href="/delete-account"><Trash2 className="mr-2 size-4" /> Delete account</Link></Button>
            <Button asChild size="lg" variant="outline"><a href="#contact-support"><LifeBuoy className="mr-2 size-4" /> Contact support</a></Button>
          </div>
        </div>
      </header>

      <section aria-labelledby="quick-actions-heading" className="space-y-4">
        <div><h2 id="quick-actions-heading" className="text-2xl font-semibold">Quick actions</h2><p className="mt-1 text-sm text-muted-foreground">Go straight to the most requested account and safety controls.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: UserRound, title: "Account settings", text: "Profile, password, language, and account controls", href: "/settings" },
            { icon: Trash2, title: "Delete account", text: "Deletion steps, retained data, and web request option", href: "/delete-account" },
            { icon: ShieldCheck, title: "Privacy and safety", text: "Privacy details, blocking, reporting, and moderation", href: "/privacy" },
            { icon: Smartphone, title: "Mobile and desktop", text: "Install Casparel and verify desktop downloads", href: "/download" },
          ].map((item) => (
            <Link key={item.title} href={item.href} className="group rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
              <item.icon className="size-5 text-primary-text" /><h3 className="mt-4 font-semibold">{item.title}</h3><p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
              <span className="mt-4 inline-flex items-center text-sm font-medium text-primary-text">Open <ChevronRight className="ml-1 size-4 transition group-hover:translate-x-1" /></span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="guides-heading" className="space-y-5">
        <div><h2 id="guides-heading" className="text-2xl font-semibold">Step-by-step guides</h2><p className="mt-1 text-sm text-muted-foreground">Open a guide to see each screen and action in order.</p></div>
        <div className="flex flex-wrap gap-2" aria-label="Filter support guides">
          {categories.map((item) => <Button key={item.value} type="button" size="sm" variant={category === item.value ? "default" : "outline"} onClick={() => setCategory(item.value)}>{item.label}</Button>)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredGuides.map((guide) => (
            <details key={guide.title} className="group rounded-2xl border bg-card shadow-sm open:border-primary/40">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-5">
                <span><span className="text-xs font-semibold uppercase tracking-wide text-primary-text">{categories.find((item) => item.value === guide.category)?.label}</span><span className="mt-1 block font-semibold">{guide.title}</span><span className="mt-1 block text-sm text-muted-foreground">{guide.summary}</span></span>
                <ChevronRight className="mt-2 size-5 shrink-0 transition group-open:rotate-90" />
              </summary>
              <div className="border-t px-5 py-5">
                <ol className="space-y-4">{guide.steps.map((step, index) => <li key={step} className="flex gap-3 text-sm"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary-text">{index + 1}</span><span className="pt-1 text-muted-foreground">{step}</span></li>)}</ol>
                {guide.action ? <Button asChild size="sm" variant="outline" className="mt-5"><Link href={guide.action.href}>{guide.action.label}<ExternalLink className="ml-2 size-3.5" /></Link></Button> : null}
              </div>
            </details>
          ))}
        </div>
        {filteredGuides.length === 0 ? <Card><CardContent className="py-10 text-center"><BookOpen className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 font-medium">No guide matched your search</p><p className="mt-1 text-sm text-muted-foreground">Try fewer words or send us a request below.</p></CardContent></Card> : null}
      </section>

      <section id="contact-support" aria-labelledby="contact-heading" className="scroll-mt-6">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader><CardTitle id="contact-heading" className="flex items-center gap-2 text-2xl"><LifeBuoy className="size-6 text-primary-text" /> Send a support request</CardTitle><p className="text-sm text-muted-foreground">The request goes securely to Casparel support from your browser. Required fields are marked.</p></CardHeader>
            <CardContent>
              {receiptId ? <div role="status" className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 size-5 text-emerald-600" /><div><p className="font-semibold">Request sent</p><p className="mt-1 text-sm text-muted-foreground">Your reference is CSP-{receiptId}. Keep it for follow-up.</p></div></div></div> : null}
              <form className="space-y-4" onSubmit={submitSupportRequest}>
                <input aria-hidden="true" autoComplete="off" tabIndex={-1} className="hidden" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm"><span className="font-medium">Email address *</span><Input type="email" autoComplete="email" required maxLength={320} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
                  <label className="space-y-1.5 text-sm"><span className="font-medium">Topic *</span><select required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as SupportRequestInputCategory })}>{categories.filter((item) => item.value !== "all").concat([{ value: "other", label: "Other" }]).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                </div>
                <label className="space-y-1.5 text-sm"><span className="font-medium">Subject *</span><Input required minLength={3} maxLength={160} value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="What do you need help with?" /></label>
                <label className="space-y-1.5 text-sm"><span className="font-medium">What happened? *</span><Textarea required minLength={10} maxLength={5000} rows={6} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="Tell us what you tried, what you expected, and the exact error." /></label>
                <label className="space-y-1.5 text-sm"><span className="font-medium">Device and browser (optional)</span><Input maxLength={300} value={form.device} onChange={(event) => setForm({ ...form, device: event.target.value })} placeholder="For example: Pixel 9, Android 16, Chrome" /></label>
                <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="flex items-start gap-2 text-xs text-muted-foreground"><LockKeyhole className="mt-0.5 size-3.5 shrink-0" /> Never send a password, authentication code, or full payment details.</p><Button type="submit" disabled={createRequest.isPending}>{createRequest.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Mail className="mr-2 size-4" />} Send request</Button></div>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card><CardHeader><CardTitle className="text-lg">Prefer email?</CardTitle></CardHeader><CardContent className="space-y-4 text-sm text-muted-foreground"><p>The mailbox is active. Copy the address below and paste it into Gmail, Outlook, Apple Mail, or another service.</p><div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2"><code translate="no" className="min-w-0 flex-1 truncate px-2 text-foreground">{SUPPORT_EMAIL}</code><Button type="button" size="sm" variant="outline" onClick={copyEmail}>{copied ? <CheckCircle2 className="mr-2 size-4" /> : <Clipboard className="mr-2 size-4" />}{copied ? "Copied" : "Copy"}</Button></div><p>A mail button can appear to do nothing when the browser has no default email application. The web form works without one.</p></CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Settings className="size-5 text-primary-text" /> Policies and downloads</CardTitle></CardHeader><CardContent className="grid gap-2 text-sm"><Link href="/terms" className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-muted">Terms <ChevronRight className="size-4" /></Link><Link href="/privacy" className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-muted">Privacy Policy <ChevronRight className="size-4" /></Link><Link href="/delete-account" className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-muted">Account deletion <ChevronRight className="size-4" /></Link><Link href="/code-signing" className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-muted">Verify a desktop download <ChevronRight className="size-4" /></Link></CardContent></Card>
          </div>
        </div>
      </section>
    </main>
  );
}
