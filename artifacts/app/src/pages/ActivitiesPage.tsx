import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  Clock3,
  CopyPlus,
  Dices,
  Layers3,
  ListChecks,
  Pencil,
  Plus,
  RotateCcw,
  Shuffle,
  Sparkles,
  SpellCheck2,
  TextCursorInput,
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

type ActivityMode =
  | "flashcards"
  | "practice"
  | "quiz"
  | "true-false"
  | "match"
  | "scramble"
  | "missing-word"
  | "random";

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

function quizChoices(card: ActivityCard, cards: ActivityCard[]) {
  return shuffled([
    card.answer,
    ...shuffled(
      cards
        .filter((candidate) => candidate.id !== card.id)
        .map((candidate) => candidate.answer),
    ).slice(0, 3),
  ]);
}

function scrambleAnswer(value: string) {
  const characters = value.split("");
  let scrambled = shuffled(characters).join("");
  if (scrambled === value && characters.length > 1) {
    scrambled = characters.slice(1).join("") + characters[0];
  }
  return scrambled;
}

function missingWordPrompt(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 2) return { prompt: "____", answer: value };
  const answer = [...words].sort((a, b) => b.length - a.length)[0];
  const index = words.indexOf(answer);
  return {
    prompt: words.map((word, wordIndex) => (wordIndex === index ? "____" : word)).join(" "),
    answer,
  };
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

  const [quizOrder, setQuizOrder] = useState<ActivityCard[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizOptions, setQuizOptions] = useState<string[]>([]);
  const [quizSelection, setQuizSelection] = useState<string | null>(null);
  const [quizCorrect, setQuizCorrect] = useState(0);

  const [trueFalseOrder, setTrueFalseOrder] = useState<ActivityCard[]>([]);
  const [trueFalseIndex, setTrueFalseIndex] = useState(0);
  const [trueFalseSelection, setTrueFalseSelection] = useState<boolean | null>(
    null,
  );
  const [trueFalseCorrect, setTrueFalseCorrect] = useState(0);

  const [scrambleOrder, setScrambleOrder] = useState<ActivityCard[]>([]);
  const [scrambleIndex, setScrambleIndex] = useState(0);
  const [scrambleValue, setScrambleValue] = useState("");
  const [scrambleInput, setScrambleInput] = useState("");
  const [scrambleResult, setScrambleResult] = useState<boolean | null>(null);
  const [scrambleCorrect, setScrambleCorrect] = useState(0);

  const [missingOrder, setMissingOrder] = useState<ActivityCard[]>([]);
  const [missingIndex, setMissingIndex] = useState(0);
  const [missingInput, setMissingInput] = useState("");
  const [missingResult, setMissingResult] = useState<boolean | null>(null);
  const [missingCorrect, setMissingCorrect] = useState(0);

  const [randomCard, setRandomCard] = useState<ActivityCard | null>(null);
  const [randomAnswerVisible, setRandomAnswerVisible] = useState(false);
  const [randomPicking, setRandomPicking] = useState(false);

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
    const nextQuizOrder = shuffled(cards);
    setQuizOrder(nextQuizOrder);
    setQuizIndex(0);
    setQuizOptions(
      nextQuizOrder[0] ? quizChoices(nextQuizOrder[0], cards) : [],
    );
    setQuizSelection(null);
    setQuizCorrect(0);
    setTrueFalseOrder(shuffled(cards));
    setTrueFalseIndex(0);
    setTrueFalseSelection(null);
    setTrueFalseCorrect(0);
    const nextScrambleOrder = shuffled(cards);
    setScrambleOrder(nextScrambleOrder);
    setScrambleIndex(0);
    setScrambleValue(
      nextScrambleOrder[0] ? scrambleAnswer(nextScrambleOrder[0].answer) : "",
    );
    setScrambleInput("");
    setScrambleResult(null);
    setScrambleCorrect(0);
    setMissingOrder(shuffled(cards));
    setMissingIndex(0);
    setMissingInput("");
    setMissingResult(null);
    setMissingCorrect(0);
    setRandomCard(null);
    setRandomAnswerVisible(false);
    setRandomPicking(false);
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

  function chooseQuizAnswer(answer: string) {
    if (quizSelection !== null) return;
    setQuizSelection(answer);
    if (answer === quizOrder[quizIndex]?.answer) {
      setQuizCorrect((score) => score + 1);
    }
  }

  function nextQuizQuestion() {
    const nextIndex = quizIndex + 1;
    setQuizIndex(nextIndex);
    setQuizSelection(null);
    setQuizOptions(
      quizOrder[nextIndex]
        ? quizChoices(quizOrder[nextIndex], selected?.cards ?? [])
        : [],
    );
  }

  function restartQuiz() {
    const order = shuffled(selected?.cards ?? []);
    setQuizOrder(order);
    setQuizIndex(0);
    setQuizOptions(order[0] ? quizChoices(order[0], order) : []);
    setQuizSelection(null);
    setQuizCorrect(0);
  }

  function answerTrueFalse(answer: boolean) {
    if (trueFalseSelection !== null) return;
    setTrueFalseSelection(answer);
    const isTrue = trueFalseIndex % 2 === 0 || trueFalseOrder.length < 2;
    if (answer === isTrue) setTrueFalseCorrect((score) => score + 1);
  }

  function nextTrueFalse() {
    setTrueFalseIndex((index) => index + 1);
    setTrueFalseSelection(null);
  }

  function restartTrueFalse() {
    setTrueFalseOrder(shuffled(selected?.cards ?? []));
    setTrueFalseIndex(0);
    setTrueFalseSelection(null);
    setTrueFalseCorrect(0);
  }

  function checkScramble() {
    const card = scrambleOrder[scrambleIndex];
    if (!card || scrambleResult !== null) return;
    const correct =
      scrambleInput.trim().toLocaleLowerCase() ===
      card.answer.trim().toLocaleLowerCase();
    setScrambleResult(correct);
    if (correct) setScrambleCorrect((score) => score + 1);
  }

  function nextScramble() {
    const nextIndex = scrambleIndex + 1;
    setScrambleIndex(nextIndex);
    setScrambleInput("");
    setScrambleResult(null);
    setScrambleValue(
      scrambleOrder[nextIndex]
        ? scrambleAnswer(scrambleOrder[nextIndex].answer)
        : "",
    );
  }

  function restartScramble() {
    const order = shuffled(selected?.cards ?? []);
    setScrambleOrder(order);
    setScrambleIndex(0);
    setScrambleValue(order[0] ? scrambleAnswer(order[0].answer) : "");
    setScrambleInput("");
    setScrambleResult(null);
    setScrambleCorrect(0);
  }

  function checkMissingWord() {
    const card = missingOrder[missingIndex];
    if (!card || missingResult !== null) return;
    const expected = missingWordPrompt(card.answer).answer;
    const correct =
      missingInput.trim().toLocaleLowerCase() ===
      expected.trim().toLocaleLowerCase();
    setMissingResult(correct);
    if (correct) setMissingCorrect((score) => score + 1);
  }

  function nextMissingWord() {
    setMissingIndex((index) => index + 1);
    setMissingInput("");
    setMissingResult(null);
  }

  function restartMissingWord() {
    setMissingOrder(shuffled(selected?.cards ?? []));
    setMissingIndex(0);
    setMissingInput("");
    setMissingResult(null);
    setMissingCorrect(0);
  }

  function pickRandomCard() {
    if (!selected?.cards.length || randomPicking) return;
    setRandomPicking(true);
    setRandomAnswerVisible(false);
    window.setTimeout(() => {
      const choices = selected.cards.filter(
        (card) => card.id !== randomCard?.id,
      );
      const pool = choices.length ? choices : selected.cards;
      setRandomCard(pool[Math.floor(Math.random() * pool.length)]);
      setRandomPicking(false);
    }, 500);
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
  const currentQuiz = quizOrder[quizIndex];
  const quizComplete = quizOrder.length > 0 && quizIndex >= quizOrder.length;
  const currentTrueFalse = trueFalseOrder[trueFalseIndex];
  const trueFalseComplete =
    trueFalseOrder.length > 0 && trueFalseIndex >= trueFalseOrder.length;
  const trueFalseIsTrue =
    trueFalseIndex % 2 === 0 || trueFalseOrder.length < 2;
  const trueFalseShownAnswer = currentTrueFalse
    ? trueFalseIsTrue
      ? currentTrueFalse.answer
      : trueFalseOrder[(trueFalseIndex + 1) % trueFalseOrder.length]?.answer
    : "";
  const currentScramble = scrambleOrder[scrambleIndex];
  const scrambleComplete =
    scrambleOrder.length > 0 && scrambleIndex >= scrambleOrder.length;
  const currentMissing = missingOrder[missingIndex];
  const missingComplete =
    missingOrder.length > 0 && missingIndex >= missingOrder.length;
  const currentMissingPrompt = currentMissing
    ? missingWordPrompt(currentMissing.answer)
    : null;
  const practiceComplete =
    practiceOrder.length > 0 && practiceIndex >= practiceOrder.length;
  const modeOptions = useMemo(
    () =>
      [
        ["flashcards", Layers3, "Flashcards"],
        ["practice", Sparkles, "Practice"],
        ["quiz", ListChecks, "Quiz"],
        ["true-false", CircleHelp, "True / false"],
        ["match", Clock3, "Match"],
        ["scramble", SpellCheck2, "Scramble"],
        ["missing-word", TextCursorInput, "Missing word"],
        ["random", Dices, "Random picker"],
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
          <aside className="flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0">
            {activities.map((activity) => (
              <Card
                key={activity.id}
                className={cn(
                  "min-w-56 cursor-pointer lg:min-w-0",
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

              <div className="grid w-full grid-cols-2 gap-1 rounded-md border bg-card p-1 sm:flex sm:w-auto sm:flex-wrap">
                {modeOptions.map(([value, Icon, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-medium",
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

              {mode === "quiz" && (
                <section className="border-y py-6">
                  {quizComplete ? (
                    <div className="py-10 text-center">
                      <p className="text-4xl font-bold text-primary">
                        {quizCorrect} / {quizOrder.length}
                      </p>
                      <p className="mt-2 font-medium">Quiz complete</p>
                      <Button className="mt-5" onClick={restartQuiz}>
                        <RotateCcw className="mr-2 size-4" /> Try again
                      </Button>
                    </div>
                  ) : currentQuiz ? (
                    <div className="mx-auto max-w-2xl space-y-5">
                      <div>
                        <p className="text-xs font-bold uppercase text-muted-foreground">
                          {quizIndex + 1} of {quizOrder.length}
                        </p>
                        <h3 className="mt-3 text-2xl font-semibold">
                          {currentQuiz.term}
                        </h3>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {quizOptions.map((answer) => {
                          const selectedAnswer = quizSelection === answer;
                          const correctAnswer = answer === currentQuiz.answer;
                          return (
                            <button
                              key={answer}
                              type="button"
                              disabled={quizSelection !== null}
                              onClick={() => chooseQuizAnswer(answer)}
                              className={cn(
                                "min-h-16 rounded-md border bg-card p-3 text-left text-sm font-medium",
                                quizSelection !== null &&
                                  correctAnswer &&
                                  "border-emerald-500 bg-emerald-500/10",
                                selectedAnswer &&
                                  !correctAnswer &&
                                  "border-destructive bg-destructive/10",
                              )}
                            >
                              {answer}
                            </button>
                          );
                        })}
                      </div>
                      {quizSelection !== null && (
                        <div className="flex justify-end">
                          <Button onClick={nextQuizQuestion}>
                            Next <ArrowRight className="ml-2 size-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </section>
              )}

              {mode === "true-false" && (
                <section className="border-y py-6">
                  {trueFalseComplete ? (
                    <div className="py-10 text-center">
                      <p className="text-4xl font-bold text-primary">
                        {trueFalseCorrect} / {trueFalseOrder.length}
                      </p>
                      <p className="mt-2 font-medium">Round complete</p>
                      <Button className="mt-5" onClick={restartTrueFalse}>
                        <RotateCcw className="mr-2 size-4" /> Try again
                      </Button>
                    </div>
                  ) : currentTrueFalse ? (
                    <div className="mx-auto max-w-2xl space-y-5 text-center">
                      <p className="text-xs font-bold uppercase text-muted-foreground">
                        {trueFalseIndex + 1} of {trueFalseOrder.length}
                      </p>
                      <h3 className="text-xl font-semibold">
                        {currentTrueFalse.term}
                      </h3>
                      <p className="rounded-md border bg-card p-5 text-lg">
                        {trueFalseShownAnswer}
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {[true, false].map((answer) => {
                          const isCorrect = answer === trueFalseIsTrue;
                          const selectedAnswer = answer === trueFalseSelection;
                          return (
                            <Button
                              key={String(answer)}
                              variant="outline"
                              className={cn(
                                "h-14",
                                trueFalseSelection !== null &&
                                  isCorrect &&
                                  "border-emerald-500 bg-emerald-500/10",
                                selectedAnswer &&
                                  !isCorrect &&
                                  "border-destructive bg-destructive/10",
                              )}
                              disabled={trueFalseSelection !== null}
                              onClick={() => answerTrueFalse(answer)}
                            >
                              {answer ? "True" : "False"}
                            </Button>
                          );
                        })}
                      </div>
                      {trueFalseSelection !== null && (
                        <Button onClick={nextTrueFalse}>
                          Next <ArrowRight className="ml-2 size-4" />
                        </Button>
                      )}
                    </div>
                  ) : null}
                </section>
              )}

              {mode === "scramble" && (
                <section className="border-y py-6">
                  {scrambleComplete ? (
                    <div className="py-10 text-center">
                      <p className="text-4xl font-bold text-primary">
                        {scrambleCorrect} / {scrambleOrder.length}
                      </p>
                      <p className="mt-2 font-medium">Scramble complete</p>
                      <Button className="mt-5" onClick={restartScramble}>
                        <RotateCcw className="mr-2 size-4" /> Try again
                      </Button>
                    </div>
                  ) : currentScramble ? (
                    <div className="mx-auto max-w-2xl space-y-5">
                      <p className="text-xs font-bold uppercase text-muted-foreground">
                        {scrambleIndex + 1} of {scrambleOrder.length}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {currentScramble.term}
                      </p>
                      <p className="break-all rounded-md border bg-card p-5 text-center text-2xl font-semibold tracking-widest">
                        {scrambleValue}
                      </p>
                      <Input
                        value={scrambleInput}
                        disabled={scrambleResult !== null}
                        onChange={(event) => setScrambleInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") checkScramble();
                        }}
                        aria-label="Unscrambled answer"
                        autoComplete="off"
                      />
                      {scrambleResult !== null && (
                        <p
                          className={cn(
                            "rounded-md border p-3 text-sm font-medium",
                            scrambleResult
                              ? "border-emerald-500 bg-emerald-500/10"
                              : "border-amber-500 bg-amber-500/10",
                          )}
                        >
                          {scrambleResult
                            ? "Correct"
                            : `Answer: ${currentScramble.answer}`}
                        </p>
                      )}
                      <div className="flex justify-end">
                        {scrambleResult !== null ? (
                          <Button onClick={nextScramble}>
                            Next <ArrowRight className="ml-2 size-4" />
                          </Button>
                        ) : (
                          <Button
                            onClick={checkScramble}
                            disabled={!scrambleInput.trim()}
                          >
                            Check answer
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : null}
                </section>
              )}

              {mode === "missing-word" && (
                <section className="border-y py-6">
                  {missingComplete ? (
                    <div className="py-10 text-center">
                      <p className="text-4xl font-bold text-primary">
                        {missingCorrect} / {missingOrder.length}
                      </p>
                      <p className="mt-2 font-medium">Activity complete</p>
                      <Button className="mt-5" onClick={restartMissingWord}>
                        <RotateCcw className="mr-2 size-4" /> Try again
                      </Button>
                    </div>
                  ) : currentMissing && currentMissingPrompt ? (
                    <div className="mx-auto max-w-2xl space-y-5">
                      <p className="text-xs font-bold uppercase text-muted-foreground">
                        {missingIndex + 1} of {missingOrder.length}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {currentMissing.term}
                      </p>
                      <p className="rounded-md border bg-card p-5 text-center text-xl font-semibold">
                        {currentMissingPrompt.prompt}
                      </p>
                      <Input
                        value={missingInput}
                        disabled={missingResult !== null}
                        onChange={(event) => setMissingInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") checkMissingWord();
                        }}
                        aria-label="Missing word"
                        autoComplete="off"
                      />
                      {missingResult !== null && (
                        <p
                          className={cn(
                            "rounded-md border p-3 text-sm font-medium",
                            missingResult
                              ? "border-emerald-500 bg-emerald-500/10"
                              : "border-amber-500 bg-amber-500/10",
                          )}
                        >
                          {missingResult
                            ? "Correct"
                            : `Missing word: ${currentMissingPrompt.answer}`}
                        </p>
                      )}
                      <div className="flex justify-end">
                        {missingResult !== null ? (
                          <Button onClick={nextMissingWord}>
                            Next <ArrowRight className="ml-2 size-4" />
                          </Button>
                        ) : (
                          <Button
                            onClick={checkMissingWord}
                            disabled={!missingInput.trim()}
                          >
                            Check word
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : null}
                </section>
              )}

              {mode === "random" && (
                <section className="space-y-5 border-y py-8 text-center">
                  <Button
                    size="lg"
                    onClick={pickRandomCard}
                    disabled={randomPicking}
                  >
                    <Dices
                      className={cn(
                        "mr-2 size-5",
                        randomPicking && "animate-spin",
                      )}
                    />
                    {randomPicking ? "Picking…" : "Pick a card"}
                  </Button>
                  {randomCard && !randomPicking && (
                    <div className="mx-auto max-w-2xl rounded-md border bg-card p-8">
                      <p className="text-2xl font-semibold">{randomCard.term}</p>
                      {randomAnswerVisible ? (
                        <p className="mt-5 border-t pt-5 text-lg text-muted-foreground">
                          {randomCard.answer}
                        </p>
                      ) : (
                        <Button
                          className="mt-5"
                          variant="outline"
                          onClick={() => setRandomAnswerVisible(true)}
                        >
                          Reveal answer
                        </Button>
                      )}
                    </div>
                  )}
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
                  className="grid grid-cols-[1.5rem_minmax(0,1fr)_2rem] gap-2 border-b pb-3 sm:grid-cols-[2rem_1fr_1fr_2rem]"
                >
                  <span className="row-span-2 pt-2 text-sm text-muted-foreground sm:row-span-1">
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
                    className="col-start-2 sm:col-start-auto"
                    aria-label={`Card ${index + 1} answer`}
                    maxLength={1000}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="row-span-2 sm:row-span-1"
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
