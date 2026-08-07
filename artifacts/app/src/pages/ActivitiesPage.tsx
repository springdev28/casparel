import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  CopyPlus,
  Layers3,
  Pencil,
  Plus,
  RotateCcw,
  Shuffle,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import { Button } from "@workspace/edu-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/edu-ds/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/edu-ds/components/ui/dialog";
import { Input } from "@workspace/edu-ds/components/ui/input";
import { Label } from "@workspace/edu-ds/components/ui/label";
import { Skeleton } from "@workspace/edu-ds/components/ui/skeleton";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import { cn } from "@workspace/edu-ds/lib/utils";

type ActivityCard = {
  id: string;
  term: string;
  answer: string;
};

type StudyActivity = {
  id: number;
  title: string;
  subject: string | null;
  cards: ActivityCard[];
  createdAt: string;
  updatedAt: string;
};

type ActivityMode = "flashcards" | "practice" | "match";

type MatchItem = {
  key: string;
  cardId: string;
  side: "term" | "answer";
  text: string;
  matched: boolean;
};

const TOKEN_KEY = "schoolar_token";

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

async function activityRequest(path: string, init?: RequestInit) {
  const response = await fetch("/api" + path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      Authorization: "Bearer " + localStorage.getItem(TOKEN_KEY),
      ...init?.headers,
    },
  });
  if (response.status === 204) return null;
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? "The activity request failed");
  }
  return payload;
}

function emptyCard(): ActivityCard {
  return { id: crypto.randomUUID(), term: "", answer: "" };
}

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<StudyActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<ActivityMode>("flashcards");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formCards, setFormCards] = useState<ActivityCard[]>([
    emptyCard(),
    emptyCard(),
  ]);

  const selected =
    activities.find((activity) => activity.id === selectedId) ?? activities[0];

  const [cardOrder, setCardOrder] = useState<ActivityCard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const [practiceOrder, setPracticeOrder] = useState<ActivityCard[]>([]);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [practiceAnswer, setPracticeAnswer] = useState("");
  const [practiceResult, setPracticeResult] = useState<
    "correct" | "incorrect" | null
  >(null);
  const [practiceCorrect, setPracticeCorrect] = useState(0);

  const [matchItems, setMatchItems] = useState<MatchItem[]>([]);
  const [firstMatchKey, setFirstMatchKey] = useState<string | null>(null);
  const [blockedMatchKeys, setBlockedMatchKeys] = useState<string[]>([]);
  const [matchStartedAt, setMatchStartedAt] = useState<number | null>(null);
  const [matchSeconds, setMatchSeconds] = useState(0);

  async function loadActivities() {
    setLoading(true);
    try {
      const result = (await activityRequest(
        "/study-activities",
      )) as unknown as StudyActivity[];
      setActivities(result);
      setSelectedId((current) =>
        result.some((activity) => activity.id === current)
          ? current
          : (result[0]?.id ?? null),
      );
    } catch (error) {
      toast({
        title: "Could not load activities",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadActivities();
  }, []);

  function resetStudy(activity: StudyActivity | undefined) {
    const cards = activity?.cards ?? [];
    setCardOrder(cards);
    setCardIndex(0);
    setFlipped(false);
    setPracticeOrder(shuffled(cards));
    setPracticeIndex(0);
    setPracticeAnswer("");
    setPracticeResult(null);
    setPracticeCorrect(0);
    setMatchItems(
      shuffled(
        cards.flatMap((card) => [
          {
            key: card.id + ":term",
            cardId: card.id,
            side: "term" as const,
            text: card.term,
            matched: false,
          },
          {
            key: card.id + ":answer",
            cardId: card.id,
            side: "answer" as const,
            text: card.answer,
            matched: false,
          },
        ]),
      ),
    );
    setFirstMatchKey(null);
    setBlockedMatchKeys([]);
    setMatchStartedAt(null);
    setMatchSeconds(0);
  }

  useEffect(() => {
    resetStudy(selected);
  }, [selected?.id]);

  useEffect(() => {
    if (mode !== "match" || matchStartedAt === null) return;
    const timer = window.setInterval(() => {
      setMatchSeconds(Math.floor((Date.now() - matchStartedAt) / 1000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [mode, matchStartedAt]);

  const matchComplete =
    matchItems.length > 0 && matchItems.every((item) => item.matched);

  useEffect(() => {
    if (matchComplete) setMatchStartedAt(null);
  }, [matchComplete]);

  function openNewSet() {
    setEditingId(null);
    setFormTitle("");
    setFormSubject("");
    setFormCards([emptyCard(), emptyCard()]);
    setEditorOpen(true);
  }

  function openEditSet(activity: StudyActivity) {
    setEditingId(activity.id);
    setFormTitle(activity.title);
    setFormSubject(activity.subject ?? "");
    setFormCards(activity.cards.map((card) => ({ ...card })));
    setEditorOpen(true);
  }

  function updateFormCard(
    id: string,
    field: "term" | "answer",
    value: string,
  ) {
    setFormCards((cards) =>
      cards.map((card) => (card.id === id ? { ...card, [field]: value } : card)),
    );
  }

  async function saveSet(event: React.FormEvent) {
    event.preventDefault();
    const completeCards = formCards.filter(
      (card) => card.term.trim() && card.answer.trim(),
    );
    if (completeCards.length < 2) {
      toast({
        title: "Add at least two complete cards",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const activity = (await activityRequest(
        editingId ? `/study-activities/${editingId}` : "/study-activities",
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify({
            title: formTitle,
            subject: formSubject,
            cards: completeCards,
          }),
        },
      )) as unknown as StudyActivity;
      await loadActivities();
      setSelectedId(activity.id);
      setEditorOpen(false);
      toast({ title: editingId ? "Activity updated" : "Activity created" });
    } catch (error) {
      toast({
        title: "Could not save activity",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteSet(activity: StudyActivity) {
    if (!window.confirm(`Delete “${activity.title}”?`)) return;
    try {
      await activityRequest(`/study-activities/${activity.id}`, {
        method: "DELETE",
      });
      await loadActivities();
      toast({ title: "Activity deleted" });
    } catch (error) {
      toast({
        title: "Could not delete activity",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  function moveFlashcard(direction: -1 | 1) {
    if (!cardOrder.length) return;
    setCardIndex(
      (current) => (current + direction + cardOrder.length) % cardOrder.length,
    );
    setFlipped(false);
  }

  function shuffleFlashcards() {
    setCardOrder((cards) => shuffled(cards));
    setCardIndex(0);
    setFlipped(false);
  }

  function checkPracticeAnswer() {
    const current = practiceOrder[practiceIndex];
    if (!current || practiceResult) return;
    const normalize = (value: string) =>
      value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
    const correct = normalize(practiceAnswer) === normalize(current.answer);
    setPracticeResult(correct ? "correct" : "incorrect");
    if (correct) setPracticeCorrect((value) => value + 1);
  }

  function nextPracticeCard() {
    setPracticeIndex((index) => index + 1);
    setPracticeAnswer("");
    setPracticeResult(null);
  }

  function restartPractice() {
    setPracticeOrder(shuffled(selected?.cards ?? []));
    setPracticeIndex(0);
    setPracticeAnswer("");
    setPracticeResult(null);
    setPracticeCorrect(0);
  }

  function selectMatch(item: MatchItem) {
    if (
      item.matched ||
      blockedMatchKeys.length ||
      item.key === firstMatchKey
    ) {
      return;
    }
    if (matchStartedAt === null) setMatchStartedAt(Date.now());
    if (!firstMatchKey) {
      setFirstMatchKey(item.key);
      return;
    }
    const first = matchItems.find((candidate) => candidate.key === firstMatchKey);
    if (!first) {
      setFirstMatchKey(item.key);
      return;
    }
    if (first.cardId === item.cardId && first.side !== item.side) {
      setMatchItems((items) =>
        items.map((candidate) =>
          candidate.cardId === item.cardId
            ? { ...candidate, matched: true }
            : candidate,
        ),
      );
      setFirstMatchKey(null);
      return;
    }
    setBlockedMatchKeys([first.key, item.key]);
    window.setTimeout(() => {
      setBlockedMatchKeys([]);
      setFirstMatchKey(null);
    }, 650);
  }

  function restartMatch() {
    if (!selected) return;
    setMatchItems(
      shuffled(
        selected.cards.flatMap((card) => [
          {
            key: card.id + ":term",
            cardId: card.id,
            side: "term" as const,
            text: card.term,
            matched: false,
          },
          {
            key: card.id + ":answer",
            cardId: card.id,
            side: "answer" as const,
            text: card.answer,
            matched: false,
          },
        ]),
      ),
    );
    setFirstMatchKey(null);
    setBlockedMatchKeys([]);
    setMatchStartedAt(null);
    setMatchSeconds(0);
  }

  const currentFlashcard = cardOrder[cardIndex];
  const currentPractice = practiceOrder[practiceIndex];
  const practiceComplete =
    practiceOrder.length > 0 && practiceIndex >= practiceOrder.length;
  const modeOptions = useMemo(
    () =>
      [
        ["flashcards", Layers3, "Flashcards"],
        ["practice", Sparkles, "Practice"],
        ["match", Clock3, "Match"],
      ] as const,
    [],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Study activities</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create, edit, and study your own term-and-answer sets.
          </p>
        </div>
        <Button onClick={openNewSet}>
          <Plus className="mr-2 size-4" /> New activity
        </Button>
      </header>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      ) : !activities.length ? (
        <div className="border-y py-16 text-center">
          <Layers3 className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="font-semibold">No study activities yet</p>
          <Button className="mt-4" onClick={openNewSet}>
            <Plus className="mr-2 size-4" /> Create the first set
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="space-y-2">
            {activities.map((activity) => (
              <Card
                key={activity.id}
                className={cn(
                  "cursor-pointer",
                  selected?.id === activity.id && "border-primary",
                )}
                onClick={() => setSelectedId(activity.id)}
              >
                <CardHeader className="p-4">
                  <CardTitle className="line-clamp-2 text-sm">
                    {activity.title}
                  </CardTitle>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {activity.cards.length} cards
                    </span>
                    {activity.subject && (
                      <Badge variant="secondary" className="max-w-28 truncate">
                        {activity.subject}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
              </Card>
            ))}
          </aside>

          {selected && (
            <main className="min-w-0 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                <div>
                  <h2 className="text-xl font-bold">{selected.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {selected.subject ?? "General"} · {selected.cards.length} cards
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => openEditSet(selected)}
                    aria-label="Edit activity"
                    title="Edit activity"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => deleteSet(selected)}
                    aria-label="Delete activity"
                    title="Delete activity"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="inline-flex rounded-md border bg-card p-1">
                {modeOptions.map(([value, Icon, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    className={cn(
                      "flex items-center gap-2 rounded px-3 py-2 text-sm font-medium",
                      mode === value
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" /> {label}
                  </button>
                ))}
              </div>

              {mode === "flashcards" && currentFlashcard && (
                <section className="space-y-4">
                  <button
                    type="button"
                    className="flex min-h-72 w-full items-center justify-center rounded-md border bg-card p-8 text-center shadow-sm"
                    onClick={() => setFlipped((value) => !value)}
                    data-testid="activity-flashcard"
                  >
                    <span>
                      <span className="mb-4 block text-xs font-bold uppercase text-muted-foreground">
                        {flipped ? "Answer" : "Term"}
                      </span>
                      <span className="text-2xl font-semibold">
                        {flipped ? currentFlashcard.answer : currentFlashcard.term}
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center justify-between gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => moveFlashcard(-1)}
                      aria-label="Previous card"
                    >
                      <ArrowLeft className="size-4" />
                    </Button>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {cardIndex + 1} / {cardOrder.length}
                      </span>
                      <Button variant="outline" size="sm" onClick={shuffleFlashcards}>
                        <Shuffle className="mr-2 size-4" /> Shuffle
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => moveFlashcard(1)}
                      aria-label="Next card"
                    >
                      <ArrowRight className="size-4" />
                    </Button>
                  </div>
                </section>
              )}

              {mode === "practice" && (
                <section className="border-y py-6">
                  {practiceComplete ? (
                    <div className="py-10 text-center">
                      <p className="text-4xl font-bold text-primary">
                        {practiceCorrect} / {practiceOrder.length}
                      </p>
                      <p className="mt-2 font-medium">Practice complete</p>
                      <Button className="mt-5" onClick={restartPractice}>
                        <RotateCcw className="mr-2 size-4" /> Practice again
                      </Button>
                    </div>
                  ) : currentPractice ? (
                    <div className="mx-auto max-w-2xl space-y-5">
                      <div>
                        <p className="text-xs font-bold uppercase text-muted-foreground">
                          {practiceIndex + 1} of {practiceOrder.length}
                        </p>
                        <h3 className="mt-3 text-2xl font-semibold">
                          {currentPractice.term}
                        </h3>
                      </div>
                      <div>
                        <Label htmlFor="practice-answer">Answer</Label>
                        <Input
                          id="practice-answer"
                          value={practiceAnswer}
                          disabled={practiceResult !== null}
                          onChange={(event) => setPracticeAnswer(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") checkPracticeAnswer();
                          }}
                          autoComplete="off"
                        />
                      </div>
                      {practiceResult && (
                        <div
                          className={cn(
                            "rounded-md border p-4",
                            practiceResult === "correct"
                              ? "border-emerald-500 bg-emerald-500/10"
                              : "border-amber-500 bg-amber-500/10",
                          )}
                        >
                          <p className="flex items-center gap-2 font-semibold">
                            {practiceResult === "correct" ? (
                              <Check className="size-4" />
                            ) : (
                              <X className="size-4" />
                            )}
                            {practiceResult === "correct" ? "Correct" : "Review"}
                          </p>
                          {practiceResult === "incorrect" && (
                            <p className="mt-1 text-sm">
                              {currentPractice.answer}
                            </p>
                          )}
                        </div>
                      )}
                      <div className="flex justify-end">
                        {practiceResult ? (
                          <Button onClick={nextPracticeCard}>
                            Next <ArrowRight className="ml-2 size-4" />
                          </Button>
                        ) : (
                          <Button
                            onClick={checkPracticeAnswer}
                            disabled={!practiceAnswer.trim()}
                          >
                            Check answer
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : null}
                </section>
              )}

              {mode === "match" && (
                <section className="space-y-4 border-y py-6">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-semibold">
                      <Clock3 className="size-4" /> {matchSeconds}s
                    </span>
                    <Button variant="outline" size="sm" onClick={restartMatch}>
                      <RotateCcw className="mr-2 size-4" /> Restart
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {matchItems.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        disabled={item.matched}
                        onClick={() => selectMatch(item)}
                        className={cn(
                          "min-h-24 rounded-md border bg-card p-3 text-sm font-medium",
                          firstMatchKey === item.key &&
                            "border-primary bg-primary/10",
                          blockedMatchKeys.includes(item.key) &&
                            "border-destructive bg-destructive/10",
                          item.matched && "invisible",
                        )}
                      >
                        {item.text}
                      </button>
                    ))}
                  </div>
                  {matchComplete && (
                    <div className="rounded-md bg-emerald-500/10 p-4 text-center">
                      <p className="font-semibold">Matched in {matchSeconds} seconds</p>
                    </div>
                  )}
                </section>
              )}
            </main>
          )}
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit study activity" : "Create study activity"}
            </DialogTitle>
            <DialogDescription>
              Add at least two term-and-answer pairs.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveSet} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="activity-title">Title</Label>
                <Input
                  id="activity-title"
                  value={formTitle}
                  onChange={(event) => setFormTitle(event.target.value)}
                  maxLength={160}
                  required
                />
              </div>
              <div>
                <Label htmlFor="activity-subject">Subject</Label>
                <Input
                  id="activity-subject"
                  value={formSubject}
                  onChange={(event) => setFormSubject(event.target.value)}
                  maxLength={100}
                />
              </div>
            </div>
            <div className="space-y-3">
              {formCards.map((card, index) => (
                <div
                  key={card.id}
                  className="grid gap-2 border-b pb-3 sm:grid-cols-[2rem_1fr_1fr_2rem]"
                >
                  <span className="pt-2 text-sm text-muted-foreground">
                    {index + 1}
                  </span>
                  <Input
                    value={card.term}
                    onChange={(event) =>
                      updateFormCard(card.id, "term", event.target.value)
                    }
                    placeholder="Term or question"
                    aria-label={`Card ${index + 1} term`}
                    maxLength={500}
                  />
                  <Input
                    value={card.answer}
                    onChange={(event) =>
                      updateFormCard(card.id, "answer", event.target.value)
                    }
                    placeholder="Answer"
                    aria-label={`Card ${index + 1} answer`}
                    maxLength={1000}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={formCards.length <= 2}
                    onClick={() =>
                      setFormCards((cards) =>
                        cards.filter((item) => item.id !== card.id),
                      )
                    }
                    aria-label={`Remove card ${index + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormCards((cards) => [...cards, emptyCard()])}
              >
                <CopyPlus className="mr-2 size-4" /> Add card
              </Button>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditorOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !formTitle.trim()}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Create activity"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
