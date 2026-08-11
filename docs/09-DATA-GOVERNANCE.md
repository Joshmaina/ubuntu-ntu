# Language Data Governance & Ethics

> **Document status:** Draft v0.1 · 2026-08-10
> **Audience:** Communities, contributors, partners, funders, developers.
> **Standing:** This is a binding commitment, not a statement of intent. Where it
> conflicts with a product goal, **this document wins.**
>
> ⚠️ **Not yet legally reviewed.** This is a good-faith policy draft. Before any data
> collection begins, it requires review by a lawyer competent in the relevant
> jurisdiction(s) and — more importantly — review and amendment by representatives of
> the pilot language community. A governance policy written *about* a community without
> *consulting* that community reproduces the exact problem it claims to solve.

---

## 1. Why this document exists, and why it exists early

There is a long and unfinished history of African communities being studied, recorded,
and extracted from by outside researchers and companies who took the results, published
or monetised them, and returned nothing. Language data has been a particular site of
this: recordings gathered under vague permissions, archived in foreign institutions,
inaccessible to the people who produced them.

We are building a system whose entire value depends on people trusting us with their
voices, their languages, and in some cases oral knowledge that exists nowhere else.

**That trust must be earned before it is requested, not after.** This document is
therefore published *before* the first recording is collected. If we published it
afterwards, it would be a justification rather than a commitment.

---

## 2. Foundational position

> **The community owns the language. We are custodians of a collection of recordings.**

This is a real distinction with practical consequences. A custodian:

- holds something on behalf of another
- cannot sell it
- must return or release it on request
- is accountable for how it is used
- does not get to decide unilaterally what it is for

Everything below follows from this.

---

## 3. Frameworks we align with

We do not claim formal certification against these. We state them so our conduct can be
measured against a published standard rather than our own assurances.

### CARE Principles for Indigenous Data Governance

| Principle | Our application |
|---|---|
| **Collective benefit** | Data must benefit the source community first: free access to their own language, free archive access, attribution |
| **Authority to control** | The community determines how their language data is represented, licensed, and used |
| **Responsibility** | We are accountable to the community, not merely to funders or users |
| **Ethics** | Community rights and wellbeing take precedence over dataset growth |

### FAIR Principles

Findable, Accessible, Interoperable, Reusable — applied to the archive so it has
scientific and educational value.

**Where CARE and FAIR conflict, CARE prevails.** Openness is a means, not the goal. A
community's right to restrict use of sacred, ceremonial, or otherwise sensitive material
overrides the general preference for open data. We will not publish something merely
because publishing is the default.

---

## 4. Consent

### 4.1 Standard

Consent must be **informed, specific, freely given, revocable, and comprehensible.**

### 4.2 In the contributor's own language

> Consent presented only in English is not consent from someone who does not read
> English fluently.

Consent text is translated into the contributor's language and offered as **audio as
well as text**, because literacy and orality do not align uniformly, and a project about
oral language that requires literacy to consent has failed at its own premise.

### 4.3 What is disclosed before first contribution

Plainly, without legal obfuscation:

1. What is recorded and stored
2. That it may be published in a public, openly licensed archive
3. That it may be used to train language technology
4. Whether their name will be attached, and that they may choose otherwise
5. That they may withdraw, and precisely what withdrawal can and cannot undo
6. That they will not be paid unless separately agreed
7. Who to contact with a concern

### 4.4 Specific consent for distinct uses

Separate, individually revocable:

| Use | Default |
|---|---|
| Publish in the learning app | Opt-in |
| Include in the public open archive | Opt-in |
| Use for ASR / language model training | **Opt-in, separately** |
| Attribute by name | Opt-in, defaulting to attributed |
| Contact for follow-up | Opt-in |

Bundling these into a single checkbox would be the easy path and is precisely what we
are refusing to do.

### 4.5 Consent for those who cannot give it directly

Elders with diminished capacity, minors, and deceased speakers whose recordings exist in
family hands require community-mediated consent through a designated representative.
**Where this is unclear, we do not collect.**

---

## 5. Withdrawal

### 5.1 The right

Any contributor may withdraw any submission at any time, for any reason, without
explanation.

### 5.2 What withdrawal achieves

| Effect | Achievable |
|---|---|
| Removed from the app | ✅ Yes, on next content build |
| Removed from future archive releases | ✅ Yes |
| Removed from our storage | ✅ Yes, within 30 days |
| Removed from **already-distributed** archive copies | ❌ **No** |
| Removed from models already trained on it | ❌ **No** |

### 5.3 Honesty about the limits

The last two rows are stated prominently, in the consent flow itself, before first
contribution.

Once an openly licensed dataset has been downloaded by third parties, we cannot recall
those copies. Any project claiming otherwise is either misleading contributors or does
not understand its own distribution model. A contributor deciding whether to participate
deserves to know this in advance, when the decision is still theirs to make — not
afterwards, when it is not.

---

## 6. Licensing

### 6.1 Provisional, and subject to community agreement

| Asset | Proposed licence |
|---|---|
| Source code | Apache-2.0 |
| Documentation | CC BY 4.0 |
| Language corpus | **CC BY-SA 4.0 — provisional** |

### 6.2 Why the corpus licence is not yet settled

Open licensing serves preservation: it means the data survives us and is usable by
researchers, educators, and the community itself.

But open licensing also means **anyone may use it, including commercially.** A large
technology company could incorporate a community's language data into a product and
return nothing. Some communities will accept that as the cost of preservation. Others
will not, and that refusal is legitimate.

**We will not impose this choice.** The corpus licence is decided jointly with the pilot
community before first release. Options under consideration include CC BY-SA 4.0, CC BY-NC
4.0, and community-specific licences such as those developed by Local Contexts / Traditional
Knowledge Labels.

### 6.3 What we commit to regardless

- We will not sell community-contributed language data.
- We will not grant exclusive rights to any third party.
- We will not relicense contributed data without community agreement.
- If the project is acquired or dissolved, the corpus transfers to a community or
  academic custodian — never to a commercial acquirer as an asset.

That last commitment matters more than it may appear. It is the point at which most
well-intentioned projects quietly fail their contributors.

---

## 7. Attribution

Default: **contributors are named.**

> 🔊 *"Mo ń lọ sí ọjà."* — spoken by **Adunni**, Ibadan

Because the alternative — anonymous voices powering a product — is the extractive model
in miniature. Contributors are participants in a cultural project, not an unnamed data
source.

Anonymity remains available on request and is honoured completely.

---

## 8. Community authority

### 8.1 Designated authority

Each language variety has a **designated linguistic authority** — a person or body,
recognised by the community, who can rule on correctness. This is recorded in the content
files and is a hard publication gate (see
[07-CONTENT-MODEL.md §5.2](07-CONTENT-MODEL.md)): content in a variety with no named
authority **cannot be published**, enforced in CI.

### 8.2 Rights of the community

| Right | Mechanism |
|---|---|
| Correct representation of the language | Dispute process; corrections prioritised |
| Restrict sensitive material | Excluded from archive on request, no justification required |
| Access all data about their language | Free bulk export, permanently |
| Withdraw community-wide participation | Full removal from app and future releases |
| Be consulted on licensing | Required before corpus release |

### 8.3 Dialect disputes

Where communities disagree about correct form, our default is to **represent both, labelled
by origin.** We are not an arbiter of linguistic correctness, and attempting to be one
would be both presumptuous and wrong.

Only where variants would actively mislead learners does an authority decide — and that
decision is recorded transparently with its rationale.

---

## 9. Learner privacy

Distinct from contributor data and equally binding.

| Data | Treatment |
|---|---|
| Voice recordings for pronunciation practice | **Never leave the device.** Analysed on-device, discarded after use (FR-070, NFR-033) |
| Review history | Synced; used only for scheduling and aggregate analytics |
| Location | Not collected |
| Contacts, device identifiers beyond installation ID | Not collected |
| Analytics | Aggregate only; no PII; no third-party trackers |

A learner practising pronunciation is often self-conscious. That audio is theirs and
does not need to exist anywhere else. This is a technical guarantee enforced by
architecture (analysis runs on-device), not a policy promise that could be quietly
reversed in a later release.

---

## 9a. Images (ADR-0008)

Images are governed exactly as audio is — consent, attribution, withdrawal — with
additional protections, because a photograph carries risks a short voice clip
does not.

### Why images are treated as higher-risk

| Concern | Audio | Image |
|---|---|---|
| Identifies the contributor | Sometimes | **Usually, if a person is shown** |
| May capture third parties who never consented | Rarely | **Easily — bystanders, family, neighbours** |
| Third-party copyright | Rare | **Common — artwork, signage, packaging, buildings** |
| Reveals location | No | **Often, and sometimes precisely** |

### Rules

1. **No images of identifiable children.** Not with parental consent, not with
   community consent. A child cannot consent to a photograph being published
   under an open licence and carried for the rest of their life, and a parent
   cannot meaningfully consent on their behalf to permanent open publication. If
   a concept needs a child, use an illustration or leave it out.

2. **Images of adults require that adult's own consent**, separately from the
   contributor's. Photographing someone is not the same as recording yourself.

3. **Prefer objects, places, and actions over people.** Most vocabulary needs no
   human subject at all. This is both safer and usually clearer.

4. **The contributor must hold the rights.** No photographs of artwork,
   packaging, signage, or other people's images. Asserted at upload, and
   spot-checked in review.

5. **Location metadata is stripped** from every uploaded image before storage.
   A contributor should not disclose where they live as a side effect of
   photographing a cooking pot.

6. **Withdrawal works as it does for audio**, with the same honest limit: once an
   openly licensed dataset has been downloaded, we cannot recall those copies
   (§5.3).

### Cultural appropriateness

Some objects, places, and practices are not photographed — sacred sites,
ceremonial items, contexts where photography is intrusive or forbidden. This
varies by community and is not something we can enumerate in advance.

**The designated linguistic authority may veto any image without giving a
reason**, and that veto is final. We do not require a community to explain its
own protocols to us.

### No synthetic imagery

We do not use AI-generated images (ADR-0008). Provenance is unclear, generative
models reproduce the under-representation they were trained on, and a project
whose central claim is *authentic, community-sourced language* cannot illustrate
itself with fabrications.

> ⚠️ **Requires review.** Rule 1 in particular is a firm position taken by the
> maintainer and not yet discussed with any community. Some communities may
> consider it overcautious; children learning their heritage language is a core
> use case, and imagery of children may be exactly what a family wants. This is
> precisely the kind of decision §11 says will not be made unilaterally — it is
> flagged for community consultation before any image collection begins.

---

## 10. What we will not do

Stated explicitly so we can be held to it:

- ❌ Sell community language data
- ❌ Transmit learner practice recordings without explicit separate consent
- ❌ Use dark patterns to obtain consent
- ❌ Bundle unrelated permissions into one agreement
- ❌ Claim ownership of contributed language data
- ❌ Publish material a community has asked us to restrict
- ❌ Include third-party advertising or tracking SDKs
- ❌ Paywall a community's access to their own language
- ❌ Transfer the corpus to a commercial acquirer

---

## 11. Accountability

**Currently:** the maintainer is accountable, and that is a weakness we name rather than
conceal. A single-person accountability structure is not adequate for a project holding
community data.

**Intended:** a governance group including representatives of each participating language
community, with real authority over data-use decisions — not an advisory board that is
consulted and overruled.

**Interim commitment:** no data-use decision beyond what is described in this document
will be made unilaterally. Where this document is silent, we ask before acting.

---

## 12. Open questions

| # | Question | Blocks |
|---|---|---|
| G1 | Which jurisdiction's data protection law governs? | Legal review |
| G2 | Who legally holds the corpus if the project dissolves? | Custodian agreement |
| G3 | How is community authority designated where no formal body exists? | Pilot onboarding |
| G4 | Should ASR training consent be default-off? *(Current position: yes)* | Consent design |
| G5 | How do we handle recordings of deceased speakers held by families? | Elder programme |
| G6 | What compensation, if any, for contributors? | Funding availability |

---

## 13. Revision

This document changes only with community consultation. Changes are recorded in git with
rationale. Contributors are notified of material changes and may withdraw in response to
any of them.

---

*If you are a member of a language community and something here is wrong, insufficient,
or paternalistic — please tell us. We would rather be corrected before collecting data
than defend a flawed policy afterwards.*
