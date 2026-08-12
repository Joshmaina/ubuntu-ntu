/**
 * Geographic scoping rules for dialects and contributions (ADR-0009).
 *
 * Pure decision logic, deliberately placed in core: it is the rule that decides
 * who may speak for a community, so it must be exhaustively testable and must
 * behave identically wherever it runs.
 */

export const ContributionDenial = {
  CountryMismatch: 'DIALECT_GEOGRAPHIC_MISMATCH',
  NotVerified: 'DIALECT_NOT_VERIFIED',
  SelfReview: 'SELF_REVIEW_FORBIDDEN',
} as const;

export type ContributionDenial =
  (typeof ContributionDenial)[keyof typeof ContributionDenial];

export type ContributionDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly code: ContributionDenial; readonly message: string };

export interface ContributorScope {
  readonly homeCountryCode: string;
  /** Dialect ids this contributor has been verified for by an authority. */
  readonly verifiedDialects: readonly string[];
}

export interface DialectScope {
  readonly id: string;
  readonly countryCode: string;
  readonly communityRegion: string;
}

const ALLOWED = { allowed: true } as const;

/** ISO 3166-1 alpha-2: exactly two uppercase letters. */
export function isValidCountryCode(code: string): boolean {
  return /^[A-Z]{2}$/.test(code);
}

/**
 * May this contributor submit audio for this dialect?
 *
 * BOTH conditions must hold:
 *   1. home country matches the dialect's country
 *   2. the dialect appears in their verified list
 *
 * Rule 1 is the geographic lock the task specifies. It has a known consequence
 * documented in ADR-0009: a diaspora speaker — a Yoruba speaker in London whose
 * home country is GB — is refused regardless of fluency, even though the
 * diaspora is a primary audience in 02-CONCEPT-NOTE.md.
 *
 * `allowDiasporaOverride` exists so that policy can be changed by configuration
 * rather than by editing this rule. It is OFF by default, matching the strict
 * specification; when on, a verified contributor passes on competence alone.
 */
export function canContributeAudio(
  contributor: ContributorScope,
  dialect: DialectScope,
  options: { readonly allowDiasporaOverride?: boolean } = {},
): ContributionDecision {
  const verified = contributor.verifiedDialects.includes(dialect.id);
  const sameCountry = contributor.homeCountryCode === dialect.countryCode;

  if (options.allowDiasporaOverride === true && verified) return ALLOWED;

  if (!sameCountry) {
    return {
      allowed: false,
      code: ContributionDenial.CountryMismatch,
      message:
        `contributor home country ${contributor.homeCountryCode} does not match ` +
        `dialect ${dialect.id} (${dialect.countryCode}, ${dialect.communityRegion})`,
    };
  }

  if (!verified) {
    return {
      allowed: false,
      code: ContributionDenial.NotVerified,
      message: `contributor is not verified for dialect ${dialect.id}`,
    };
  }

  return ALLOWED;
}

/**
 * May this reviewer vote on this submission?
 *
 * Same geographic and verification rules, plus FR-106: nobody validates their
 * own recording. Consensus by one person is not consensus.
 */
export function canVoteOnContribution(
  reviewer: ContributorScope & { readonly userId: string },
  dialect: DialectScope,
  submission: { readonly contributorId: string },
  options: { readonly allowDiasporaOverride?: boolean } = {},
): ContributionDecision {
  if (reviewer.userId === submission.contributorId) {
    return {
      allowed: false,
      code: ContributionDenial.SelfReview,
      message: 'a contributor cannot validate their own submission',
    };
  }

  return canContributeAudio(reviewer, dialect, options);
}

/**
 * Is this language natively spoken in this country?
 *
 * Checks the primary country AND the additional list, because most African
 * languages cross borders — Swahili spans KE/TZ/UG/CD, Hausa NG/NE/GH/CM,
 * Somali SO/ET/KE/DJ. Treating the primary country as the only truth would
 * misclassify the majority of the continent's languages.
 */
export function isSpokenIn(
  language: { readonly countryCode: string; readonly alsoSpokenIn: readonly string[] },
  countryCode: string,
): boolean {
  return language.countryCode === countryCode || language.alsoSpokenIn.includes(countryCode);
}
