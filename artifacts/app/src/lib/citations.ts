/**
 * @fileOverview Web domain role: centralizes Citations state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
export type CitationStyle = "apa" | "mla" | "chicago";

export type CitationInput = {
  title: string;
  url: string;
  author?: string;
  publisher?: string;
  publishedAt?: string;
  accessedAt?: string;
};

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Website";
  }
}

function readableDate(value?: string) {
  if (!value) return "n.d.";
  const date = new Date(value + (value.length === 10 ? "T00:00:00" : ""));
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(date);
}

function mlaDate(value?: string) {
  if (!value) return "n.d.";
  const date = new Date(value + (value.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getDate()} ${date.toLocaleString("en", { month: "short" })}. ${date.getFullYear()}`;
}

function citationYear(value?: string) {
  if (!value) return "n.d.";
  const date = new Date(value + (value.length === 10 ? "T00:00:00" : ""));
  return Number.isNaN(date.getTime()) ? "n.d." : String(date.getFullYear());
}

function shortenedTitle(value: string) {
  const words = (value.trim() || "Untitled page").split(/\s+/);
  return `${words.slice(0, 4).join(" ")}${words.length > 4 ? "…" : ""}`;
}

export function makeCitation(input: CitationInput, style: CitationStyle) {
  const title = input.title.trim() || "Untitled page";
  const site = input.publisher?.trim() || hostname(input.url);
  const author = input.author?.trim();
  const now = new Date();
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const accessed = input.accessedAt || localToday;
  if (style === "mla") {
    return `${author ? `${author}. ` : ""}“${title}.” ${site}, ${mlaDate(input.publishedAt)}, ${input.url}. Accessed ${mlaDate(accessed)}.`;
  }
  if (style === "chicago") {
    return `${author ? `${author}. ` : ""}“${title}.” ${site}. ${input.publishedAt ? `${readableDate(input.publishedAt)}. ` : ""}Accessed ${readableDate(accessed)}. ${input.url}.`;
  }
  return `${author ? `${author}. ` : ""}(${input.publishedAt ? new Date(input.publishedAt).getFullYear() : "n.d."}). ${title}. ${site}. ${input.url}`;
}

export function makeInTextCitation(
  input: CitationInput,
  style: CitationStyle,
) {
  const author = input.author?.trim();
  const creator = author || `“${shortenedTitle(input.title)}”`;
  if (style === "mla") return `(${creator})`;
  if (style === "chicago")
    return `(${creator} ${citationYear(input.publishedAt)})`;
  return `(${creator}, ${citationYear(input.publishedAt)})`;
}
