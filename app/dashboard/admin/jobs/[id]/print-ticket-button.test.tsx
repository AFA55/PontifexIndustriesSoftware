/**
 * A JOB WITH NO PAPERWORK IS THE ONE THAT MOST NEEDS PRINTING.
 *
 * The "Print ticket" link was gated on `dailyLogs.length > 0`. That made sense
 * while the ticket could only show days somebody had filed a log for — an empty
 * ticket was a blank page. It stopped making sense the moment the sheet started
 * seeding rows from the office's own `job_daily_assignments`: a day the board
 * staffed and the crew never logged is now exactly what the ticket exists to
 * surface, and it was the single state in which the button did not exist.
 *
 * WHY THIS READS THE SOURCE INSTEAD OF THE DOM. The honest test renders the
 * page and looks for the link. That page is 3,200 lines and mounts nine
 * concurrent fetches plus eleven child components; standing it up in jsdom
 * throws from somewhere in its dependency tree that has nothing to do with this
 * button, and mocking the tree until it doesn't is a larger and more fragile
 * artefact than the change it guards. What actually regresses here is someone
 * re-introducing the conditional, and that is a property of the source — so the
 * source is what is asserted, narrowly and with the reason attached.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const SOURCE = readFileSync(join(__dirname, 'page.tsx'), 'utf8');
const LINK = '/work-ticket`}';

describe('job detail — Print ticket is not gated on filed paperwork', () => {
  it('renders the work-ticket link', () => {
    expect(SOURCE).toContain(LINK);
  });

  it('has no `dailyLogs.length` condition anywhere near it', () => {
    const at = SOURCE.indexOf(LINK);
    expect(at).toBeGreaterThan(-1);
    // Everything from the enclosing section header down to the link itself.
    // A re-added gate — `{dailyLogs.length > 0 && (` — lands inside this window.
    const preceding = SOURCE.slice(Math.max(0, at - 1200), at);
    expect(preceding).not.toMatch(/dailyLogs\.length\s*[>!=]/);
    expect(preceding).not.toMatch(/workItemsByDay\.length\s*[>!=]/);
  });

  it('opens the ENTIRE JOB — no ?mode / ?date that could hide a day', () => {
    // JOB-2026-793440 printed Tuesday and left Monday's 22.75 hours off the
    // sheet because this href carried `?mode=week` anchored on the last log.
    const at = SOURCE.indexOf(LINK);
    const href = SOURCE.slice(at - 60, at + 20);
    expect(href).not.toContain('mode=');
    expect(href).not.toContain('date=');
  });
});
