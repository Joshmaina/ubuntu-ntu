# UBUNTU-NTU — Concept Note

> **Document status:** Draft v0.1 · 2026-08-10
> **Audience:** Funders, grant committees, universities, cultural institutions,
> language boards, telecom partners, NGOs, and prospective institutional collaborators.
> **Format note:** Structured to the conventional concept-note sequence used by most
> development and cultural-heritage funders, so that sections can be lifted directly
> into application forms.

---

## Summary

| | |
|---|---|
| **Project title** | UBUNTU-NTU — Open Infrastructure for African Language Learning and Preservation |
| **Thematic area** | Digital inclusion · Cultural heritage preservation · Education technology · Open language data |
| **Stage** | Pre-development. Architecture and documentation complete; implementation beginning. |
| **Duration (proposed)** | 18 months to public pilot release |
| **Geographic focus** | Sub-Saharan Africa (pilot: one language community, to be confirmed), plus global diaspora |
| **Delivery model** | Open-source software, openly licensed language corpus, community-governed data |
| **Current funding** | None. Development is self-funded and deliberately architected to require zero paid services during the build phase. |

---

## 1. The problem

Africa is home to roughly one third of the world's living languages. Digital language
technology serves almost none of them.

This produces a compounding exclusion:

**Technological.** Contemporary language tools are built from large digital text
corpora. African languages are *low-resource* — insufficient machine-readable text
exists to apply the standard method. Commercial actors assess the market as unservable
and withdraw. The absence of data causes the absence of tools, and the absence of tools
means no new data is generated. The loop closes.

**Pedagogical.** The few available products model language as text-to-text
translation. This fails structurally for African languages, which are frequently
*tonal* (pitch changes meaning), *agglutinative* (one word encodes what English needs a
clause for), and *socially indexed* (correct address depends on the relative age and
status of the speakers). A learner may complete such a course and remain unable to
hear, speak, or appropriately use the language.

**Infrastructural.** Mainstream applications assume continuous, affordable, fast
connectivity. Across much of the continent, mobile data is expensive relative to
income, coverage is intermittent, and devices are mid-range Android. Software built on
the always-online assumption is not merely degraded in these conditions — it is
unusable.

**The human cost.** Intergenerational transmission is breaking. Urban youth understand
their mother tongue but cannot speak it. Diaspora families lose a heritage language
within one generation. When the last fluent speakers of a language die, an entire
system of knowledge — proverbs, oral history, ecological and medicinal vocabulary,
cosmology — is extinguished with them.

> **Sourcing note.** Quantitative claims in this section require citation to a
> recognised authority (UNESCO Atlas of the World's Languages in Danger; Ethnologue;
> UNESCO Institute for Statistics) with an access date before submission to any funder.
> Unsourced figures are the single most common reason technically sound concept notes
> are rejected. See [01-VISION.md §8](01-VISION.md#8-open-questions).

---

## 2. Why existing approaches have not solved it

| Approach | Why it falls short |
|---|---|
| Mainstream commercial language apps | Serve a handful of African languages; text-centric; online-dependent; no tonal instruction; no path for community contribution |
| Academic documentation projects | Produce excellent archives, but the output is inaccessible to the communities it records — papers and datasets, not usable learning tools |
| Machine translation | Requires parallel corpora that do not exist at the necessary scale for most African languages |
| Ad-hoc community efforts (WhatsApp groups, YouTube) | Genuine enthusiasm and real reach, but no structure, no persistence, no quality control, no archival value |

**The gap:** no one is building a system where *learning* and *preservation* are the
same activity — where the act of teaching a language generates the dataset that
preserves it, and the dataset in turn improves the teaching.

That closed loop is the core proposition of this project.

---

## 3. Proposed solution

An integrated system of four components:

**3.1 An offline-first learner application.** Android-first, designed for mid-range
devices and intermittent connectivity. Lessons download as compact bundles and function
entirely without a network connection. Progress synchronises opportunistically.

**3.2 Pedagogy designed for African language structure.** Two distinctive mechanisms:

- *Scaffolded Sentence Deconstruction* — the learner receives meaning in their own
  language first, then a morpheme-by-morpheme literal breakdown, then slowed audio, then
  native-speed audio. Cognitive load is removed one layer at a time rather than imposed
  all at once.
- *Pitch contour visualisation* — for tonal languages, the learner's pitch is rendered
  against the native speaker's on screen, normalised so that voices of different natural
  pitch can be fairly compared. Tone becomes visible and therefore learnable.

**3.3 A community contribution pathway.** Native speakers, elders, students, and
linguists contribute recordings and corrections. Submissions pass peer validation before
publication. Contributors are credited by name within the app.

**3.4 An open language archive.** Validated recordings, transcriptions, and
morphological glosses form a permanent, openly licensed corpus available to researchers,
educators, and future technologists.

### The self-reinforcing loop

```text
   Community records  ──────►  Peer validation  ──────►  Lessons published
          ▲                                                      │
          │                                                      ▼
   Archive grows  ◄──────  Corpus released  ◄──────  Learners learn & correct
```

Each learner interaction improves the content. Each contribution enlarges the archive.
The archive lowers the barrier for every subsequent project in that language — including
projects we will never build ourselves.

---

## 4. Beneficiaries

| Group | Need addressed |
|---|---|
| **Urban African youth (16–35)** | A private, non-judgemental route from passive comprehension to active speech |
| **Global African diaspora** | A credible tool for transmitting heritage language to children raised abroad |
| **Language communities & elders** | Digital preservation of oral knowledge, under community control, with attribution |
| **Schools and universities** | Teaching material and a documentation platform for local-language instruction |
| **NLP researchers** | Consented, labelled speech data for languages currently absent from the field |

---

## 5. Expected outcomes

Separated into what the system guarantees structurally and what depends on adoption —
a distinction we hold deliberately, because conflating the two damages credibility.

### Guaranteed by construction

- A permanent, openly licensed corpus of validated speech, transcription, and
  morphological gloss for at least one African language.
- Open-source, reusable software infrastructure that any other language community can
  deploy for their own language at zero licensing cost.
- A documented, replicable methodology for community-governed language data collection.

**Even if the application achieves no adoption, these outputs persist and retain value.**
We consider this the floor of the project, and we state it plainly rather than promising
only best-case results.

### Dependent on adoption

- Measurable gains in spoken competence among active learners.
- An active, self-sustaining contributor community.
- Demonstrated intergenerational transmission within diaspora families.

### Indicators

| Indicator | Instrument |
|---|---|
| Validated recordings in the archive | Direct database count |
| Distinct contributors; 90-day retention | Platform analytics |
| Learners completing spoken exercises at week 4 | In-app telemetry (privacy-preserving) |
| Proportion of sessions completed fully offline | Client-side telemetry |
| Pronunciation accuracy trend over time | Pitch-contour deviation, cohort-level |
| Corpus downloads by third parties | Archive access logs |

---

## 6. Approach and phasing

| Phase | Duration | Focus | Verifiable output |
|---|---|---|---|
| **0 — Foundation** | Months 1–2 | Architecture, documentation, governance framework | Public repository; documentation set; data-governance policy |
| **1 — Core engine** | Months 3–5 | Learning engine, offline storage, synchronisation | Working prototype: one lesson, fully offline, verified |
| **2 — Pilot content** | Months 6–9 | First language, ~50 lessons, community validation | Complete pilot syllabus, community-approved |
| **3 — Contribution pathway** | Months 10–13 | Recording, validation, attribution tooling | Live contributor workflow; first external submissions |
| **4 — Public pilot** | Months 14–18 | Release, measurement, first archive publication | Public Android release; corpus v1 published |

**Design constraint:** Phases 0–2 are architected to require **no paid infrastructure**.
All development runs on free, open-source, locally hosted tooling. Funding requirements
begin at Phase 3, when hosting, storage, and community incentives become necessary. This
means the project produces demonstrable, working output *before* any funding request —
we intend to show, not describe.

---

## 7. Governance and data ethics

Language data is not neutral raw material. It is the cultural property of the community
that produced it, and the history of extraction from African communities by outside
researchers is long and not yet over. Our commitments:

- **Community ownership.** Contributed data is held in custody, not owned. Communities
  retain the right to determine its use, including the right to withdraw.
- **Informed consent in the contributor's own language.** Consent is meaningless if it
  is written only in English.
- **Attribution by default,** with anonymity available on request.
- **Open licensing** chosen jointly with community representatives, not imposed.
- **No commercial resale** of community-contributed language data.
- **Right of correction** — any community may dispute and correct how their language is
  represented.

Full policy: [09-DATA-GOVERNANCE.md](09-DATA-GOVERNANCE.md).

---

## 8. Sustainability

The project is designed so that the preservation outcome does not depend on commercial
success.

**Near term (no funding required).** Development proceeds on free tooling. The corpus
accumulates from the first day of content work.

**Medium term.** Diaspora subscriptions — families abroad who value heritage
transmission and have the ability to pay — cross-subsidise free access for users on the
continent. Access to a community's own language is never paywalled for that community.

**Institutional.** Partnerships with universities and cultural bodies for content
authorship and validation. Grants for endangered-language documentation.

**Infrastructural.** Zero-rating agreements with mobile network operators to eliminate
data cost as a barrier.

**Failure mode by design.** If the product does not achieve sustainability, the corpus
and the software remain openly licensed and permanently available. The preservation work
is not lost with the business.

---

## 9. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Tone-visualisation does not measurably improve pronunciation | **High** — it is the core differentiator | Test the hypothesis in Phase 1 with a small cohort, before building on it |
| Insufficient community contributors | High | Anchor with an institutional partner before public launch; do not rely on organic volunteering |
| Orthography disputes within a language community | Medium | Community authority designated in advance; support variants rather than adjudicating |
| Extraction concerns damage community trust | High | Governance framework published *before* first data collection, not after |
| Data costs deter users | Medium | Aggressive compression; offline-first; peer-to-peer lesson sharing; zero-rating |
| Single-maintainer dependency | Medium | Open source from day one; documented architecture; content in plain text under version control |

We regard the first row as the genuine existential risk and have structured Phase 1 to
test it early rather than defer it.

---

## 10. What we are seeking

Not funding, initially. In order of usefulness:

1. **Community partnership** — a language community willing to co-design the pilot and
   designate a linguistic authority for content correctness.
2. **Institutional collaboration** — a university linguistics department or cultural
   institute for validation and content authorship.
3. **Native-speaker contributors** — for the pilot language.
4. **Technical collaboration** — with existing African NLP initiatives.
5. **Funding** — from Phase 3, for hosting, contributor incentives, and community
   coordination.

---

## 11. Contact

| | |
|---|---|
| **Repository** | *(to be added on publication)* |
| **Maintainer** | Joshua Maina |
| **Status** | Open to partnership; actively seeking pilot language community |

---

*This concept note describes a project in active development. Figures marked for
verification are flagged as such and must be sourced before external submission. We
would rather present a document with visible gaps than one with invisible errors.*
