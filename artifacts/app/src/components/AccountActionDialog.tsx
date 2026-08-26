/**
 * @fileOverview Web account-safety role: collects reauthentication before reset or deletion and explains their exact consequences.
 * System connection: shared by SettingsPage and the banned-account gate; calls generated account lifecycle mutations and clears browser-owned account state.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DeleteAccountInputConfirmation,
  ResetAccountInputConfirmation,
  useDeleteMe,
  useResetMe,
} from "@workspace/api-client-react";
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
import { AlertTriangle, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { getApiError } from "../lib/api-error";
import { clearLocalAccountData, clearSession } from "../lib/session";

export type AccountAction = "reset" | "delete";

type Props = {
  action: AccountAction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function destination(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}${path}`;
}

/**
 * One dialog for both actions keeps the safety contract identical everywhere:
 * warning first, current password second, destructive call last. The password
 * is held only in component state and is cleared whenever the dialog closes.
 */
export function AccountActionDialog({ action, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const resetAccount = useResetMe();
  const deleteAccount = useDeleteMe();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pending = resetAccount.isPending || deleteAccount.isPending;

  useEffect(() => {
    if (!open) {
      setPassword("");
      setError(null);
    }
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || pending) return;
    setError(null);

    try {
      if (action === "reset") {
        await resetAccount.mutateAsync({
          data: {
            password,
            confirmation: ResetAccountInputConfirmation.RESET,
          },
        });
        // The token is the one piece of browser account state reset preserves.
        // A full navigation then rebuilds every query and preference from the
        // reset server state instead of letting an old observer repaint it.
        clearLocalAccountData({ preserveSession: true });
        queryClient.clear();
        window.location.assign(destination("/dashboard"));
        return;
      }

      await deleteAccount.mutateAsync({
        data: {
          password,
          confirmation: DeleteAccountInputConfirmation.DELETE,
        },
      });
      clearLocalAccountData();
      clearSession();
      queryClient.clear();
      window.location.assign(destination("/resources"));
    } catch (cause) {
      const failure = getApiError(cause);
      setError(
        failure.status === 401
          ? "That password is incorrect. Your account has not been changed."
          : failure.offline
            ? "Casparel could not be reached. Check your connection and try again."
            : "The account could not be changed. Nothing was removed; please try again.",
      );
    }
  }

  const resetting = action === "reset";
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive-text">
              <AlertTriangle className="size-5" aria-hidden="true" />
            </div>
            <DialogTitle>
              {resetting
                ? "Reset account data?"
                : "Delete account permanently?"}
            </DialogTitle>
            <DialogDescription>
              {resetting
                ? "This cannot be undone. Your login, name, subscription, classes, messages, submitted resources, and public contributions will remain."
                : "This cannot be undone. You will be signed out and will not be able to recover this account."}
            </DialogDescription>
          </DialogHeader>

          {resetting ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="font-medium">Reset removes:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  Profile details, appearance, preferences, and tutorial state
                </li>
                <li>
                  Personal goals, evidence, schedules, lists, activities, and
                  private canvases
                </li>
                <li>
                  Unpublished resources and connected Google or calendar data
                </li>
              </ul>
            </div>
          ) : (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="font-medium">
                Deletion closes the account permanently.
              </p>
              <p className="mt-1 text-muted-foreground">
                Private workspace data is removed. Shared contributions that
                must remain for other people are anonymized as “Deleted user”.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor={`account-${action}-password`}>
              Enter your current password to continue
            </Label>
            <Input
              id={`account-${action}-password`}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
              maxLength={256}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `account-${action}-error` : undefined}
            />
            {error ? (
              <p
                id={`account-${action}-error`}
                role="alert"
                className="text-sm text-destructive-text"
              >
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Keep my account
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!password || pending}
            >
              {pending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : resetting ? (
                <RotateCcw className="mr-2 size-4" />
              ) : (
                <Trash2 className="mr-2 size-4" />
              )}
              {pending
                ? resetting
                  ? "Resetting…"
                  : "Deleting…"
                : resetting
                  ? "Reset account data"
                  : "Delete account permanently"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
