import { type FireStatus, FireStatus as Status } from '@workspace/shared-domain';
import type { Rng } from './prng';

// Templated free-text for the narrative fields. Real operators range from terse
// (only the required fields) to thorough, so each builder returns '' a share of
// the time — driven by a per-fire `detail` level — and otherwise assembles a
// plausible sentence from word pools. Vocabulary is deliberately generic so the
// text reads naturally without naming real people or unverifiable specifics.

const WIND_DIR = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
const blank = (rng: Rng, detail: number, p: number): boolean => rng.next() > detail * p;

// Blank probabilities: how often each field is left empty (scaled by `detail`).
const WEATHER_BLANK_P = 0.95;
const STRATEGY_BLANK_P = 0.8;
const BEHAVIOUR_BLANK_P = 0.7;
const CONTROL_BLANK_P = 0.65;
const COMMUNITY_BLANK_HIGH_P = 0.85;
const COMMUNITY_BLANK_LOW_P = 0.4;
const EVENTS_BLANK_P = 0.45;
const INFRA_BLANK_P = 0.6;
const OTHER_LOSS_BLANK_P = 0.5;
const SEVERE_THRESHOLD = 0.6;
const BEHAVIOUR_ESCALATION_P = 0.6;

// Synthetic weather model: a hot, dry, windy baseline scaled by severity.
const TEMP_BASE = 18;
const TEMP_SEVERITY_COEFF = 22;
const TEMP_JITTER_MIN = -3;
const TEMP_JITTER_MAX = 4;
const RH_BASE = 45;
const RH_SEVERITY_COEFF = 33;
const RH_FLOOR = 5;
const RH_JITTER = 6;
const WIND_BASE = 15;
const WIND_SEVERITY_COEFF = 45;
const WIND_JITTER_MIN = -5;
const WIND_JITTER_MAX = 10;
const RATING_VERY_HIGH_WEIGHT = 0.6;
const RATING_EXTREME_OFFSET = 0.5;

function weather(rng: Rng, severity: number, detail: number): string {
  if (blank(rng, detail, WEATHER_BLANK_P)) {
    return '';
  }
  const dir = rng.pick(WIND_DIR);
  const temp = Math.round(
    TEMP_BASE + severity * TEMP_SEVERITY_COEFF + rng.float(TEMP_JITTER_MIN, TEMP_JITTER_MAX),
  );
  const rh = Math.max(
    RH_FLOOR,
    Math.round(RH_BASE - severity * RH_SEVERITY_COEFF + rng.float(-RH_JITTER, RH_JITTER)),
  );
  const wind = Math.round(
    WIND_BASE + severity * WIND_SEVERITY_COEFF + rng.float(WIND_JITTER_MIN, WIND_JITTER_MAX),
  );
  const rating = rng.weighted([
    { value: 'High', weight: 1 - severity },
    { value: 'Very High', weight: RATING_VERY_HIGH_WEIGHT },
    { value: 'Severe', weight: severity },
    { value: 'Extreme', weight: Math.max(0, severity - RATING_EXTREME_OFFSET) },
  ]);
  return `${dir}'ly winds ${wind} km/h, ${temp}°C, RH ${rh}%. Fire danger ${rating}.`;
}

const STRATEGY_GOING = [
  'Direct attack with tankers; aircraft bombing the head and active flanks.',
  'Offensive first attack, crews working the edges with support from a helitak.',
  'Building containment line on the eastern flank ahead of the wind change.',
  'Backburning off the boundary track to secure the southern edge.',
];
const STRATEGY_CONTAINED = [
  'Consolidating containment lines and blacking out the perimeter.',
  'Mopping up and patrolling; machinery improving control lines.',
  'Holding existing lines, crews extinguishing hotspots along the edge.',
];
const STRATEGY_SAFE = [
  'Patrol and mop-up complete; no further open flame on the perimeter.',
  'Final patrol of the fireground; crews progressively released.',
];

function strategy(rng: Rng, status: FireStatus, detail: number): string {
  if (blank(rng, detail, STRATEGY_BLANK_P)) {
    return '';
  }
  if (status === Status.going) {
    return rng.pick(STRATEGY_GOING);
  }
  if (status === Status.safe || status === Status.safeOverrun) {
    return rng.pick(STRATEGY_SAFE);
  }
  return rng.pick(STRATEGY_CONTAINED);
}

const BEHAVIOUR = [
  'Wind-driven runs in the elevated fuels; spotting up to 500 m ahead of the front.',
  'Moderate rate of spread with isolated crown fire in heavier fuel.',
  'Backing slowly against the wind with low-intensity edge activity.',
  'Active in the afternoon then easing overnight with higher humidity.',
];

function predictedBehaviour(rng: Rng, severity: number, detail: number): string {
  if (blank(rng, detail, BEHAVIOUR_BLANK_P)) {
    return '';
  }
  if (severity > SEVERE_THRESHOLD && rng.bool(BEHAVIOUR_ESCALATION_P)) {
    return 'Potential for rapid escalation under the forecast wind change; spotting likely.';
  }
  return rng.pick(BEHAVIOUR);
}

const CONTROL_PROGRESS = [
  'Approximately 40% of perimeter contained.',
  'Containment lines holding on all but the northern edge.',
  'Perimeter fully contained; moving to patrol.',
  'Control lines tested by the wind change and held.',
];

function controlProgress(rng: Rng, detail: number): string {
  if (blank(rng, detail, CONTROL_BLANK_P)) {
    return '';
  }
  return rng.pick(CONTROL_PROGRESS);
}

const COMMUNITY_IMPACT = [
  'Watch and Act issued for nearby localities; no properties currently threatened.',
  'Advice message in place; smoke affecting the highway.',
  'No communities under direct threat; relief centre on standby.',
  'Property protection in place for isolated rural dwellings.',
];

function communityImpact(rng: Rng, severity: number, detail: number): string {
  if (
    blank(rng, detail, severity > SEVERE_THRESHOLD ? COMMUNITY_BLANK_HIGH_P : COMMUNITY_BLANK_LOW_P)
  ) {
    return '';
  }
  return rng.pick(COMMUNITY_IMPACT);
}

const SIGNIFICANT_EVENTS = [
  'South-westerly change arrived earlier than forecast, pushing the eastern flank.',
  'Aircraft grounded briefly by poor visibility; resumed once smoke lifted.',
  'Additional strike teams requested and en route from neighbouring districts.',
  'Powerline brought down across an access track; crews rerouted.',
];

function significantEvents(rng: Rng, detail: number): string {
  if (blank(rng, detail, EVENTS_BLANK_P)) {
    return '';
  }
  return rng.pick(SIGNIFICANT_EVENTS);
}

const DECLARED_BY = [
  'Regional Controller',
  'Incident Controller',
  'Regional Agency Commander',
  'State Duty Officer',
];

function declaredBySource(rng: Rng): string {
  return rng.pick(DECLARED_BY);
}

const CAUSE_OTHER = [
  'Suspected re-ignition from an old stump.',
  'Equipment fault under investigation.',
  'Origin consistent with an abandoned campfire site.',
];

function causeSourceOther(rng: Rng): string {
  return rng.pick(CAUSE_OTHER);
}

const INFRASTRUCTURE = [
  'Boundary fencing and a pump shed.',
  'Telecommunications cable and a section of guardrail.',
  'Two timber bridges on minor access tracks.',
  'Power poles along the ridge access road.',
];

function infrastructureLosses(rng: Rng, detail: number): string {
  return blank(rng, detail, INFRA_BLANK_P) ? '' : rng.pick(INFRASTRUCTURE);
}

const OTHER_LOSSES = [
  'Apiary sites and stored fodder.',
  'Recreational signage and a viewing platform.',
  'Fruit trees and garden infrastructure on adjoining land.',
];

function otherLosses(rng: Rng, detail: number): string {
  return blank(rng, detail, OTHER_LOSS_BLANK_P) ? '' : rng.pick(OTHER_LOSSES);
}

const INVESTIGATION_BY = [
  'Accredited Fire Investigator',
  'District Fire Investigation Officer',
  'Joint DEECA / Victoria Police investigation team',
];

function investigationBy(rng: Rng): string {
  return rng.pick(INVESTIGATION_BY);
}

const DELETION_REASON = [
  'Duplicate incident — merged with the primary record.',
  'Entered in error during testing.',
  'Reclassified as a non-reportable burn.',
  'Created against the wrong district and re-lodged.',
];

function deletionReason(rng: Rng): string {
  return rng.pick(DELETION_REASON);
}

const SIGN_OFF_REMOVED_REASON = [
  'Additional loss data received after sign-off.',
  'Correction required to the burnt-area breakdown.',
  'Re-opened to attach the investigation outcome.',
];

function signOffRemovedReason(rng: Rng): string {
  return rng.pick(SIGN_OFF_REMOVED_REASON);
}

export {
  causeSourceOther,
  communityImpact,
  controlProgress,
  declaredBySource,
  deletionReason,
  infrastructureLosses,
  investigationBy,
  otherLosses,
  predictedBehaviour,
  significantEvents,
  signOffRemovedReason,
  strategy,
  weather,
};
