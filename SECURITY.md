# Security Policy

## Status

**Pre-development.** No code is deployed and no user data exists. This policy is
published in advance so the process is in place before there is anything to report.

---

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository (Security → Report a vulnerability), or contact the maintainer
directly.

Please include:

- Type of issue and where it occurs
- Steps to reproduce
- Potential impact
- Any proof-of-concept, if you have one

### What to expect

| Stage | Target |
|---|---|
| Acknowledgement | Within 72 hours |
| Initial assessment | Within 7 days |
| Fix or mitigation plan | Depends on severity; communicated with the assessment |
| Public disclosure | After a fix ships, coordinated with you |

Reporters are credited unless they prefer otherwise.

> **Honest note:** this is a single-maintainer project. Response targets are genuine
> commitments, but there is no on-call rotation behind them. If something is critical and
> unacknowledged after 72 hours, please escalate publicly — that is appropriate, not
> rude.

---

## What we consider high severity

Weighted by this project's particular risks:

| Severity | Examples |
|---|---|
| **Critical** | Exposure of contributor voice recordings or PII · authentication bypass · cross-user access to review data |
| **High** | Content injection reaching learners · privilege escalation · token theft |
| **Medium** | Rate-limit bypass · information disclosure without PII |
| **Low** | Issues requiring physical device access or unrealistic preconditions |

**Anything exposing contributor voice data is treated as critical regardless of technical
severity.** Contributors trust us with recordings of their own voices, sometimes of
elders, sometimes of material that exists nowhere else. A breach there is not merely a
security incident — it is a breach of the commitments in
[Data Governance](docs/09-DATA-GOVERNANCE.md), and it would be reported to affected
contributors directly.

---

## Design commitments

Security properties built into the architecture rather than added later:

| Property | Mechanism |
|---|---|
| Passwords never recoverable | argon2id; never logged, never stored plainly |
| Learner voice stays local | Pitch analysis runs on-device; audio is not transmitted (FR-070, NFR-033) |
| Session compromise limited | Short-lived access tokens; refresh rotation; reuse invalidates the token family |
| No cross-user writes | `userId` derived from the authenticated token; client-supplied values ignored |
| Content integrity | Bundles content-addressed; SHA-256 verified after download |
| No PII in logs | Enforced in logging configuration |
| No third-party trackers | Committed policy; no analytics SDKs |

See [Architecture §11](docs/05-ARCHITECTURE.md).

---

## Scope

**In scope:** application code, API, mobile client, content pipeline, infrastructure
configuration in this repository.

**Out of scope:** vulnerabilities in third-party dependencies (report upstream, though we
appreciate being told), social engineering, physical attacks, denial of service against
development infrastructure.

---

## Safe harbour

We will not pursue legal action against researchers who:

- Act in good faith to identify and report vulnerabilities
- Avoid privacy violations, data destruction, and service degradation
- Do not access, modify, or retain data beyond what is needed to demonstrate the issue
- Give us reasonable time to remediate before public disclosure

Thank you for helping keep contributors' data safe.
