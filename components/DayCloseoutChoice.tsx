'use client';

/**
 * The end-of-day terminal choice, as a phone-first control.
 *
 * ── WHAT WAS WRONG ───────────────────────────────────────────────────────────
 * "Done for Today" and "Complete Job" were siblings — three identical gradient
 * cards, same size, same shape, stacked, with the amber one FIRST. The crew
 * were not choosing between two clearly different outcomes; they were reading
 * two labels that both mean "I'm finished here" to anyone who hasn't been
 * taught the difference. Five of six closeouts over three days took the wrong
 * one, and each of those left a job un-advanced (and, on the completion path
 * only, skipped the customer signature entirely).
 *
 * ── WHAT THIS DOES INSTEAD ───────────────────────────────────────────────────
 * 1. Asks the question the crew is actually answering — is the work finished,
 *    or are you coming back — and groups the buttons under those two answers.
 * 2. Puts the consequence ON the control ("it's back on your list tomorrow" /
 *    "closes the job out"), not in a legend elsewhere on the page.
 * 3. Ranks them. Finishing is the common outcome and leads; coming back is the
 *    exception and sits below a divider in a lighter treatment — never two
 *    adjacent identical-looking buttons.
 * 4. Flips that ranking when the office genuinely booked another day: on a
 *    multi-day job mid-span, "Done for Today" IS the expected action and stays
 *    frictionless and primary.
 * 5. Confirms — naming the cost — before a job the office booked for one day
 *    can become a multi-day job. See lib/day-closeout.ts for the rule. It asks
 *    only when it actually knows what the office booked (`planPending`);
 *    otherwise the server decides, so no crew is ever warned about a one-day
 *    booking on an eight-day job.
 *
 * Field constraints: gloves, sunlight, 375px. Every tap target is ≥ 56px tall,
 * no copy under 14px, and the two answers never look alike.
 */

import { useEffect, useState } from 'react';
import { Sun, Trophy, Send, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import {
  continueConfirmCopy,
  formatBookedThrough,
  type CloseoutPlan,
  type ContinueConfirmCopy,
} from '@/lib/day-closeout';

interface Props {
  plan: CloseoutPlan;
  /** Blocks every terminal action (e.g. the unanswered out-of-town question). */
  disabled?: boolean;
  submitting?: boolean;
  /**
   * The booked span is not known yet (schedule fetch in flight, or it failed).
   * `plan` is then built from nulls, which reads as "booked for one day" — so
   * the modal would tell a genuine 8-day job that the office booked it for one,
   * during the window before the fetch lands. Training crews to click through a
   * scary-but-wrong warning is how they learn to click through the real one.
   *
   * While this is set we ask nothing and submit UNCONFIRMED: the server holds
   * the same rule with the real dates, so it either allows the day-close or
   * returns the 409 and the question comes back in the server's own words.
   */
  planPending?: boolean;
  /** `confirmed` is true only when the crew went through the confirmation. */
  onContinue: (confirmed: boolean) => void;
  onSignOnSite: () => void;
  onSendLink: () => void;
  /**
   * Set when the SERVER refused an unconfirmed "Done for Today" (409). The
   * client and server evaluate the same rule, so this is the backstop for a
   * stale schedule read — it forces the same question open with the server's
   * words.
   */
  serverConfirmMessage?: string | null;
  /**
   * The 409's structured copy, when it sent one. Preferred over
   * `serverConfirmMessage`: taking the title from the client's (stale) plan
   * while the body comes from the server can describe two different situations
   * in one modal.
   */
  serverConfirmCopy?: ContinueConfirmCopy | null;
  onServerConfirmDismissed?: () => void;
}

export default function DayCloseoutChoice({
  plan,
  disabled = false,
  submitting = false,
  planPending = false,
  onContinue,
  onSignOnSite,
  onSendLink,
  serverConfirmMessage = null,
  serverConfirmCopy = null,
  onServerConfirmDismissed,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const blocked = disabled || submitting;
  const continueIsPrimary = plan.primaryAction === 'continue';
  const copy = plan.confirm ?? continueConfirmCopy({
    officeBookedMultiDay: plan.officeBookedMultiDay,
    bookedEndDate: plan.bookedEndDate,
  });

  const modalOpen = confirmOpen || !!serverConfirmMessage || !!serverConfirmCopy;

  // When the SERVER refused, its words own the WHOLE modal — title and body
  // together — so the two halves can never describe different situations.
  const modalCopy: ContinueConfirmCopy =
    serverConfirmCopy ??
    (serverConfirmMessage
      ? {
          title: 'Check before you continue.',
          body: serverConfirmMessage,
          confirmLabel: copy.confirmLabel,
          cancelLabel: copy.cancelLabel,
        }
      : copy);

  const handleContinueTap = () => {
    if (blocked) return;
    // A job the office did NOT book past today must not change shape on one tap.
    // Unless we don't yet know what the office booked — then the server decides
    // (see planPending) rather than the crew reading a warning built from nulls.
    if (plan.requiresContinueConfirmation && !planPending) {
      setConfirmOpen(true);
      return;
    }
    onContinue(false);
  };

  const closeModal = () => {
    setConfirmOpen(false);
    onServerConfirmDismissed?.();
  };

  const confirmAndContinue = () => {
    setConfirmOpen(false);
    onServerConfirmDismissed?.();
    onContinue(true);
  };

  // Escape closes it. "No — take me back" was the only way out, and cancelling
  // is the safe direction, so backing out must never be the hard part.
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || submitting) return;
      setConfirmOpen(false);
      onServerConfirmDismissed?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen, submitting, onServerConfirmDismissed]);

  // ── The two answers ────────────────────────────────────────────────────────

  const finishBlock = (
    <section key="finish" aria-labelledby="closeout-finish-heading" className="space-y-3">
      <h3
        id="closeout-finish-heading"
        className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300"
      >
        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
        The work is finished
      </h3>

      <button
        type="button"
        data-testid="closeout-sign-on-site"
        onClick={onSignOnSite}
        disabled={blocked}
        className={
          continueIsPrimary
            ? 'group flex min-h-[56px] w-full items-center gap-4 rounded-2xl border-2 border-emerald-500/60 bg-white p-4 text-left transition-all active:scale-[0.99] disabled:opacity-55 disabled:cursor-not-allowed dark:bg-white/[0.04]'
            : 'group flex min-h-[56px] w-full items-center gap-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-500 to-teal-500 p-5 text-left shadow-lg shadow-emerald-500/30 ring-1 ring-emerald-400/30 transition-all hover:shadow-xl active:scale-[0.99] disabled:opacity-55 disabled:cursor-not-allowed'
        }
      >
        <div
          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${
            continueIsPrimary
              ? 'bg-emerald-100 dark:bg-emerald-500/15'
              : 'bg-white/25 ring-1 ring-white/30 backdrop-blur-sm'
          }`}
        >
          <Trophy className={`h-6 w-6 ${continueIsPrimary ? 'text-emerald-600 dark:text-emerald-300' : 'text-white'}`} />
        </div>
        <div className="flex-1">
          <p className={`text-base font-bold ${continueIsPrimary ? 'text-gray-900 dark:text-white' : 'text-white'}`}>
            Complete Job — Customer Signs Here
          </p>
          <p className={`mt-0.5 text-sm ${continueIsPrimary ? 'text-gray-600 dark:text-gray-300' : 'text-white/85'}`}>
            Customer is on site. Take their signature and close the job out.
          </p>
        </div>
      </button>

      <button
        type="button"
        data-testid="closeout-send-link"
        onClick={onSendLink}
        disabled={blocked}
        className={
          continueIsPrimary
            ? 'group flex min-h-[56px] w-full items-center gap-4 rounded-2xl border-2 border-brand/60 bg-white p-4 text-left transition-all active:scale-[0.99] disabled:opacity-55 disabled:cursor-not-allowed dark:bg-white/[0.04]'
            : 'group flex min-h-[56px] w-full items-center gap-4 rounded-2xl bg-gradient-to-r from-brand to-brand-accent p-5 text-left shadow-lg shadow-brand/30 ring-1 ring-brand/30 transition-all hover:shadow-xl active:scale-[0.99] disabled:opacity-55 disabled:cursor-not-allowed'
        }
      >
        <div
          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${
            continueIsPrimary ? 'bg-brand/10 dark:bg-brand/20' : 'bg-white/25 ring-1 ring-white/30 backdrop-blur-sm'
          }`}
        >
          <Send className={`h-6 w-6 ${continueIsPrimary ? 'text-brand' : 'text-white'}`} />
        </div>
        <div className="flex-1">
          <p className={`text-base font-bold ${continueIsPrimary ? 'text-gray-900 dark:text-white' : 'text-white'}`}>
            Complete Job — Text the Customer to Sign
          </p>
          <p className={`mt-0.5 text-sm ${continueIsPrimary ? 'text-gray-600 dark:text-gray-300' : 'text-white/85'}`}>
            Customer isn&apos;t here. Text them a signature link, then the job closes.
          </p>
        </div>
      </button>
    </section>
  );

  const continueBlock = (
    <section key="continue" aria-labelledby="closeout-continue-heading" className="space-y-3">
      <h3
        id="closeout-continue-heading"
        className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300"
      >
        <Sun className="h-4 w-4 flex-shrink-0" />
        {continueIsPrimary ? 'Coming back tomorrow' : 'Not finished yet'}
      </h3>

      <button
        type="button"
        data-testid="closeout-continue"
        onClick={handleContinueTap}
        disabled={blocked}
        className={
          continueIsPrimary
            ? 'group flex min-h-[56px] w-full items-center gap-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-500 to-orange-500 p-5 text-left shadow-lg shadow-amber-500/30 ring-1 ring-amber-400/30 transition-all hover:shadow-xl active:scale-[0.99] disabled:opacity-55 disabled:cursor-not-allowed'
            : 'group flex min-h-[56px] w-full items-center gap-4 rounded-2xl border-2 border-amber-500/50 bg-amber-50 p-4 text-left transition-all active:scale-[0.99] disabled:opacity-55 disabled:cursor-not-allowed dark:border-amber-400/35 dark:bg-amber-400/10'
        }
      >
        <div
          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${
            continueIsPrimary
              ? 'bg-white/25 ring-1 ring-white/30 backdrop-blur-sm'
              : 'bg-amber-100 dark:bg-amber-400/20'
          }`}
        >
          <Sun className={`h-6 w-6 ${continueIsPrimary ? 'text-white' : 'text-amber-600 dark:text-amber-300'}`} />
        </div>
        <div className="flex-1">
          <p className={`text-base font-bold ${continueIsPrimary ? 'text-white' : 'text-amber-900 dark:text-amber-100'}`}>
            Done for Today — Coming Back Tomorrow
          </p>
          <p className={`mt-0.5 text-sm ${continueIsPrimary ? 'text-white/85' : 'text-amber-800 dark:text-amber-200/85'}`}>
            {continueIsPrimary
              ? `Today's work is saved. ${formatBookedThrough(plan.bookedEndDate)}`
              : 'Leaves the job OPEN and back on your list tomorrow. Not finished, not billed.'}
          </p>
        </div>
        {/* Shown on BOTH treatments. It used to be gated on continueIsPrimary —
            i.e. hidden in exactly the case that goes through the confirmation
            modal, so on LTE the modal vanished and nothing visibly happened for
            seconds. That reads as a dropped tap. */}
        {submitting && (
          <Loader2
            className={`h-5 w-5 animate-spin ${
              continueIsPrimary ? 'text-white' : 'text-amber-700 dark:text-amber-200'
            }`}
          />
        )}
      </button>
    </section>
  );

  const divider = (
    <div key="divider" className="flex items-center gap-3 py-1" aria-hidden="true">
      <span className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
      <span className="text-sm font-medium text-gray-400 dark:text-white/40">or</span>
      <span className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
    </div>
  );

  return (
    <div className="space-y-4">
      <h2 className="text-center text-lg font-semibold text-gray-800 dark:text-gray-100">
        Is the work finished, or are you coming back?
      </h2>

      {continueIsPrimary
        ? [continueBlock, divider, finishBlock]
        : [finishBlock, divider, continueBlock]}

      {/* ── The question that stops the silent conversion ────────────────── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="closeout-confirm-title"
          data-testid="closeout-confirm"
        >
          <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 shadow-2xl dark:border-amber-400/25 dark:bg-gray-900">
            <div className="mb-3 flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-400/15">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-300" />
              </div>
              <h2
                id="closeout-confirm-title"
                className="text-base font-bold leading-snug text-gray-900 dark:text-white"
              >
                {modalCopy.title}
              </h2>
            </div>

            <p className="mb-5 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
              {modalCopy.body}
            </p>

            <button
              type="button"
              data-testid="closeout-confirm-yes"
              onClick={confirmAndContinue}
              disabled={submitting}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 text-base font-bold text-white shadow-lg shadow-amber-500/30 transition-all active:scale-[0.99] disabled:opacity-55"
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sun className="h-5 w-5" />}
              {modalCopy.confirmLabel}
            </button>

            <button
              type="button"
              data-testid="closeout-confirm-no"
              onClick={closeModal}
              disabled={submitting}
              className="mt-3 min-h-[52px] w-full rounded-xl border border-gray-300 bg-white px-4 text-base font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-55 dark:border-white/15 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/10"
            >
              {modalCopy.cancelLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
