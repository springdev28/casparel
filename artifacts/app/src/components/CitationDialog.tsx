import { useEffect, useMemo, useState } from "react";
import { Check, Clipboard, Quote } from "lucide-react";
import { Button } from "@workspace/edu-ds/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/edu-ds/components/ui/select";
import { Textarea } from "@workspace/edu-ds/components/ui/textarea";
import { makeCitation, type CitationStyle } from "../lib/citations";

export type CitationResource = { title: string; url: string };

export function CitationDialog({
  open,
  onOpenChange,
  resource,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource?: CitationResource | null;
}) {
  const [style, setStyle] = useState<CitationStyle>("apa");
  const [title, setTitle] = useState(resource?.title ?? "");
  const [url, setUrl] = useState(resource?.url ?? "");
  const [author, setAuthor] = useState("");
  const [publisher, setPublisher] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(resource?.title ?? "");
    setUrl(resource?.url ?? "");
    setAuthor("");
    setPublisher("");
    setPublishedAt("");
    setCopied(false);
  }, [open, resource]);

  const citation = useMemo(
    () => makeCitation({ title, url, author, publisher, publishedAt }, style),
    [author, publishedAt, publisher, style, title, url],
  );

  async function copyCitation() {
    await navigator.clipboard.writeText(citation);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Quote size={18} /> Citation maker
          </DialogTitle>
          <DialogDescription>
            Generate an unlimited citation locally. This tool does not use AI
            credits.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="citation-title">Page title</Label>
              <Input
                id="citation-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Citation style</Label>
              <Select
                value={style}
                onValueChange={(value) => setStyle(value as CitationStyle)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="apa">APA 7</SelectItem>
                  <SelectItem value="mla">MLA 9</SelectItem>
                  <SelectItem value="chicago">Chicago</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="citation-url">URL</Label>
            <Input
              id="citation-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="citation-author">Author</Label>
              <Input
                id="citation-author"
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="citation-publisher">Publisher</Label>
              <Input
                id="citation-publisher"
                value={publisher}
                onChange={(event) => setPublisher(event.target.value)}
                placeholder="Auto from URL"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="citation-date">Published</Label>
              <Input
                id="citation-date"
                type="date"
                value={publishedAt}
                onChange={(event) => setPublishedAt(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="citation-output">Citation</Label>
            <Textarea
              id="citation-output"
              readOnly
              value={citation}
              rows={4}
              className="font-serif"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={copyCitation}
            disabled={!title.trim() || !url.trim()}
          >
            {copied ? (
              <Check size={15} className="mr-2" />
            ) : (
              <Clipboard size={15} className="mr-2" />
            )}
            {copied ? "Copied" : "Copy citation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
