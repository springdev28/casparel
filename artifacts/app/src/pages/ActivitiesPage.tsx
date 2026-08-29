/**
 * @fileOverview Web screen role: renders the Activities Page route and coordinates its page-level data and interactions.
 * System connection: mounted from App.tsx; composes generated API hooks, local helpers, and reusable UI components.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  Clock3,
  CopyPlus,
  Dices,
  Layers3,
  LibraryBig,
  ListChecks,
  ImagePlus,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Share2,
  Shuffle,
  Sparkles,
  SpellCheck2,
  TextCursorInput,
  Trash2,
  X,
  FileUp,
  BookCheck,
  Copy,
} from "lucide-react";
import { useParams, useSearch } from "wouter";
import { getListClassesQueryKey, useListClasses } from "@workspace/api-client-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/edu-ds/components/ui/select";
import { Skeleton } from "@workspace/edu-ds/components/ui/skeleton";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import { cn } from "@workspace/edu-ds/lib/utils";
import { counted } from "@/lib/counted";

type ActivityCard = {
  id: string;
  term: string;
  answer: string;
  choices?: string[];
  correctChoiceIndex?: number;
  imageData?: string | null;
  imageAlt?: string | null;
};

/**
 * This page's own picture of a study set.
 *
 * Hand-written because the page talks to the API through `fetch` rather than
 * the generated hooks, which means it is a second description of a shape the
 * contract already defines and will drift from it: `version` is here because
 * the row grew one and nothing said so.
 */
type StudyActivity = {
  id: number;
  classId: number | null;
  title: string;
  subject: string | null;
  mode: ActivityMode;
  cards: ActivityCard[];
  /** Which edit the row is on. Sent back on save so a stale one is refused. */
  version: number;
  createdAt: string;
  updatedAt: string;
};

type WorkflowSource = {
  id: number;
  title: string;
  subject: string;
};

type ActivityMode =
  | "all"
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
const MAX_ACTIVITY_IMAGES = 6;
const MAX_CARD_IMAGE_BYTES = 135 * 1024;
const MIN_QUIZ_CHOICES = 2;
const DEFAULT_QUIZ_CHOICES = 4;
const MAX_QUIZ_CHOICES = 6;

function dataUrlBytes(value: string) {
  const encoded = value.split(",", 2)[1] ?? "";
  return Math.ceil(encoded.length * 0.75);
}

async function compressCardImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("The source image must be smaller than 8 MB.");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(1, 960 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not process the image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.58, 0.46]) {
      const result = canvas.toDataURL("image/webp", quality);
      if (dataUrlBytes(result) <= MAX_CARD_IMAGE_BYTES) return result;
    }
    throw new Error("This image is too detailed. Try a smaller crop.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function ActivityImage({ card, className = "" }: { card: ActivityCard; className?: string }) {
  if (!card.imageData) return null;
  return (
    <img
      src={card.imageData}
      alt={card.imageAlt || card.term}
      loading="lazy"
      decoding="async"
      className={cn("max-w-full rounded-md object-contain", className)}
    />
  );
}

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function shuffledWithDifferentFirst<T extends { id: string }>(items: T[], currentId?: string) {
  const result = shuffled(items);
  if (result.length > 1 && result[0]?.id === currentId) {
    [result[0], result[1]] = [result[1], result[0]];
  }
  return result;
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
    /*
     * A conflict carries the set as it now stands, and the editor needs it:
     * the difference between "could not save" and "somebody else saved first,
     * here is what they wrote" is the difference between a dead end and a
     * decision. Attached to the error rather than thrown separately, so every
     * existing caller keeps working.
     */
    const failure = Object.assign(
      new Error(payload.error ?? "The activity request failed"),
      { status: response.status, current: (payload as { current?: unknown }).current },
    );
    throw failure;
  }
  return payload;
}

function quizChoices(card: ActivityCard, cards: ActivityCard[]) {
  if (card.choices && card.choices.length >= 2) return card.choices;
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

function emptyCard(mode: ActivityMode = "flashcards"): ActivityCard {
  return mode === "quiz"
    ? {
        id: crypto.randomUUID(),
        term: "",
        answer: "",
        choices: Array.from({ length: DEFAULT_QUIZ_CHOICES }, () => ""),
        correctChoiceIndex: 0,
      }
    : { id: crypto.randomUUID(), term: "", answer: "" };
}

function quizEditorCard(card: ActivityCard): ActivityCard {
  if (card.choices && card.choices.length >= 2) {
    const choices = card.choices.slice(0, MAX_QUIZ_CHOICES);
    const savedCorrectChoiceIndex = Number.isInteger(card.correctChoiceIndex)
      ? card.correctChoiceIndex!
      : choices.indexOf(card.answer);
    const correctChoiceIndex = savedCorrectChoiceIndex >= 0 && savedCorrectChoiceIndex < choices.length
      ? savedCorrectChoiceIndex
      : 0;
    return {
      ...card,
      choices,
      correctChoiceIndex,
      answer: choices[correctChoiceIndex] ?? "",
    };
  }
  return {
    ...card,
    choices: [
      card.answer,
      ...Array.from({ length: DEFAULT_QUIZ_CHOICES - 1 }, () => ""),
    ],
    correctChoiceIndex: 0,
  };
}

export default function ActivitiesPage({
  embedded = false,
  classIdOverride,
  readOnly = false,
  shared = false,
}: {
  embedded?: boolean;
  classIdOverride?: number;
  readOnly?: boolean;
  shared?: boolean;
} = {}) {
  const params = useParams<{ token?: string }>();
  const routeSearch = useSearch();
  const { data: joinedClasses } = useListClasses({
    query: { enabled: !shared, queryKey: getListClassesQueryKey() },
  });
  const viewOnly = readOnly || shared;
  const [copying, setCopying] = useState(false);

  /**
   * Take your own copy of an activity you are only viewing.
   *
   * The server does the work and owns the rules: it re-checks that you may see
   * the source, and drops the class and share link so the copy is private to
   * you. Here we only need to refresh the list and say where it went.
   */
  async function copyToMyAccount(activity: StudyActivity) {
    setCopying(true);
    try {
      const copy = (await activityRequest(`/study-activities/${activity.id}/copy`, {
        method: "POST",
      })) as StudyActivity | null;
      await loadActivities();
      toast({
        title: "Saved to your activities",
        description: `"${copy?.title ?? activity.title}" is yours now. Editing it will not change the original.`,
      });
    } catch (error: unknown) {
      toast({
        title: "Could not save a copy",
        description:
          error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setCopying(false);
    }
  }
  const importRef = useRef<HTMLInputElement>(null);
  const handledWorkflowSource = useRef<number | null>(null);
  const [activities, setActivities] = useState<StudyActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<ActivityMode>("flashcards");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  /** The version the open edit was made from, sent back so a save can be refused. */
  const [editingVersion, setEditingVersion] = useState(1);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareClassId, setShareClassId] = useState("");
  const [processingImageId, setProcessingImageId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formMode, setFormMode] = useState<ActivityMode>("flashcards");
  const [formCards, setFormCards] = useState<ActivityCard[]>([
    emptyCard(),
    emptyCard(),
  ]);
  const [formSourceResourceId, setFormSourceResourceId] = useState<number | null>(null);
  const [workflowSource, setWorkflowSource] = useState<WorkflowSource | null>(null);
  const [workflowActivityId, setWorkflowActivityId] = useState<number | null>(null);
  const [workflowShared, setWorkflowShared] = useState(false);

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
      const result = shared
        ? [await activityRequest(`/study-activities/shared/${params.token}`) as unknown as StudyActivity]
        : (await activityRequest(
            `/study-activities${classIdOverride ? `?classId=${classIdOverride}` : ""}`,
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
  }, [classIdOverride, params.token, shared]);

  useEffect(() => {
    if (shared || classIdOverride) return;
    const search = new URLSearchParams(routeSearch);
    const createFromResource = search.get("fromResource");
    const resourceId = Number(createFromResource ?? search.get("continueResource"));
    const existingActivityId = Number(search.get("activity"));
    if (!Number.isInteger(resourceId) || resourceId <= 0) return;
    if (handledWorkflowSource.current === resourceId) return;
    handledWorkflowSource.current = resourceId;
    void activityRequest(`/resources/${resourceId}`)
      .then((value) => {
        const resource = value as WorkflowSource;
        setWorkflowSource(resource);
        setWorkflowActivityId(
          Number.isInteger(existingActivityId) && existingActivityId > 0
            ? existingActivityId
            : null,
        );
        setWorkflowShared(false);
        if (!createFromResource) {
          if (Number.isInteger(existingActivityId) && existingActivityId > 0) {
            setSelectedId(existingActivityId);
          }
          return;
        }
        setEditingId(null);
        setFormSourceResourceId(resource.id);
        setFormTitle(`${resource.title} study activity`);
        setFormSubject(resource.subject ?? "");
        setFormMode("flashcards");
        setFormCards([emptyCard(), emptyCard()]);
        setEditorOpen(true);
      })
      .catch((error) => {
        toast({
          title: "Could not continue the resource workflow",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
      });
  }, [classIdOverride, routeSearch, shared]);

  function resetStudy(activity: StudyActivity | undefined) {
    const cards = activity?.cards ?? [];
    setMode(activity?.mode === "all" ? "flashcards" : activity?.mode ?? "flashcards");
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
      nextScrambleOrder[0] ? scrambleAnswer(nextScrambleOrder[0].term) : "",
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

  function openNewSet(nextMode: ActivityMode = "flashcards") {
    setEditingId(null);
    setFormTitle("");
    setFormSubject("");
    setFormMode(nextMode);
    setFormCards([emptyCard(nextMode), emptyCard(nextMode)]);
    setFormSourceResourceId(null);
    setEditorOpen(true);
  }

  function openEditSet(activity: StudyActivity) {
    setEditingId(activity.id);
    // The version this edit is being made from, sent back with the save.
    setEditingVersion(activity.version ?? 1);
    setFormTitle(activity.title);
    setFormSubject(activity.subject ?? "");
    setFormMode(activity.mode ?? "flashcards");
    setFormCards(activity.cards.map((card) =>
      activity.mode === "quiz" ? quizEditorCard(card) : { ...card },
    ));
    setFormSourceResourceId(null);
    setEditorOpen(true);
  }

  function changeFormMode(nextMode: ActivityMode) {
    setFormMode(nextMode);
    setFormCards((cards) =>
      nextMode === "quiz"
        ? cards.map(quizEditorCard)
        : cards.map(({ choices: _choices, correctChoiceIndex: _correct, ...card }) => card),
    );
  }

  function updateQuizChoice(cardId: string, choiceIndex: number, value: string) {
    setFormCards((cards) => cards.map((card) => {
      if (card.id !== cardId) return card;
      const choices = [...(card.choices ?? Array.from({ length: DEFAULT_QUIZ_CHOICES }, () => ""))];
      choices[choiceIndex] = value;
      return {
        ...card,
        choices,
        answer: card.correctChoiceIndex === choiceIndex ? value : card.answer,
      };
    }));
  }

  function setQuizChoiceCount(cardId: string, requestedCount: number) {
    const nextCount = Math.min(
      MAX_QUIZ_CHOICES,
      Math.max(MIN_QUIZ_CHOICES, requestedCount),
    );
    setFormCards((cards) => cards.map((card) => {
      if (card.id !== cardId) return card;
      const choices = [...(card.choices ?? [])];
      while (choices.length < nextCount) choices.push("");
      choices.length = nextCount;
      const savedCorrectChoiceIndex = Number.isInteger(card.correctChoiceIndex)
        ? card.correctChoiceIndex!
        : choices.indexOf(card.answer);
      const correctChoiceIndex = savedCorrectChoiceIndex >= 0 && savedCorrectChoiceIndex < nextCount
        ? savedCorrectChoiceIndex
        : 0;
      return {
        ...card,
        choices,
        correctChoiceIndex,
        answer: choices[correctChoiceIndex] ?? "",
      };
    }));
  }

  function selectQuizCorrectChoice(cardId: string, choiceIndex: number) {
    setFormCards((cards) => cards.map((card) => card.id === cardId
      ? {
          ...card,
          correctChoiceIndex: choiceIndex,
          answer: card.choices?.[choiceIndex] ?? "",
        }
      : card));
  }

  function updateFormCard(
    id: string,
    field: "term" | "answer" | "imageAlt",
    value: string,
  ) {
    setFormCards((cards) =>
      cards.map((card) => (card.id === id ? { ...card, [field]: value } : card)),
    );
  }

  async function attachImage(cardId: string, file?: File) {
    if (!file) return;
    const imageCount = formCards.filter((card) => card.imageData && card.id !== cardId).length;
    if (imageCount >= MAX_ACTIVITY_IMAGES) {
      toast({ title: "Image limit reached", description: "Each activity can contain up to six images.", variant: "destructive" });
      return;
    }
    setProcessingImageId(cardId);
    try {
      const imageData = await compressCardImage(file);
      setFormCards((cards) =>
        cards.map((card) =>
          card.id === cardId
            ? { ...card, imageData, imageAlt: card.imageAlt || card.term.slice(0, 160) }
            : card,
        ),
      );
    } catch (error) {
      toast({
        title: "Could not attach image",
        description: error instanceof Error ? error.message : "Please try another image.",
        variant: "destructive",
      });
    } finally {
      setProcessingImageId(null);
    }
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
    if (formMode === "quiz") {
      const invalidQuestion = completeCards.find((card) => {
        const choices = card.choices ?? [];
        const normalizedChoices = choices.map((choice) => choice.trim().toLocaleLowerCase());
        return choices.length < MIN_QUIZ_CHOICES ||
          choices.length > MAX_QUIZ_CHOICES ||
          normalizedChoices.some((choice) => !choice) ||
          new Set(normalizedChoices).size !== normalizedChoices.length ||
          !Number.isInteger(card.correctChoiceIndex) ||
          card.correctChoiceIndex! < 0 ||
          card.correctChoiceIndex! >= choices.length;
      });
      if (invalidQuestion) {
        toast({
          title: "Check the quiz choices",
          description: "Each question needs 2-6 filled, unique choices and one correct answer.",
          variant: "destructive",
        });
        return;
      }
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
            mode: formMode,
            cards: completeCards,
            classId: classIdOverride ?? null,
            sourceResourceId: formSourceResourceId,
            ...(editingId ? { expectedVersion: editingVersion } : {}),
          }),
        },
      )) as unknown as StudyActivity;
      await loadActivities();
      setSelectedId(activity.id);
      if (!editingId && formSourceResourceId) {
        setWorkflowActivityId(activity.id);
      }
      setEditorOpen(false);
      toast({ title: editingId ? "Activity updated" : "Activity created" });
    } catch (error) {
      /*
       * Somebody saved first. The editor stays open with this person's own
       * words in it -- replacing them with the other version would lose the
       * work they came here to do, which is the failure this whole mechanism
       * exists to prevent. What moves is the version, so pressing Save again
       * is a deliberate decision to write over what is there now.
       */
      const conflict = error as { status?: number; current?: StudyActivity };
      if (conflict?.status === 409 && conflict.current) {
        setEditingVersion(conflict.current.version ?? 1);
        await loadActivities();
        toast({
          title: "This set changed while you were editing",
          description:
            "Somebody else saved first, so nothing was written. Your edits are still here — save again to replace theirs.",
          variant: "destructive",
        });
        return;
      }
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

  async function shareActivity(destination: "class" | "catalog" | "forum") {
    if (!selected) return;
    if (destination === "class" && !shareClassId) {
      toast({ title: "Choose a class", variant: "destructive" });
      return;
    }
    setSharing(true);
    try {
      if (destination === "class") {
        await activityRequest("/study-activities", {
          method: "POST",
          body: JSON.stringify({
            title: selected.title,
            subject: selected.subject,
            mode: selected.mode,
            cards: selected.cards,
            classId: Number(shareClassId),
            sourceActivityId: selected.id,
          }),
        });
      } else {
        await activityRequest(`/study-activities/${selected.id}/publish`, {
          method: "POST",
          body: JSON.stringify({ destination }),
        });
      }
      setShareOpen(false);
      if (destination === "class" && selected.id === workflowActivityId) {
        setWorkflowShared(true);
      }
      toast({
        title: destination === "class"
          ? "Shared with class"
          : destination === "forum"
            ? "Posted to forum and catalog"
            : "Added to catalog",
      });
    } catch (error) {
      toast({
        title: "Could not share activity",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSharing(false);
    }
  }

  async function duplicateSet(activity: StudyActivity) {
    try {
      const copy = (await activityRequest("/study-activities", { method: "POST", body: JSON.stringify({ title: `${activity.title} (copy)`, subject: activity.subject ?? "", mode: activity.mode, cards: activity.cards.map((card) => ({ ...card, id: crypto.randomUUID() })), classId: classIdOverride ?? null, remixedFromActivityId: activity.id }) })) as unknown as StudyActivity;
      await loadActivities();
      setSelectedId(copy.id);
      toast({ title: "Activity duplicated", description: "The copy is ready to edit or assign." });
    } catch (error) { toast({ title: "Could not duplicate activity", description: error instanceof Error ? error.message : "Please try again", variant: "destructive" }); }
  }

  async function importSet(file?: File) {
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const delimiter = lines.some((line) => line.includes("\t")) ? "\t" : ",";
      const rows = lines.map((line) => line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, "")));
      const first = rows[0]?.map((cell) => cell.toLowerCase()) ?? [];
      const hasHeader = first.some((cell) => ["term", "question", "front"].includes(cell)) && first.some((cell) => ["answer", "definition", "back"].includes(cell));
      const cards = rows.slice(hasHeader ? 1 : 0).filter((row) => row[0] && row[1]).slice(0, 100).map((row) => ({ id: crypto.randomUUID(), term: row[0], answer: row.slice(1).join(delimiter) }));
      if (cards.length < 2) throw new Error("The file needs at least two rows with a term and answer.");
      setEditingId(null); setFormTitle(file.name.replace(/\.(csv|tsv|txt)$/i, "")); setFormSubject(""); setFormMode("flashcards"); setFormCards(cards); setEditorOpen(true);
      toast({ title: `${cards.length} cards imported`, description: "Review them, then create the activity." });
    } catch (error) { toast({ title: "Could not import activity", description: error instanceof Error ? error.message : "Use a CSV or Quizlet tab-separated export", variant: "destructive" }); }
    finally { if (importRef.current) importRef.current.value = ""; }
  }

  function moveFlashcard(direction: -1 | 1) {
    if (!cardOrder.length) return;
    setCardIndex(
      (current) => (current + direction + cardOrder.length) % cardOrder.length,
    );
    setFlipped(false);
  }

  function shuffleFlashcards() {
    setCardOrder((cards) => shuffledWithDifferentFirst(cards, cards[cardIndex]?.id));
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
    const expected = trueFalseOrder[trueFalseIndex]?.answer.trim().toLocaleLowerCase("tr");
    const isTrue = ["true", "doğru", "dogru", "yes", "evet"].includes(expected ?? "");
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
      card.term.trim().toLocaleLowerCase();
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
        ? scrambleAnswer(scrambleOrder[nextIndex].term)
        : "",
    );
  }

  function restartScramble() {
    const order = shuffled(selected?.cards ?? []);
    setScrambleOrder(order);
    setScrambleIndex(0);
    setScrambleValue(order[0] ? scrambleAnswer(order[0].term) : "");
    setScrambleInput("");
    setScrambleResult(null);
    setScrambleCorrect(0);
  }

  function checkMissingWord() {
    const card = missingOrder[missingIndex];
    if (!card || missingResult !== null) return;
    const expected = card.answer;
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
  const trueFalseExpected = currentTrueFalse?.answer.trim().toLocaleLowerCase("tr") ?? "";
  const allModeTrueFalse = selected?.mode === "all";
  const trueFalseIsTrue = allModeTrueFalse
    ? trueFalseIndex % 2 === 0
    : ["true", "doğru", "dogru", "yes", "evet"].includes(trueFalseExpected);
  const falsePairAnswer = trueFalseOrder[(trueFalseIndex + 1) % Math.max(1, trueFalseOrder.length)]?.answer;
  const trueFalseShownAnswer = allModeTrueFalse
    ? (trueFalseIsTrue ? currentTrueFalse?.answer : falsePairAnswer) ?? ""
    : "";
  const currentScramble = scrambleOrder[scrambleIndex];
  const scrambleComplete =
    scrambleOrder.length > 0 && scrambleIndex >= scrambleOrder.length;
  const currentMissing = missingOrder[missingIndex];
  const missingComplete =
    missingOrder.length > 0 && missingIndex >= missingOrder.length;
  const currentMissingPrompt = currentMissing
    ? selected?.mode === "all"
      ? { prompt: `${currentMissing.term}, ____`, answer: currentMissing.answer }
      : { prompt: currentMissing.term, answer: currentMissing.answer }
    : null;
  const practiceComplete =
    practiceOrder.length > 0 && practiceIndex >= practiceOrder.length;
  const modeOptions = useMemo(
    () =>
      [
        ["all", LibraryBig, "All"],
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
    <div className={embedded ? "space-y-6" : "mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8"}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{classIdOverride ? "Class activities" : "Study activities"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {classIdOverride
              ? "Practice with activity sets shared in this class."
              : "Create, edit, and study your own term-and-answer sets."}
          </p>
        </div>
        {/*
          Wraps. These two are a fixed row inside a header that wraps, so the
          header lets the pair onto its own line and then they do not fit it
          either: "Importer un CSV / Quizlet" beside "Nouvelle activité" ran
          57px off a 375px screen in all five translations. Wrapping the pair
          as well lets the second drop under the first.
        */}
        {!viewOnly && <div className="flex flex-wrap gap-2">
          <input ref={importRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" className="hidden" onChange={(event) => void importSet(event.target.files?.[0])} />
          <Button variant="outline" onClick={() => importRef.current?.click()}><FileUp className="mr-2 size-4" /> Import CSV / Quizlet</Button>
          <Button onClick={() => openNewSet()}><Plus className="mr-2 size-4" /> New activity</Button>
        </div>}
      </header>

      {workflowSource ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                {workflowShared ? <Check className="size-5" /> : <BookCheck className="size-5" />}
              </div>
              <div className="min-w-0">
                <p className="font-semibold">
                  {workflowShared
                    ? "Resource workflow complete"
                    : workflowActivityId
                      ? "Activity ready for your class"
                      : "Creating from a verified resource"}
                </p>
                <p translate="no" className="truncate text-sm text-muted-foreground">
                  {workflowSource.title}
                </p>
              </div>
            </div>
            {workflowActivityId && !workflowShared ? (
              <Button
                onClick={() => {
                  setSelectedId(workflowActivityId);
                  setShareOpen(true);
                }}
              >
                <Share2 className="mr-2 size-4" /> Share with a class
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      ) : !activities.length ? (
        <div className="border-y py-16 text-center">
          <Layers3 className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="font-semibold">No study activities yet</p>
          {!viewOnly && <Button className="mt-4" onClick={() => openNewSet()}>
            <Plus className="mr-2 size-4" /> Create the first set
          </Button>}
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
                  <CardTitle translate="no" className="line-clamp-2 text-sm">
                    {activity.title}
                  </CardTitle>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {modeOptions.find(([value]) => value === activity.mode)?.[2] ?? "Flashcards"} ·{" "}
                      {counted(activity.cards.length, "item", "items")}
                    </span>
                    {activity.subject && (
                      <Badge translate="no" variant="secondary" className="max-w-28 truncate">
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
                  <h2 translate="no" className="text-xl font-bold">{selected.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    <span translate="no">{selected.subject ?? "General"}</span> ·{" "}
                    {counted(selected.cards.length, "card", "cards")}
                  </p>
                </div>
                {viewOnly && (
                  /* The one action that makes sense on someone else's
                     activity. Feedback: people study from a shared deck, want
                     to change a card, and either cannot or would be editing it
                     for everyone. A copy is theirs and detached. */
                  <Button
                    variant="outline"
                    onClick={() => void copyToMyAccount(selected)}
                    disabled={copying}
                    className="gap-2"
                  >
                    <Copy className="size-4" />
                    {copying ? "Copying..." : "Save a copy"}
                  </Button>
                )}
                {!viewOnly && <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={() => setShareOpen(true)} aria-label="Share activity" title="Share activity"><Share2 className="size-4" /></Button>
                  <Button variant="outline" size="icon" onClick={() => void duplicateSet(selected)} aria-label="Duplicate activity" title="Duplicate activity"><CopyPlus className="size-4" /></Button>
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
                </div>}
              </div>

              {selected.mode === "all" ? (
                <div className="flex max-w-full gap-1 overflow-x-auto border-b pb-2">
                  {modeOptions.filter(([value]) => value !== "all").map(([value, Icon, label]) => (
                    <Button key={value} size="sm" variant={mode === value ? "default" : "ghost"} onClick={() => setMode(value)} className="shrink-0">
                      <Icon className="mr-1.5 size-4" />{label}
                    </Button>
                  ))}
                </div>
              ) : (
                <Badge variant="secondary" className="w-fit px-3 py-1.5 text-sm">
                  {modeOptions.map(([value, Icon, label]) => value === mode ? <span key={value} className="flex items-center gap-2"><Icon className="size-4" />{label}</span> : null)}
                </Badge>
              )}

              {mode === "flashcards" && currentFlashcard && (
                <section className="space-y-4">
                  <button
                    type="button"
                    className="flex min-h-72 w-full items-center justify-center rounded-md border bg-card p-8 text-center shadow-sm"
                    onClick={() => setFlipped((value) => !value)}
                    data-testid="activity-flashcard"
                  >
                    <span className="block w-full">
                      <ActivityImage card={currentFlashcard} className="mx-auto mb-5 max-h-40" />
                      <span className="mb-4 block text-xs font-bold uppercase text-muted-foreground">
                        {flipped ? "Answer" : "Term"}
                      </span>
                      <span translate="no" className="text-2xl font-semibold">
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
                      <p className="text-4xl font-bold text-primary-text">
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
                        <ActivityImage card={currentPractice} className="mb-4 mt-3 max-h-56" />
                        <h3 translate="no" className="mt-3 text-2xl font-semibold">
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
                      <p className="text-4xl font-bold text-primary-text">
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
                        <ActivityImage card={currentQuiz} className="mb-4 mt-3 max-h-56" />
                        <h3 translate="no" className="mt-3 text-2xl font-semibold">
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
                      <p className="text-4xl font-bold text-primary-text">
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
                      <ActivityImage card={currentTrueFalse} className="mx-auto max-h-56" />
                      <h3 translate="no" className="text-xl font-semibold">
                        {currentTrueFalse.term}
                      </h3>
                      {allModeTrueFalse && <p className="rounded-md border bg-card p-5 text-lg">
                        {trueFalseShownAnswer}
                      </p>}
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
                      <p className="text-4xl font-bold text-primary-text">
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
                      <ActivityImage card={currentScramble} className="max-h-56" />
                      <p className="text-sm text-muted-foreground">
                        {currentScramble.answer}
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
                            : `Answer: ${currentScramble.term}`}
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
                      <p className="text-4xl font-bold text-primary-text">
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
                      <ActivityImage card={currentMissing} className="max-h-56" />
                      <p translate="no" className="text-sm text-muted-foreground">
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
                      <ActivityImage card={randomCard} className="mx-auto mb-5 max-h-56" />
                      <p translate="no" className="text-2xl font-semibold">{randomCard.term}</p>
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
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="activity-mode">Activity type</Label>
                <Select value={formMode} onValueChange={(value) => changeFormMode(value as ActivityMode)}>
                  <SelectTrigger id="activity-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {modeOptions.map(([value, Icon, label]) => <SelectItem key={value} value={value}><span className="flex items-center gap-2"><Icon className="size-4" />{label}</span></SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
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
                  className="grid grid-cols-[1.5rem_minmax(0,1fr)_2rem] gap-2 border-b pb-4"
                >
                  <span className="row-span-3 pt-2 text-sm text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                    <Input
                      value={card.term}
                      onChange={(event) =>
                        updateFormCard(card.id, "term", event.target.value)
                      }
                      placeholder={formMode === "true-false" ? "Statement" : formMode === "scramble" ? "Word to scramble" : formMode === "missing-word" ? "Sentence with ____" : "Term or question"}
                      aria-label={`Card ${index + 1} term`}
                      maxLength={500}
                    />
                    {formMode === "quiz" ? (
                      <div className="space-y-2 sm:col-span-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium">Choices</span>
                          <div className="flex h-9 items-center rounded-md border bg-background">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8 rounded-r-none"
                              disabled={(card.choices?.length ?? DEFAULT_QUIZ_CHOICES) <= MIN_QUIZ_CHOICES}
                              onClick={() => setQuizChoiceCount(card.id, (card.choices?.length ?? DEFAULT_QUIZ_CHOICES) - 1)}
                              aria-label={`Remove one choice from question ${index + 1}`}
                              title="Fewer choices"
                            >
                              <Minus className="size-4" />
                            </Button>
                            <span
                              className="w-9 text-center text-sm font-semibold tabular-nums"
                              aria-live="polite"
                              aria-label={`${card.choices?.length ?? DEFAULT_QUIZ_CHOICES} choices`}
                            >
                              {card.choices?.length ?? DEFAULT_QUIZ_CHOICES}
                            </span>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8 rounded-l-none"
                              disabled={(card.choices?.length ?? DEFAULT_QUIZ_CHOICES) >= MAX_QUIZ_CHOICES}
                              onClick={() => setQuizChoiceCount(card.id, (card.choices?.length ?? DEFAULT_QUIZ_CHOICES) + 1)}
                              aria-label={`Add one choice to question ${index + 1}`}
                              title="More choices"
                            >
                              <Plus className="size-4" />
                            </Button>
                          </div>
                        </div>
                        {(card.choices ?? Array.from({ length: DEFAULT_QUIZ_CHOICES }, () => "")).map((choice, choiceIndex) => (
                          <div key={choiceIndex} className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="icon"
                              variant={card.correctChoiceIndex === choiceIndex ? "default" : "outline"}
                              onClick={() => selectQuizCorrectChoice(card.id, choiceIndex)}
                              aria-label={`Mark option ${choiceIndex + 1} as correct`}
                              title="Correct answer"
                            >
                              <Check className="size-4" />
                            </Button>
                            <Input
                              value={choice}
                              onChange={(event) => updateQuizChoice(card.id, choiceIndex, event.target.value)}
                              placeholder={`Option ${choiceIndex + 1}`}
                              aria-label={`Card ${index + 1} option ${choiceIndex + 1}`}
                              maxLength={1000}
                            />
                          </div>
                        ))}
                      </div>
                    ) : formMode === "true-false" ? (
                      <Select value={card.answer || undefined} onValueChange={(value) => updateFormCard(card.id, "answer", value)}>
                        <SelectTrigger aria-label={`Card ${index + 1} answer`}><SelectValue placeholder="True or false" /></SelectTrigger>
                        <SelectContent><SelectItem value="true">True</SelectItem><SelectItem value="false">False</SelectItem></SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={card.answer}
                        onChange={(event) => updateFormCard(card.id, "answer", event.target.value)}
                        placeholder={formMode === "scramble" ? "Clue" : formMode === "missing-word" ? "Missing word" : "Answer"}
                        aria-label={`Card ${index + 1} answer`}
                        maxLength={1000}
                      />
                    )}
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="row-span-3"
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
                  <div className="col-start-2">
                    {card.imageData ? (
                      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-2">
                        <ActivityImage card={card} className="h-20 w-28 bg-background" />
                        <Input
                          value={card.imageAlt ?? ""}
                          onChange={(event) =>
                            updateFormCard(card.id, "imageAlt", event.target.value)
                          }
                          placeholder="Image description"
                          aria-label={`Card ${index + 1} image description`}
                          className="min-w-40 flex-1"
                          maxLength={160}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setFormCards((cards) =>
                              cards.map((item) =>
                                item.id === card.id
                                  ? { ...item, imageData: null, imageAlt: null }
                                  : item,
                              ),
                            )
                          }
                        >
                          <X className="mr-1 size-4" /> Remove
                        </Button>
                      </div>
                    ) : (
                      <Button type="button" size="sm" variant="outline" asChild>
                        <label className="cursor-pointer">
                          <ImagePlus className="mr-2 size-4" />
                          {processingImageId === card.id ? "Processing..." : "Attach image"}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            disabled={processingImageId !== null}
                            onChange={(event) => {
                              void attachImage(card.id, event.target.files?.[0]);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormCards((cards) => [...cards, emptyCard(formMode)])}
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

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Share activity</DialogTitle>
            <DialogDescription>
              It stays private until you choose a destination. Forum posts are also listed in the Catalog.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border p-3">
              <p className="font-medium">Private</p>
              <p className="text-sm text-muted-foreground">Only you can access the original activity.</p>
            </div>
            <div className="space-y-2 rounded-md border p-3">
              <Label>Share a copy with a class</Label>
              <div className="flex gap-2">
                <Select value={shareClassId} onValueChange={setShareClassId}>
                  <SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder="Choose class" /></SelectTrigger>
                  <SelectContent>
                    {(joinedClasses ?? []).map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" onClick={() => void shareActivity("class")} disabled={sharing}>Share</Button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={() => void shareActivity("catalog")} disabled={sharing}>Add to Catalog</Button>
              <Button type="button" onClick={() => void shareActivity("forum")} disabled={sharing}>Post to Forum</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
