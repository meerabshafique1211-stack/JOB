// Rule-based eligibility classification. Every positive claim stores the evidence text it came from.

export const EUROPE: Record<string, string[]> = {
  Germany: ['germany', 'deutschland', 'berlin', 'munich', 'münchen', 'hamburg', 'frankfurt', 'cologne', 'köln', 'düsseldorf', 'stuttgart', 'leipzig'],
  Netherlands: ['netherlands', 'holland', 'amsterdam', 'rotterdam', 'utrecht', 'eindhoven', 'the hague'],
  Sweden: ['sweden', 'stockholm', 'gothenburg', 'malmö', 'malmo'],
  Denmark: ['denmark', 'copenhagen', 'aarhus'],
  Finland: ['finland', 'helsinki', 'espoo', 'tampere'],
  Norway: ['norway', 'oslo', 'bergen'],
  Ireland: ['ireland', 'dublin', 'cork', 'galway'],
  'United Kingdom': ['united kingdom', 'uk', 'england', 'scotland', 'wales', 'london', 'manchester', 'edinburgh', 'bristol', 'birmingham', 'leeds', 'glasgow', 'cambridge', 'oxford'],
  France: ['france', 'paris', 'lyon', 'toulouse', 'nantes', 'bordeaux'],
  Belgium: ['belgium', 'brussels', 'antwerp', 'ghent'],
  Switzerland: ['switzerland', 'zurich', 'zürich', 'geneva', 'basel', 'lausanne', 'bern'],
  Austria: ['austria', 'vienna', 'wien', 'graz', 'linz'],
  Poland: ['poland', 'warsaw', 'kraków', 'krakow', 'wrocław', 'wroclaw', 'gdańsk', 'gdansk', 'poznań', 'poznan'],
  Portugal: ['portugal', 'lisbon', 'lisboa', 'porto', 'braga'],
  Spain: ['spain', 'españa', 'madrid', 'barcelona', 'valencia', 'seville', 'malaga', 'málaga'],
  Estonia: ['estonia', 'tallinn', 'tartu'],
  'Czech Republic': ['czech', 'czechia', 'prague', 'praha', 'brno'],
  Italy: ['italy', 'milan', 'rome', 'turin'],
  Luxembourg: ['luxembourg'],
  Lithuania: ['lithuania', 'vilnius'],
  Latvia: ['latvia', 'riga'],
  Romania: ['romania', 'bucharest', 'cluj'],
  Greece: ['greece', 'athens'],
  Hungary: ['hungary', 'budapest'],
  Cyprus: ['cyprus', 'limassol', 'nicosia'],
  Malta: ['malta'],
  Croatia: ['croatia', 'zagreb'],
  Serbia: ['serbia', 'belgrade'],
  Bulgaria: ['bulgaria', 'sofia'],
};

const PAKISTAN = /\b(pakistan|lahore|karachi|islamabad|rawalpindi|faisalabad)\b/i;

export function detectCountry(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = ` ${text.toLowerCase()} `;
  if (PAKISTAN.test(t)) return 'Pakistan';
  for (const [country, keys] of Object.entries(EUROPE)) {
    for (const k of keys) {
      const re = new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i');
      if (re.test(t)) return country;
    }
  }
  return null;
}

function sentenceAround(text: string, idx: number) {
  const start = Math.max(0, text.lastIndexOf('.', idx - 1) + 1, idx - 220);
  let end = text.indexOf('.', idx);
  if (end < 0 || end - idx > 260) end = Math.min(text.length, idx + 260);
  return text.slice(start, end + 1).replace(/\s+/g, ' ').trim();
}

function findEvidence(text: string, patterns: RegExp[]) {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return sentenceAround(text, m.index);
  }
  return null;
}

const SPONSOR_NEG = [
  /\b(no|not|unable to|cannot|can't|can not|do not|don't|does not|doesn't|will not|won't)\b[^.]{0,40}\b(offer|provide|support)?[^.]{0,20}\b(visa )?sponsor(ship)?/i,
  /sponsorship (is )?not (available|offered|provided|possible)/i,
  /without (the need for )?(visa )?sponsorship/i,
  /must (already )?(have|hold|possess) (the |a valid )?(right|authori[sz]ation|permit) to work/i,
  /(eu|uk|eea) (work )?(permit|citizenship|right to work) (is )?required/i,
];
const SPONSOR_POS = [
  /visa sponsorship (is )?(available|provided|offered|possible|included)/i,
  /\bwe (can |will |do |are able to |happily |gladly )?(offer |provide |support )?(visa )?sponsor/i,
  /sponsor(ship)? (of |for )?(your |a )?(work )?(visa|permit|blue card)/i,
  /(support|help|assist)(ance)? (with|for|in obtaining) (your |the )?(work )?(visa|permit|blue card|immigration)/i,
  /\b(eu )?blue card\b/i,
  /skilled worker (visa|sponsorship)/i,
  /visa (support|assistance|sponsorship)/i,
];
const RELO_NEG = [/no relocation/i, /relocation (is |assistance is |support is )?not (available|offered|provided)/i];
const RELO_POS = [
  /relocation (package|support|assistance|bonus|allowance|budget|help|costs?)/i,
  /(help|support|assist) (you )?(with )?relocat/i,
  /\bwe (will )?(pay for|cover) (your )?relocation/i,
];
const WORLDWIDE = /\b(worldwide|anywhere in the world|work from anywhere|globally remote|fully remote[^.]{0,30}(any|all) (country|countries|location)|remote[- ]?(global|anywhere)|any location|no location restriction)/i;
const REGION_ONLY = /\b(must (be|reside|live)[^.]{0,30}(in|within) (the )?(eu|europe|uk|united kingdom|us|usa|united states|germany|cet|emea)|eu[- ]based only|europe[- ]based only|only (candidates|applicants) (based )?(in|from)|right to work in (the )?(uk|eu|us))/i;

export interface Classification {
  country: string | null;
  remote_eligibility: 'worldwide' | 'pakistan_allowed' | 'europe_only' | 'specific_countries' | 'onsite' | 'hybrid' | 'unclear';
  pakistan_eligible: 'yes' | 'no' | 'unclear';
  visa_sponsorship: 'yes' | 'no' | 'unclear';
  relocation: 'yes' | 'no' | 'unclear';
  category: 'remote' | 'visa' | 'both' | 'other';
  evidence: Record<string, string>;
}

export function classify(input: {
  title: string; location?: string | null; restriction?: string | null; description?: string | null;
  isRemote?: boolean | null; sourceSponsorFlag?: boolean | null; sourceName: string;
}): Classification {
  const desc = input.description ?? '';
  const restriction = (input.restriction ?? '').trim();
  const loc = input.location ?? '';
  const evidence: Record<string, string> = {};
  const country = detectCountry(loc) ?? detectCountry(restriction);

  let remote: Classification['remote_eligibility'] = 'unclear';
  let pk: Classification['pakistan_eligible'] = 'unclear';
  const r = restriction.toLowerCase();
  const isRemote = input.isRemote ?? /remote/i.test(`${loc} ${restriction} ${input.title}`);

  if (/hybrid/i.test(`${loc} ${input.title}`)) remote = 'hybrid';
  if (isRemote) {
    if (PAKISTAN.test(r) || PAKISTAN.test(loc)) {
      remote = 'pakistan_allowed'; pk = 'yes';
      evidence.eligibility = `${input.sourceName} location restriction: "${restriction || loc}"`;
    } else if (/^(worldwide|anywhere|global|remote)?$/.test(r.replace(/[^a-z]/g, '')) && r !== '' && /worldwide|anywhere|global/.test(r)) {
      remote = 'worldwide'; pk = 'yes';
      evidence.eligibility = `${input.sourceName} location restriction: "${restriction}"`;
    } else if (/worldwide|anywhere|global/.test(r)) {
      remote = 'worldwide'; pk = 'yes';
      evidence.eligibility = `${input.sourceName} location restriction: "${restriction}"`;
    } else if (r) {
      const restrictedToEurope = /europe|\beu\b|eea|emea|cet|cest|gmt/.test(r) || Boolean(detectCountry(r) && detectCountry(r) !== 'Pakistan');
      remote = restrictedToEurope ? 'europe_only' : 'specific_countries';
      pk = /asia|apac|south asia|emea/.test(r) ? 'unclear' : 'no';
      evidence.eligibility = `${input.sourceName} location restriction: "${restriction}"`;
    }
    const ww = findEvidence(desc, [WORLDWIDE]);
    if (ww && pk !== 'no') { remote = 'worldwide'; pk = 'yes'; evidence.eligibility = `Job description: "${ww}"`; }
    const ro = findEvidence(desc, [REGION_ONLY]);
    if (ro) { pk = 'no'; if (remote === 'worldwide' || remote === 'unclear') remote = 'specific_countries'; evidence.eligibility = `Job description: "${ro}"`; }
  } else {
    remote = remote === 'hybrid' ? 'hybrid' : 'onsite';
    pk = 'no';
  }

  let visa: Classification['visa_sponsorship'] = 'unclear';
  const neg = findEvidence(desc, SPONSOR_NEG);
  const pos = findEvidence(desc, SPONSOR_POS);
  if (neg) { visa = 'no'; evidence.sponsorship = `Job description: "${neg}"`; }
  else if (pos) { visa = 'yes'; evidence.sponsorship = `Job description: "${pos}"`; }
  else if (input.sourceSponsorFlag) { visa = 'yes'; evidence.sponsorship = `${input.sourceName} lists this vacancy with its "visa sponsorship" flag. Confirm in the original posting.`; }

  let relo: Classification['relocation'] = 'unclear';
  const rn = findEvidence(desc, RELO_NEG);
  const rp = findEvidence(desc, RELO_POS);
  if (rn) { relo = 'no'; evidence.relocation = `Job description: "${rn}"`; }
  else if (rp) { relo = 'yes'; evidence.relocation = `Job description: "${rp}"`; }

  const isEurope = Boolean(country && country !== 'Pakistan');
  const remoteOk = pk === 'yes';
  const visaOk = visa === 'yes' && isEurope;
  const category = remoteOk && visaOk ? 'both' : remoteOk ? 'remote' : visaOk ? 'visa' : 'other';

  return { country, remote_eligibility: remote, pakistan_eligible: pk, visa_sponsorship: visa, relocation: relo, category, evidence };
}

export function extractApplyEmail(desc: string): string | null {
  const m = /(?:send|email|e-mail|submit|forward)[^.]{0,60}?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i.exec(desc)
    || /mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i.exec(desc);
  return m ? m[1].toLowerCase() : null;
}

export function extraApprovalFlags(desc: string): string[] {
  const flags: string[] = [];
  if (/\b(assessment|take[- ]home|test task|coding challenge|online test|aptitude test|exam)\b/i.test(desc)) flags.push('The application may involve an assessment or test.');
  if (/\b(signature|e-?sign|sign (the|a) (declaration|form)|declaration)\b/i.test(desc)) flags.push('The application may require a signature or legal declaration.');
  if (/\b(application fee|processing fee|pay (a|the) fee|payment required)\b/i.test(desc)) flags.push('The posting mentions a fee — possible scam; never pay to apply.');
  if (/\b(passport|national id|cnic|bank (account|details)|social security|date of birth)\b/i.test(desc)) flags.push('The posting asks for sensitive personal documents or details.');
  return flags;
}

export function titleMatches(title: string, include: string[], exclude: string[]) {
  const t = ` ${title.toLowerCase()} `;
  if (exclude.some((k) => k && t.includes(k.toLowerCase()))) return false;
  if (!include.length) return true;
  return include.some((k) => {
    const kk = k.toLowerCase().trim();
    if (!kk) return false;
    if (kk.length <= 3) return new RegExp(`(^|[^a-z])${kk}([^a-z]|$)`).test(t);
    return t.includes(kk);
  });
}
