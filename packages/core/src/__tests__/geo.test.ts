import { describe, it, expect } from 'vitest';
import {
  canContributeAudio,
  canVoteOnContribution,
  isValidCountryCode,
  isSpokenIn,
  ContributionDenial,
} from '../geo.js';

const gikuyuCentral = { id: 'ki-central', countryCode: 'KE', communityRegion: 'Nyeri, Central' };
const yorubaOyo = { id: 'yo-oyo', countryCode: 'NG', communityRegion: 'Oyo' };

const kenyan = { homeCountryCode: 'KE', verifiedDialects: ['ki-central'] };
const nigerian = { homeCountryCode: 'NG', verifiedDialects: ['yo-oyo'] };

describe('isValidCountryCode', () => {
  it('accepts ISO 3166-1 alpha-2', () => {
    for (const code of ['KE', 'NG', 'UG', 'TZ', 'ZA']) {
      expect(isValidCountryCode(code)).toBe(true);
    }
  });

  it('rejects lowercase, wrong length, and non-letters', () => {
    for (const code of ['ke', 'KEN', 'K', '', 'K1', '  ']) {
      expect(isValidCountryCode(code)).toBe(false);
    }
  });
});

describe('canContributeAudio', () => {
  it('allows a verified contributor in the matching country', () => {
    expect(canContributeAudio(kenyan, gikuyuCentral).allowed).toBe(true);
  });

  /** The rule the task exists to enforce. */
  it('refuses a Kenyan contributor for a Nigerian dialect', () => {
    const decision = canContributeAudio(kenyan, yorubaOyo);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe(ContributionDenial.CountryMismatch);
      expect(decision.message).toContain('KE');
      expect(decision.message).toContain('NG');
    }
  });

  it('refuses a Nigerian contributor for a Kenyan dialect', () => {
    const decision = canContributeAudio(nigerian, gikuyuCentral);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe(ContributionDenial.CountryMismatch);
  });

  /** Right country is not sufficient — competence must also be established. */
  it('refuses an unverified contributor even in the correct country', () => {
    const decision = canContributeAudio(
      { homeCountryCode: 'KE', verifiedDialects: [] },
      gikuyuCentral,
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe(ContributionDenial.NotVerified);
  });

  it('refuses when verified for a different dialect in the same country', () => {
    const decision = canContributeAudio(
      { homeCountryCode: 'KE', verifiedDialects: ['luo-siaya'] },
      gikuyuCentral,
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe(ContributionDenial.NotVerified);
  });

  /**
   * Country mismatch is reported in preference to non-verification when both
   * apply, because it is the more fundamental refusal and the clearer message.
   */
  it('reports country mismatch first when both conditions fail', () => {
    const decision = canContributeAudio({ homeCountryCode: 'KE', verifiedDialects: [] }, yorubaOyo);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe(ContributionDenial.CountryMismatch);
  });

  // --- Diaspora override -------------------------------------------------
  //
  // OFF by default, matching the strict specification. These tests pin the
  // behaviour of both settings so the policy cannot drift silently — the
  // consequence is documented in ADR-0009 and is the project's to decide.

  it('still refuses a verified diaspora contributor by default', () => {
    const diaspora = { homeCountryCode: 'GB', verifiedDialects: ['yo-oyo'] };
    expect(canContributeAudio(diaspora, yorubaOyo).allowed).toBe(false);
  });

  it('admits a verified diaspora contributor when the override is enabled', () => {
    const diaspora = { homeCountryCode: 'GB', verifiedDialects: ['yo-oyo'] };
    expect(
      canContributeAudio(diaspora, yorubaOyo, { allowDiasporaOverride: true }).allowed,
    ).toBe(true);
  });

  /** The override relaxes geography, never verification. */
  it('override does not admit an unverified contributor', () => {
    const unverified = { homeCountryCode: 'GB', verifiedDialects: [] };
    const decision = canContributeAudio(unverified, yorubaOyo, { allowDiasporaOverride: true });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe(ContributionDenial.CountryMismatch);
  });
});

describe('canVoteOnContribution', () => {
  const reviewer = { ...kenyan, userId: 'reviewer-1' };

  it('allows a verified in-country reviewer', () => {
    expect(
      canVoteOnContribution(reviewer, gikuyuCentral, { contributorId: 'someone-else' }).allowed,
    ).toBe(true);
  });

  /** FR-106: consensus by one person is not consensus. */
  it('refuses self-review', () => {
    const decision = canVoteOnContribution(reviewer, gikuyuCentral, {
      contributorId: 'reviewer-1',
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe(ContributionDenial.SelfReview);
  });

  /** Self-review is checked first: it applies regardless of geography. */
  it('reports self-review ahead of a country mismatch', () => {
    const decision = canVoteOnContribution(reviewer, yorubaOyo, { contributorId: 'reviewer-1' });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe(ContributionDenial.SelfReview);
  });

  it('refuses a Kenyan reviewer voting on a Nigerian dialect', () => {
    const decision = canVoteOnContribution(reviewer, yorubaOyo, { contributorId: 'other' });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe(ContributionDenial.CountryMismatch);
  });

  it('refuses an unverified in-country reviewer', () => {
    const decision = canVoteOnContribution(
      { homeCountryCode: 'KE', verifiedDialects: [], userId: 'r2' },
      gikuyuCentral,
      { contributorId: 'other' },
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe(ContributionDenial.NotVerified);
  });

  it('honours the diaspora override', () => {
    const diaspora = { homeCountryCode: 'US', verifiedDialects: ['yo-oyo'], userId: 'r3' };
    expect(
      canVoteOnContribution(diaspora, yorubaOyo, { contributorId: 'other' }, {
        allowDiasporaOverride: true,
      }).allowed,
    ).toBe(true);
  });
});

describe('isSpokenIn', () => {
  /**
   * Most African languages cross borders — colonial boundaries were drawn
   * without regard to speech communities. A single-country model would
   * misclassify the majority of the continent's languages.
   */
  const swahili = { countryCode: 'TZ', alsoSpokenIn: ['KE', 'UG', 'CD', 'RW', 'BI'] };
  const gikuyu = { countryCode: 'KE', alsoSpokenIn: [] as string[] };

  it('matches the primary country', () => {
    expect(isSpokenIn(swahili, 'TZ')).toBe(true);
    expect(isSpokenIn(gikuyu, 'KE')).toBe(true);
  });

  it('matches additional countries', () => {
    expect(isSpokenIn(swahili, 'KE')).toBe(true);
    expect(isSpokenIn(swahili, 'CD')).toBe(true);
  });

  it('rejects a country where the language is not natively spoken', () => {
    expect(isSpokenIn(swahili, 'NG')).toBe(false);
    expect(isSpokenIn(gikuyu, 'UG')).toBe(false);
  });
});
