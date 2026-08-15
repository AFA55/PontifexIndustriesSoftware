import { displayName, matchesNameQuery, nameSearchText } from './person-name';

const nate = { full_name: 'Conrade Richardson', nickname: 'Nate' };
const dante = { full_name: 'Dante Burgess', nickname: null };

describe('displayName', () => {
  it('shows the nickname beside the real name', () => {
    expect(displayName(nate)).toBe('Conrade Richardson (Nate)');
  });

  it('leaves a person without a nickname alone', () => {
    expect(displayName(dante)).toBe('Dante Burgess');
  });

  it('falls back to the nickname when there is no real name', () => {
    expect(displayName({ full_name: '', nickname: 'Nate' })).toBe('Nate');
  });

  it('does not repeat a nickname that is just the first name', () => {
    expect(displayName({ full_name: 'Zack Miller', nickname: 'Zack' })).toBe('Zack Miller');
    expect(displayName({ full_name: 'Zack Miller', nickname: 'zack' })).toBe('Zack Miller');
  });

  it('does not repeat a nickname identical to the full name', () => {
    expect(displayName({ full_name: 'Aiden', nickname: 'Aiden' })).toBe('Aiden');
  });

  it('has a fallback rather than rendering an empty row', () => {
    expect(displayName(null)).toBe('Unknown');
    expect(displayName({}, 'Crew member')).toBe('Crew member');
  });

  it('ignores whitespace-only values', () => {
    expect(displayName({ full_name: 'Dante Burgess', nickname: '   ' })).toBe('Dante Burgess');
  });
});

describe('searching by either name', () => {
  it('THE POINT: searching the nickname finds the real person', () => {
    expect(matchesNameQuery(nate, 'nate')).toBe(true);
    expect(matchesNameQuery(nate, 'Nate')).toBe(true);
  });

  it('still finds them by their real name', () => {
    expect(matchesNameQuery(nate, 'conrade')).toBe(true);
    expect(matchesNameQuery(nate, 'richardson')).toBe(true);
  });

  it('matches on every term, so two partial words narrow rather than widen', () => {
    expect(matchesNameQuery(nate, 'con rich')).toBe(true);
    expect(matchesNameQuery(nate, 'con burgess')).toBe(false);
  });

  it('an empty query matches everyone', () => {
    expect(matchesNameQuery(dante, '')).toBe(true);
    expect(matchesNameQuery(dante, '   ')).toBe(true);
  });

  it('does not match someone else', () => {
    expect(matchesNameQuery(dante, 'nate')).toBe(false);
  });

  it('search text carries both names', () => {
    expect(nameSearchText(nate)).toBe('conrade richardson nate');
  });
});
