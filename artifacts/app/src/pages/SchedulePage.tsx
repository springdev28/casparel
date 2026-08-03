import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, Calendar, Trash2, Clock } from 'lucide-react';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { Input } from '@workspace/edu-ds/components/ui/input';
import { Label } from '@workspace/edu-ds/components/ui/label';
import { Textarea } from '@workspace/edu-ds/components/ui/textarea';
import { Card, CardContent } from '@workspace/edu-ds/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@workspace/edu-ds/components/ui/dialog';
import { Skeleton } from '@workspace/edu-ds/components/ui/skeleton';
import { Badge } from '@workspace/edu-ds/components/ui/badge';
import { toast } from '@workspace/edu-ds/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { format, addDays, startOfWeek, isSameDay, parseISO } from 'date-fns';
import {
  useListScheduleBlocks,
  useCreateScheduleBlock,
  useDeleteScheduleBlock,
  getListScheduleBlocksQueryKey,
} from '@workspace/api-client-react';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BLOCK_COLORS = [
  'bg-blue-100 border-l-4 border-blue-500 text-blue-900',
  'bg-teal-100 border-l-4 border-teal-500 text-teal-900',
  'bg-purple-100 border-l-4 border-purple-500 text-purple-900',
  'bg-amber-100 border-l-4 border-amber-500 text-amber-900',
  'bg-emerald-100 border-l-4 border-emerald-500 text-emerald-900',
];

function getColor(id: number) {
  return BLOCK_COLORS[id % BLOCK_COLORS.length];
}

export default function SchedulePage() {
  const queryClient = useQueryClient();
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newStart, setNewStart] = useState('09:00');
  const [newEnd, setNewEnd] = useState('10:00');
  const [newNotes, setNewNotes] = useState('');

  const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd');

  const { data: blocks, isLoading } = useListScheduleBlocks({ weekStart: weekStartStr });
  const createBlock = useCreateScheduleBlock();
  const deleteBlock = useDeleteScheduleBlock();

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i)),
    [currentWeekStart]
  );

  function prevWeek() {
    setCurrentWeekStart((d) => addDays(d, -7));
  }

  function nextWeek() {
    setCurrentWeekStart((d) => addDays(d, 7));
  }

  function resetForm() {
    setNewTitle('');
    setNewDate('');
    setNewStart('09:00');
    setNewEnd('10:00');
    setNewNotes('');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createBlock.mutateAsync({
        data: {
          title: newTitle,
          date: newDate,
          startTime: newStart,
          endTime: newEnd,
          notes: newNotes || undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListScheduleBlocksQueryKey({ weekStart: weekStartStr }) });
      toast({ title: 'Block added!', description: `"${newTitle}" has been scheduled.` });
      resetForm();
      setDialogOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create block';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteBlock.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListScheduleBlocksQueryKey({ weekStart: weekStartStr }) });
      toast({ title: 'Block deleted' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete block';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }

  const blocksForDay = (day: Date) => {
    if (!blocks) return [];
    return blocks.filter((b) => {
      try {
        return isSameDay(parseISO(b.date), day);
      } catch {
        return false;
      }
    });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Schedule</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your weekly study plan</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-block-button">
              <Plus size={16} className="mr-1.5" /> Add Block
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Schedule Block</DialogTitle>
              <DialogDescription>Block out time for studying, classes, or assignments</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="block-title">Title</Label>
                <Input id="block-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required placeholder="e.g. Math Study Session" data-testid="block-title-input" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="block-date">Date</Label>
                <Input id="block-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} required data-testid="block-date-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="block-start">Start time</Label>
                  <Input id="block-start" type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} required data-testid="block-start-input" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="block-end">End time</Label>
                  <Input id="block-end" type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} required data-testid="block-end-input" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="block-notes">Notes (optional)</Label>
                <Textarea id="block-notes" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} rows={2} data-testid="block-notes-input" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
                <Button type="submit" disabled={createBlock.isPending} data-testid="add-block-confirm">
                  {createBlock.isPending ? 'Adding…' : 'Add Block'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={prevWeek} data-testid="prev-week-button">
          <ChevronLeft size={16} />
        </Button>
        <span className="text-sm font-medium text-foreground">
          {format(currentWeekStart, 'MMM d')} – {format(addDays(currentWeekStart, 6), 'MMM d, yyyy')}
        </span>
        <Button variant="outline" size="sm" onClick={nextWeek} data-testid="next-week-button">
          <ChevronRight size={16} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          data-testid="today-button"
        >
          Today
        </Button>
      </div>

      {/* Weekly Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          {weekDays.map((day, i) => {
            const dayBlocks = blocksForDay(day);
            const isToday = isSameDay(day, new Date());
            return (
              <div key={i} className="min-h-32">
                {/* Day header */}
                <div className={`text-center py-1.5 rounded-t-md text-sm font-medium mb-1 ${
                  isToday
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  <div className="font-semibold">{DAY_LABELS[i]}</div>
                  <div className="text-xs">{format(day, 'MMM d')}</div>
                </div>

                {/* Blocks */}
                <div className="space-y-1.5 min-h-24">
                  {dayBlocks.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-3">—</div>
                  ) : (
                    dayBlocks.map((block) => (
                      <div
                        key={block.id}
                        className={`rounded p-1.5 text-xs ${getColor(block.id)}`}
                        data-testid="schedule-block"
                      >
                        <div className="font-semibold truncate">{block.title}</div>
                        <div className="flex items-center gap-0.5 mt-0.5 opacity-80">
                          <Clock size={10} />
                          <span>{block.startTime.slice(0, 5)}–{block.endTime.slice(0, 5)}</span>
                        </div>
                        {block.notes && (
                          <p className="mt-0.5 opacity-75 truncate">{block.notes}</p>
                        )}
                        <button
                          onClick={() => handleDelete(block.id)}
                          className="mt-1 opacity-60 hover:opacity-100 transition-opacity"
                          data-testid="delete-block-button"
                          aria-label="Delete block"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upcoming blocks list (mobile fallback / extra context) */}
      {!isLoading && blocks && blocks.length > 0 && (
        <div className="md:hidden space-y-2">
          <h2 className="font-semibold text-foreground text-sm">This week&apos;s blocks</h2>
          {blocks.map((block) => (
            <Card key={block.id} data-testid="schedule-block-mobile">
              <CardContent className="py-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{block.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {block.date} · {block.startTime.slice(0, 5)}–{block.endTime.slice(0, 5)}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">{format(parseISO(block.date), 'EEE')}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                  onClick={() => handleDelete(block.id)}
                >
                  <Trash2 size={14} />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
