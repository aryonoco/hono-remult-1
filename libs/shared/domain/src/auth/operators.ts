import { DEV_USERS } from './dev-users';

// Operational authorship roster for seeded fixtures.
//
// The eight DEV_USERS are the only *switchable* identities (the dev-auth
// scaffold). Real DEECA districts each have many incident editors, so to make
// the seeded history look authentic every district carries a small pool of
// non-switchable operators used purely as authorship strings (`createdBy`,
// `submittedBy`, `signedOffBy`, `signOffRemovedBy`). They are not logins and
// carry no permissions — they exist so the record trail reads like real people
// filed it. `operatorName` resolves any author id (operator or dev user) to a
// display name for UI and the admin panel; unknown ids pass through unchanged
// so the resolver is always safe to call.
//
// `districtId` groups an operator to the district whose incidents they file;
// `null` marks state-level duty officers who file across districts (and who
// stand in for the elevated "create in any district" path).

interface Operator {
  readonly id: string;
  readonly name: string;
  readonly districtId: number | null;
}

const STATE_OPERATORS: readonly Operator[] = [
  { id: 'op-state-1', name: 'Eleanor Whitlam', districtId: null },
  { id: 'op-state-2', name: 'Marcus Tan', districtId: null },
  { id: 'op-state-3', name: 'Fatima El-Hassan', districtId: null },
  { id: 'op-state-4', name: 'Daniel Petrakis', districtId: null },
  { id: 'op-state-5', name: 'Josephine Waru', districtId: null },
  { id: 'op-state-6', name: 'Andrew Beaumont', districtId: null },
] as const;

// Three incident editors per district, keyed by the DEECA district code.
const DISTRICT_OPERATORS: readonly Operator[] = [
  // 12 Otway (Barwon South West)
  { id: 'op-12-1', name: 'Hamish Calder', districtId: 12 },
  { id: 'op-12-2', name: 'Priya Nair', districtId: 12 },
  { id: 'op-12-3', name: 'Logan Reeves', districtId: 12 },
  // 13 Wimmera (Grampians)
  { id: 'op-13-1', name: 'Bridget Kowalski', districtId: 13 },
  { id: 'op-13-2', name: 'Sam Obeng', districtId: 13 },
  { id: 'op-13-3', name: 'Carmel Hogan', districtId: 13 },
  // 14 Far South West (Barwon South West)
  { id: 'op-14-1', name: 'Travis Lamb', districtId: 14 },
  { id: 'op-14-2', name: 'Ngoc Pham', districtId: 14 },
  { id: 'op-14-3', name: 'Eliza Fitzgerald', districtId: 14 },
  // 15 Midlands (Grampians)
  { id: 'op-15-1', name: 'Declan Murphy', districtId: 15 },
  { id: 'op-15-2', name: 'Anjali Deshmukh', districtId: 15 },
  { id: 'op-15-3', name: 'Brett Sandford', districtId: 15 },
  // 21 Murray Goldfields (Loddon Mallee)
  { id: 'op-21-1', name: 'Yvonne Castellano', districtId: 21 },
  { id: 'op-21-2', name: 'Riley Stanton', districtId: 21 },
  { id: 'op-21-3', name: 'Omar Saleh', districtId: 21 },
  // 22 Mallee (Loddon Mallee)
  { id: 'op-22-1', name: 'Joel Pickering', districtId: 22 },
  { id: 'op-22-2', name: 'Sophie Vassallo', districtId: 22 },
  { id: 'op-22-3', name: 'Harjit Gill', districtId: 22 },
  // 34 Ovens (Hume)
  { id: 'op-34-1', name: 'Cody Ferguson', districtId: 34 },
  { id: 'op-34-2', name: 'Ingrid Solberg', districtId: 34 },
  { id: 'op-34-3', name: 'Wei Zhang', districtId: 34 },
  // 36 Upper Murray (Hume)
  { id: 'op-36-1', name: 'Mitchell Crowe', districtId: 36 },
  { id: 'op-36-2', name: 'Tara Donohue', districtId: 36 },
  { id: 'op-36-3', name: 'Leonardo Bianchi', districtId: 36 },
  // 37 Goulburn (Hume)
  { id: 'op-37-1', name: 'Bianca Trevorrow', districtId: 37 },
  { id: 'op-37-2', name: 'Patrick Doherty', districtId: 37 },
  { id: 'op-37-3', name: 'Mei Lin Choo', districtId: 37 },
  // 38 Murrindindi (Hume)
  { id: 'op-38-1', name: 'Glenn Hartley', districtId: 38 },
  { id: 'op-38-2', name: 'Rosa Marchetti', districtId: 38 },
  { id: 'op-38-3', name: 'Kwame Mensah', districtId: 38 },
  // 41 Tambo (Gippsland)
  { id: 'op-41-1', name: 'Dale Wickham', districtId: 41 },
  { id: 'op-41-2', name: 'Imogen Slattery', districtId: 41 },
  { id: 'op-41-3', name: 'Rajesh Iyer', districtId: 41 },
  // 44 Macalister (Gippsland)
  { id: 'op-44-1', name: 'Nathan Pryor', districtId: 44 },
  { id: 'op-44-2', name: 'Chloe Bartlett', districtId: 44 },
  { id: 'op-44-3', name: 'Mohammed Idris', districtId: 44 },
  // 45 Snowy (Gippsland)
  { id: 'op-45-1', name: 'Stuart Macklin', districtId: 45 },
  { id: 'op-45-2', name: 'Larissa Quinn', districtId: 45 },
  { id: 'op-45-3', name: 'Tomas Novak', districtId: 45 },
  // 47 Latrobe (Gippsland)
  { id: 'op-47-1', name: 'Brendan Cosgrove', districtId: 47 },
  { id: 'op-47-2', name: 'Aiko Tanaka', districtId: 47 },
  { id: 'op-47-3', name: 'Wayne Tipping', districtId: 47 },
  // 52 Metropolitan (Port Phillip)
  { id: 'op-52-1', name: 'Vanessa Cardoso', districtId: 52 },
  { id: 'op-52-2', name: 'Hugh Bannister', districtId: 52 },
  { id: 'op-52-3', name: 'Sunita Rao', districtId: 52 },
  // 53 Yarra (Port Phillip)
  { id: 'op-53-1', name: 'Cameron Ashby', districtId: 53 },
  { id: 'op-53-2', name: 'Despina Galanis', districtId: 53 },
  { id: 'op-53-3', name: 'Blake Hollindale', districtId: 53 },
] as const;

const OPERATORS: readonly Operator[] = [...STATE_OPERATORS, ...DISTRICT_OPERATORS];

const NAME_BY_ID: ReadonlyMap<string, string> = new Map<string, string>([
  ...OPERATORS.map((o): [string, string] => [o.id, o.name]),
  ...DEV_USERS.map((u): [string, string] => [u.id, u.name ?? u.id]),
]);

/** Resolve an author id (operator or dev user) to a display name; unknown ids pass through. */
function operatorName(id: string): string {
  return NAME_BY_ID.get(id) ?? id;
}

export { DISTRICT_OPERATORS, OPERATORS, type Operator, operatorName, STATE_OPERATORS };
