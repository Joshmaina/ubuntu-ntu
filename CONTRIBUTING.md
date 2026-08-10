# Contributing to UBUNTU-NTU

**You do not need to be a programmer to contribute here.** The most valuable thing this
project needs is someone who speaks an African language natively. That is a skill we
cannot code our way around.

---

## Ways to contribute

| You are | What you can do | Technical skill needed |
|---|---|---|
| **A native speaker** | Record phrases · check whether recordings are correct · flag mistakes | None |
| **An elder** | Record proverbs, stories, oral history | None |
| **A linguist** | Validate content · define orthography · serve as a designated authority | None |
| **A teacher** | Design lesson sequences · suggest what learners actually need | None |
| **A translator** | Add anchor-language translations | None |
| **A developer** | Build the system | Yes |
| **A designer** | Interface and accessibility | Some |
| **An institution** | Partner on a pilot language | None |

---

## Contributing language content

This is the highest-value contribution, and the one we most need.

### Right now (pre-development)

The system is not built yet. **What we need at this stage is people and communities, not
recordings.** Open an issue or start a discussion if:

- You speak an African language and would be willing to contribute later
- You are part of a community that would want to be the pilot language
- You can help identify a designated linguistic authority
- You represent an institution that could partner

Please do not send recordings yet — we cannot yet honour our own governance commitments
around consent and storage, and we would rather wait than collect data we cannot
properly steward.

### Once the system exists

Lesson content is plain text files under version control. To propose a correction, no
software needs installing:

1. Find the file on github.com under `content/`
2. Click the pencil (edit) icon
3. Make your change
4. Describe what you changed and why, then click **Propose changes**

Automated checks run immediately, and a maintainer reviews. If something is wrong with
your change, you will get a comment explaining what — not a rejection.

**If GitHub is a barrier for you, open an issue and describe the correction in plain
words.** Someone will make the edit and credit you. The tooling is our problem, not
yours.

---

## Reporting a language error

**Please do this.** An incorrect phrase actively teaches someone wrong, which is worse
than teaching nothing.

Open an issue with:

- Which lesson or phrase
- What is wrong
- What it should be
- Which variety you speak, and where you are from
- Whether it is *wrong everywhere* or *different in your variety*

That last point matters a great deal. Varieties differ legitimately, and our default is
to **record both, labelled by origin** — not to declare a winner. See
[Data Governance §8.3](docs/09-DATA-GOVERNANCE.md).

---

## Contributing code

### Setup

**Prerequisites:** Node ≥ 20 · pnpm ≥ 9 · Docker Desktop · Android Studio (from M4). All
free.

```bash
git clone <repo> && cd ubuntu-ntu
pnpm install
docker compose up -d
pnpm migrate && pnpm seed
pnpm dev
```

### Before you start

Read, in this order:

1. [Architecture](docs/05-ARCHITECTURE.md) — particularly the three key decisions
2. [Technical Roadmap](docs/06-TECHNICAL-ROADMAP.md) — where we are
3. The [ADRs](docs/adr/) relevant to what you are touching

**Please open an issue before starting significant work.** We would rather discuss an
approach than decline a finished pull request.

### Branches and commits

```
feat/<milestone>-<description>     fix/<description>     content/<lang>-<scope>
```

Conventional Commits, citing requirement IDs where applicable:

```
feat(core): implement FSRS stability on recall  [FR-080]
fix(sync): dedupe review events by client UUID   [FR-091]
content(yo): correct tone marks on market vocabulary
```

### Definition of done

- [ ] Tests written and passing
- [ ] `pnpm typecheck` and `pnpm lint` clean
- [ ] CI green
- [ ] Requirement IDs cited where applicable
- [ ] Docs updated if behaviour changed

### Rules that are not negotiable

**`packages/core` imports nothing.** No dependencies, no Node built-ins, no I/O, no clock
reads, no randomness. Time is always an explicit parameter. Enforced in CI. This is what
makes client and server incapable of diverging — see
[ADR-0002](docs/adr/0002-shared-learning-core.md).

**Nothing may require the network on the answer-checking path.** Offline is the primary
mode, not a fallback.

**No third-party analytics, tracking, or advertising SDKs.** Committed in
[Data Governance §10](docs/09-DATA-GOVERNANCE.md).

**Voice recordings do not leave the device** without explicit, separate consent.

### Adding a dependency

Answer these in the pull request:

- Is it necessary, or is this ~50 lines of our own code?
- Licence compatible with Apache-2.0?
- Commits within the last 12 months?
- Cost at zero users and at 10,000?
- What replaces it if abandoned?
- Added to [the ledger](docs/10-DEPENDENCIES.md)?

---

## Reporting bugs

Include: what happened, what you expected, steps to reproduce, device and OS version,
and **whether you were online or offline**. That last one resolves a surprising
proportion of reports.

---

## Community standards

Read the [Code of Conduct](CODE_OF_CONDUCT.md). Two points specific to this project:

**Language disagreements are usually not disagreements.** Two speakers saying different
things are typically both correct for their own variety. Assume that first.

**No variety is "broken" or "corrupted."** Rural, urban, diaspora, and youth varieties
are all legitimate objects of study and preservation. Comments framing one variety as
degraded are not welcome here.

---

## Recognition

Contributors are **credited by name** — in the repository, and in the app itself when a
learner hears their recording:

> 🔊 *"Mo ń lọ sí ọjà."* — spoken by **Adunni**, Ibadan

This is deliberate. Anonymity is available on request, but attribution is the default,
because anonymous voices powering a product is the extractive model we are explicitly
trying not to reproduce.

---

## Questions

Open a discussion. There are no bad questions — this project spans linguistics, mobile
engineering, audio signal processing, and data ethics, and nobody is expert in all four.
