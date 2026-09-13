# Project Information and Roadmap Reorganization Design

## Status and Purpose

This design defines how the project records its current product definition,
roadmap, and architectural decisions without rewriting the historical design,
spike, and implementation evidence.

The immediate objective is to make the project independently understandable and
forward-moving. A developer or agent must be able to determine the current MVP,
the active decisions, the next executable work, and the remaining recognition
research without reconstructing them from dated specifications, cumulative spike
reports, Issue comments, and Git history.

This design also replaces the current global recognition gate. Cell-recognition
adoption remains a prerequisite for recognition integration, but it is no longer
a prerequisite for all product work.

## Problem Statement

The repository currently preserves valuable evidence, but mixes several kinds of
information:

- the root README summarizes the present state while linking to a dated product
  design whose recognition section has been superseded;
- dated specifications describe approved directions at particular points in
  time, not necessarily the current product definition;
- spike reports preserve failed gates, amendments, and later decisions in the
  same historical record;
- implementation plans are execution records rather than the current roadmap;
- Issue #1 and Issues #5 through #16 contain the operational roadmap, but the
  current dependency chain blocks all product work until recognition adoption;
- durable product decisions such as manual correction are embedded in the full
  product design and are easy to overlook;
- the previous manual solver is available only as an external local reference,
  not as a repository dependency or compatibility target.

This structure makes a locally correct statement difficult to distinguish from
the latest project-wide decision. It also makes recognition uncertainty block
work that is architecturally independent of recognition.

## Goals

- Provide one repository-local entry point for current project information.
- Separate the current product definition and roadmap from historical evidence.
- Record durable architectural decisions as individual ADRs with an index.
- Define a manual-board-entry solver as the first MVP.
- Allow product-core and recognition-research work to proceed independently.
- Preserve all dated specifications, spike reports, plans, and Git history as
  evidence without treating them as the current source of truth.
- Make the role of the external previous solver explicit without making the
  project depend on it.
- Define a repeatable update order that prevents decisions from living only in
  Issue comments or spike reports.

## Non-Goals

- Implementing the browser application, solver, board editor, image input, or
  recognition changes.
- Choosing the next cell-recognition technique.
- Collecting fixtures or training data.
- Moving or rewriting all historical documents.
- Requiring behavioral compatibility with the previous manual solver.
- Creating speculative Issues for image-assisted fixture export before its
  product behavior is designed.

## Information Architecture

Current project information is organized under `docs/project`:

```text
docs/project/
├── README.md
├── product.md
└── roadmap.md
```

Architectural decisions are organized separately:

```text
docs/decisions/
├── README.md
└── NNNN-<decision>.md
```

### `docs/project/README.md`

This is the repository-local entry point for a developer or agent. It contains:

- the current project state;
- the current milestone;
- the active or next Issue;
- a short component-status summary;
- links to the current product definition, roadmap, ADR log, and historical
  evidence collections;
- an explanation of which document is authoritative for each kind of question.

It stays short enough to read at the start of a work session. Detailed product
requirements, dependency graphs, decision reasoning, and experimental evidence
remain in their respective documents.

### `docs/project/product.md`

This is the source of truth for what the project is building. It records:

- the product purpose;
- the first MVP and its acceptance boundary;
- durable product constraints such as local-only processing;
- the manual-correction safety contract;
- included and excluded user flows;
- later image-assisted and recognition-enhanced milestones;
- the role of the previous manual solver as a design and specification reference
  only.

The previous solver is not a compatibility target, migration source, runtime
dependency, or repository prerequisite. Requirements derived from it must be
restated as self-contained requirements of this project.

### `docs/project/roadmap.md`

This is the source of truth for sequencing, gates, and dependencies. It records:

- independently executable tracks;
- milestones and their completion criteria;
- actual cross-track gates;
- the relationship between milestones and GitHub Issues;
- the current recommended execution order.

GitHub Issue state remains the operational record of whether an individual work
item is open or closed. The roadmap defines why the item exists and what it truly
depends on. Issue #1 mirrors the roadmap for GitHub navigation and links back to
the repository-local source of truth.

### `docs/decisions`

Each durable architectural or product decision receives one ADR. The directory
README is the decision log and provides a compact view of active and superseded
decisions.

An ADR contains:

- identifier and title;
- status: `proposed`, `accepted`, or `superseded`;
- decision date;
- context and problem;
- considered options where they are known from the evidence;
- the decision and its rationale;
- positive and negative consequences;
- links to superseded or superseding ADRs;
- links to supporting specifications, spike reports, Issues, and commits.

Historical ADRs are backfilled only from recorded evidence. Missing rationale is
not reconstructed by inference.

When a decision changes, a new ADR is added. The old ADR is changed only to mark
it `superseded` and link to the replacement. Typographical and broken-link fixes
may be applied directly.

## Authority by Information Type

There is no single document that duplicates every detail. Authority is scoped:

| Question | Source of truth |
| --- | --- |
| What product and MVP are being built? | `docs/project/product.md` |
| What can proceed, in which order, and behind which gate? | `docs/project/roadmap.md` |
| What architectural decision is active and why? | `docs/decisions/README.md` and the linked ADR |
| What is the current entry point and next work? | `docs/project/README.md` |
| What did an experiment measure? | The relevant spike report |
| What design was approved at that time? | The relevant dated specification |
| How was a particular change intended to be executed? | The relevant dated plan |
| Is a work item operationally open or closed? | The corresponding GitHub Issue |

The root README is a public summary. Issue #1 is an operational dashboard. Both
link to the current repository-local documents and do not override them.

## Product Roadmap

### Track 1: Manual-board-entry MVP

The first MVP is a browser application that can solve a Minesweeper position
without image recognition.

The MVP includes:

- user-entered width, height, and total mine count;
- a board initialized entirely as closed cells;
- mouse and keyboard entry for closed, empty, flag, and digits 1 through 8;
- board validation and distinct inconsistency states;
- locally computed certain-safe cells, certain mines, and best-guess candidates;
- a domain model that keeps board observations separate from solver proposals;
- local-only execution;
- a basic Japanese interface, keyboard operation, visible focus, and automated
  tests appropriate to the supported browser.

Image input and automatic cell recognition are not MVP requirements.

The expected Issue flow is:

```text
#9 manual-board-entry MVP implementation plan
  -> #10 browser foundation, board model, validation, and worker boundaries
       -> #11 solver
       -> #14 board rendering and manual entry
            -> #15 integrated MVP flow and interface
                 -> #16 MVP quality and release gate
```

Issues #11 and #14 may proceed in parallel after their shared #10 interfaces are
stable. Issue #14 no longer depends on image input. Issue #15 no longer depends
on recognition integration for its MVP scope.

### Track 2: Recognition Research

Recognition research remains a gated sequence:

```text
#5 recognition approach and acceptance design
  -> #6 evaluation fixtures and browser transform matrix
       -> #7 bounded feasibility spike
            -> #8 adoption decision
```

This track defines and evaluates non-learned recognition first, the conditions
under which requirements may be staged without allowing wrong cells to become
certain, and the conditions under which data collection and a learned model
would become justified.

Issue #8 gates recognition integration. It does not gate the manual-board-entry
MVP or product-core work.

### Track 3: Image Assistance and Recognition Integration

This track builds on stable product-core boundaries:

- #12 converts file, clipboard, drag-and-drop, and display-capture inputs into a
  shared pixel representation;
- #13 connects an adopted recognizer to the board model, review states, revision
  handling, and manual correction flow;
- a later, separately designed work item may export a screenshot and its
  manually confirmed board as a fixture candidate only through an explicit user
  action;
- recognition-enhanced E2E and Windows Chrome verification are added when that
  milestone is designed.

Image acquisition can be implemented without an adopted recognizer. Recognition
integration cannot.

### Quality Gates

Quality is evaluated at each shippable milestone instead of existing only as one
final phase:

- manual-board-entry MVP quality;
- image-input quality;
- recognition-integration quality;
- public-release quality.

Issue #16 is initially narrowed to the manual-board-entry MVP. Later milestones
receive their own quality work items when their product behavior is defined.

## Initial ADR Set

The initial reorganization backfills or records ADRs for:

1. local-only image and board processing;
2. the initial limited adoption of the first cell-recognition approach and its
   later supersession;
3. rejection of the currently evaluated cell-recognition candidates;
4. partial adoption of fail-closed grid detection;
5. stopping solver execution for uncertain cells until manual confirmation;
6. Chromium as the formal recognition evaluator, with Firefox and Playwright
   WebKit informational;
7. the manual-board-entry solver as the first MVP;
8. decoupling product-core progress from recognition adoption.

The role of the previous manual solver is documented in the product definition.
It does not require a separate ADR unless a later decision introduces a product
compatibility or repository-dependency question.

## Historical Documents

Existing dated documents remain in place:

- `docs/superpowers/specs` contains designs approved at their respective points
  in time;
- `docs/superpowers/spikes` contains measurements, decision literals, failures,
  amendments, and final experimental evidence;
- `docs/superpowers/plans` contains implementation procedures and work records.

The full dated product design receives a short notice linking to the current
product definition, roadmap, and ADR log. Its historical content is not silently
rewritten. Spike reports and plans are not edited merely to make them read like
current status.

In particular, the canonical-grid fallback report retains its sequence of failed
and amended gates. The active partial-adoption conclusion is made easy to find
through the ADR log rather than by deleting earlier evidence.

## GitHub Issue Changes

Issue #1 is changed from a single recognition-gated phase sequence to the three
tracks described above. It states that the repository-local roadmap is the
sequencing authority.

Issues #9 through #16 are updated to reflect the manual-board-entry MVP:

- #9 is unblocked and plans the MVP;
- #10 follows #9 and no longer requires #8;
- #11 and #14 follow #10 and may proceed independently;
- #14 no longer requires #12;
- #15 integrates #11 and #14 for the MVP and does not require #12 or #13;
- #16 becomes the MVP quality and release gate.

Issues #5 through #8 remain the recognition-research sequence. Their descriptions
state that #8 gates #13 and other recognition-dependent work, not the entire
product.

Issue #12 remains image-input work and may follow stable #10 input boundaries.
Issue #13 remains blocked on an adopted result from #8 as well as the relevant
product and image-input boundaries.

No speculative fixture-export Issue is created during this reorganization.

## Update Workflow

When a project-level decision changes:

1. add the new ADR and link any superseded ADR;
2. update `product.md` if product behavior or scope changes;
3. update `roadmap.md` if sequencing or gates change;
4. update `docs/project/README.md` if the current state or next work changes;
5. update the corresponding work Issues and Issue #1;
6. update the root README only when the public summary changes.

A spike report or Issue comment may supply evidence, but it does not by itself
become the active product decision. The decision becomes active through its ADR
and the affected current project documents.

## Initial Migration

The first implementation of this design performs the following bounded migration:

1. create the current project documents and ADR log;
2. backfill the initial ADR set from existing evidence;
3. add the current-document notice to the dated full product design;
4. update the root README to describe the manual-board-entry MVP and link to the
   current entry point;
5. update Issue #1 and Issues #5 through #16 to match the new tracks and gates;
6. update repository-foundation checks to require the current entry documents and
   their principal links;
7. run documentation consistency checks, ordinary tests, and type checking.

Historical files are not moved. New image-assistance or dataset-export behavior
is not designed or implemented in this migration.

## Verification

The reorganization is accepted when:

- a new session can determine the MVP, current recognition state, active gate,
  and next executable Issue from `docs/project/README.md` and its direct links;
- the root README, Issue #1, and `docs/project/roadmap.md` agree on the current
  milestone and recognition dependencies;
- no current project document states that all product work is blocked until #8;
- the manual-correction safety contract and the rejected cell-recognition state
  are both explicit and non-contradictory;
- active and superseded recognition decisions can be traced from the ADR log to
  the relevant dated evidence;
- all new Markdown links resolve;
- repository-foundation tests cover the required current documents and primary
  navigation links;
- ordinary tests and type checking pass.

## Consequences

The project gains a short, stable path to current truth while retaining detailed
historical evidence. The manual-board-entry MVP can progress without waiting for
recognition research, and later product use can make deliberate fixture
collection easier.

The cost is an explicit synchronization obligation between repository-local
current documents and GitHub Issues. The scoped authority table and update
workflow limit that duplication: repository documents define product, decisions,
and dependencies, while Issues record executable work and completion state.
