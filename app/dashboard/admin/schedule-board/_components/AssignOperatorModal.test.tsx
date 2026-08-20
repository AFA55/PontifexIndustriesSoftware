/**
 * WHERE THE OFFICE'S REQUEST ACTUALLY DIED.
 *
 * Founder, Aug 20 2026: *"Sometimes the helpers get assigned to operators that
 * aren't on the platform… I'd just like to be able to assign helpers to jobs."*
 *
 * Every layer beneath this modal already allowed it. `job_daily_assignments` has
 * had both id columns nullable since April; `shouldPromoteToAssigned` has counted
 * a helper as somebody since Aug 13 — with this same founder quote in its
 * docblock; `lib/dispatch.ts` has texted helper-only jobs since Aug 15; the
 * timecard resolver reads `helper_id` and the printed ticket seeds a helper's day
 * from the board. And across 111 production assignment rows, helper-only had
 * happened exactly ZERO times.
 *
 * The reason was two lines of TSX:
 *
 *     onClick={() => selectedOperator && onConfirm(selectedOperator, …)}
 *     disabled={!selectedOperator}
 *
 * A feature that exists everywhere except at the button nobody can press is a
 * feature that does not exist. These tests hold the button open — they are about
 * REACHABILITY, not styling, so they press the thing the office presses and assert
 * on what the board is handed.
 */
// The modal dynamically imports the Supabase browser client to get a token for
// its skill-match fetch. Stubbed for the same reason BatchPrintModal.test.tsx
// stubs it: the real client is a live singleton with its own storage adapter and
// refresh timers, and none of that is what is under test here.
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn().mockResolvedValue({ session: null }) } },
}));

import { render, screen, fireEvent } from '@testing-library/react';
import AssignOperatorModal from './AssignOperatorModal';
import type { JobCardData } from './JobCard';

const JOB = {
  id: 'b699d8ec-3aa2-4d7b-8b41-f32869bf157c',
  job_number: 'JOB-2026-898480',
  customer_name: 'AM King',
  job_type: 'Wall Sawing',
  location: '474 Oconee Business Pkwy',
  address: '474 Oconee Business Pkwy',
  equipment_needed: [],
  description: null,
  scheduled_date: '2026-08-20',
  end_date: null,
  arrival_time: null,
  is_will_call: false,
  difficulty_rating: null,
  notes_count: 0,
  change_requests_count: 0,
  helper_names: [],
  po_number: null,
} as JobCardData;

const OPERATORS = ['Conrade Richardson (Nate)', 'Zack Estes'];
const HELPERS = ['Micah Rentz', 'Axel Valverde'];

// The modal fetches skill-match on mount. Irrelevant here and must not warn.
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as any;
});

function open(onConfirm = jest.fn()) {
  render(
    <AssignOperatorModal
      job={JOB}
      allOperators={OPERATORS}
      allHelpers={HELPERS}
      busyOperators={{}}
      busyHelpers={{}}
      onConfirm={onConfirm}
      onClose={jest.fn()}
    />
  );
  return {
    onConfirm,
    operatorSelect: screen.getAllByRole('combobox')[0] as HTMLSelectElement,
    helperSelect: screen.getAllByRole('combobox')[1] as HTMLSelectElement,
    assign: () => screen.getByRole('button', { name: /assign/i }),
  };
}

/** The option's value — the modal's own sentinel, read off the DOM so the test
 *  cannot drift from the component if it is ever renamed. */
function noOperatorValue(): string {
  const option = screen.getByRole('option', { name: /no operator/i }) as HTMLOptionElement;
  return option.value;
}

describe('the office can place a helper with no Pontifex operator', () => {
  it('offers "no operator" as a stated choice, not a blank', () => {
    open();
    // Distinct from the "Select Operator…" placeholder: one is an answer, the
    // other is the absence of one, and the Assign button treats them differently.
    expect(screen.getByRole('option', { name: /no operator/i })).toBeInTheDocument();
    expect(noOperatorValue()).not.toBe('');
  });

  it('still refuses to assign a job to nobody at all', () => {
    const { assign, operatorSelect } = open();
    // Nothing chosen — the original guard, unchanged.
    expect(assign()).toBeDisabled();
    // No operator AND no helper is the empty skeleton row that holds a date open.
    // Creating one from an Assign button would put a job on the board that nobody
    // is going to.
    fireEvent.change(operatorSelect, { target: { value: noOperatorValue() } });
    expect(assign()).toBeDisabled();
    expect(screen.getByText(/pick the helper who is going/i)).toBeInTheDocument();
  });

  it('enables Assign once the helper is chosen, and hands the board a NULL operator', () => {
    const { assign, operatorSelect, helperSelect, onConfirm } = open();
    fireEvent.change(operatorSelect, { target: { value: noOperatorValue() } });
    fireEvent.change(helperSelect, { target: { value: 'Micah Rentz' } });

    expect(assign()).toBeEnabled();
    fireEvent.click(assign());

    // null, NOT '' and not a placeholder name — the write path distinguishes
    // "no operator" from "I could not resolve one", and the board must send the
    // former. Aug 18 is what the latter costs.
    expect(onConfirm).toHaveBeenCalledWith(null, 'Micah Rentz', null);
  });

  it('carries the off-platform lead’s name through to the board', () => {
    const { assign, operatorSelect, helperSelect, onConfirm } = open();
    fireEvent.change(operatorSelect, { target: { value: noOperatorValue() } });
    fireEvent.change(helperSelect, { target: { value: 'Axel Valverde' } });

    const lead = screen.getByLabelText(/who is leading this crew/i);
    fireEvent.change(lead, { target: { value: '  Danny   Kerr ' } });
    fireEvent.click(assign());

    // Trimmed at the boundary; the server normalises again.
    expect(onConfirm).toHaveBeenCalledWith(null, 'Axel Valverde', 'Danny Kerr');
  });

  it('does not ask who the lead is when a Pontifex operator is on the crew', () => {
    const { operatorSelect } = open();
    expect(screen.queryByLabelText(/who is leading this crew/i)).not.toBeInTheDocument();
    fireEvent.change(operatorSelect, { target: { value: 'Zack Estes' } });
    // Conditionally RENDERED, never `hidden={…}` — Tailwind 3.4's `hidden` loses
    // to `block` at equal specificity, so a hidden field would still be on screen.
    expect(screen.queryByLabelText(/who is leading this crew/i)).not.toBeInTheDocument();
  });
});

describe('the ordinary operator assignment is unchanged', () => {
  it('assigns an operator with no helper, exactly as before', () => {
    const { assign, operatorSelect, onConfirm } = open();
    fireEvent.change(operatorSelect, { target: { value: 'Zack Estes' } });
    expect(assign()).toBeEnabled();
    fireEvent.click(assign());
    expect(onConfirm).toHaveBeenCalledWith('Zack Estes', null, null);
  });

  it('assigns an operator and a helper together', () => {
    const { assign, operatorSelect, helperSelect, onConfirm } = open();
    fireEvent.change(operatorSelect, { target: { value: 'Conrade Richardson (Nate)' } });
    fireEvent.change(helperSelect, { target: { value: 'Micah Rentz' } });
    fireEvent.click(assign());
    expect(onConfirm).toHaveBeenCalledWith('Conrade Richardson (Nate)', 'Micah Rentz', null);
  });
});
