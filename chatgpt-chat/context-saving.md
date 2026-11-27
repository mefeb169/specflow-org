The biggest optimization is to change your framework from an **AI team where every agent participates in every task** into an **AI team that activates specialists only when their expertise is needed**.

Your goal shouldn't be to reduce the number of skills or agents. It should be to reduce unnecessary context loading, repeated reasoning, agent communication, and duplicated work.

For your AI-first, feature-oriented framework, I'd recommend a **Context-Efficient, Event-Driven Multi-Agent Architecture**.

## **1. Identify where usage is being wasted**

There are six common sources of excessive Claude Code usage:

| Problem                      | Why it consumes usage                                           |
| ---------------------------- | --------------------------------------------------------------- |
| Too many agents              | Each agent has its own context and reasoning                    |
| Repeated context loading     | Multiple agents read the same project files                     |
| Excessive skill instructions | Large skill files are loaded unnecessarily                      |
| Agent-to-agent communication | The same requirements are repeatedly explained                  |
| Over-planning                | PM, architect and developer independently analyze the same task |
| Excessive verification       | Multiple agents run overlapping tests and reviews               |

The most important distinction: **more agents do not automatically mean better results.**

## **2. Change your team structure**

I would restructure your team into three layers.

**Orchestrator / Project Manager**

Only agent communicating with the user

Always active

**Planning layer**

Architect, Business Analyst, Product Manager, UX Designer

On demand

**Execution layer**

Backend, Frontend, Database, Integration developers

On demand

**Quality layer**

QA, Code Reviewer, Security Reviewer

On demand

**Knowledge layer**

Documentation, project memory, dependency maps

Persistent artifacts

The orchestrator should decide which specialists are needed, not automatically invoke the entire team.

## **3. Use conditional agent activation**

This is probably where you'll save the most.

Instead of:

```
New Feature
 ├── Project Manager
 ├── Business Analyst
 ├── Product Manager
 ├── Architect
 ├── UI/UX Designer
 ├── Backend Developer
 ├── Frontend Developer
 ├── Database Engineer
 ├── QA Engineer
 ├── Code Reviewer
 └── Security Engineer
```

Use a conditional workflow:

```
New Feature Request
       |
       v
   Project Manager
       |
       v
  Complexity Analysis
       |
       +---- Simple
       |       |
       |       v
       |   Developer
       |       |
       |       v
       |   Automated Tests
       |
       +---- Medium
       |       |
       |       v
       |   Architect (if needed)
       |       |
       |       v
       |   Developer
       |       |
       |       v
       |   QA / Review
       |
       +---- Complex
               |
               v
         Business Analysis
               |
               v
         Product / UX Design
               |
               v
           Architect
               |
               v
         Implementation
               |
               v
          QA / Review
```

Examples:

| Task                           | Agents needed                              |
| ------------------------------ | ------------------------------------------ |
| Fix a typo                     | Developer                                  |
| Add a field to an existing API | Developer + tests                          |
| Add CRUD module                | Developer + targeted QA                    |
| Implement authentication       | Architect + developer + security review    |
| Build a new booking system     | BA + PM + architect + UX + developers + QA |
| Refactor existing architecture | Architect + developer + reviewer           |

Don't invoke a specialist just because their role exists.

## **4. Make skills lazy-loaded**

Your framework probably has a lot of skill definitions.

I would separate them into three categories:

| Category                | Loading strategy          |
| ----------------------- | ------------------------- |
| Core framework rules    | Always loaded, very short |
| Specialist skills       | Load only when needed     |
| Reference documentation | Read only when relevant   |

For example:

```
.claude/
│
├── CLAUDE.md
│
├── agents/
│   ├── project-manager.md
│   ├── architect.md
│   ├── backend-developer.md
│   ├── frontend-developer.md
│   └── qa-engineer.md
│
├── skills/
│   ├── feature-analysis/
│   │   └── SKILL.md
│   ├── architecture-design/
│   │   └── SKILL.md
│   ├── backend-development/
│   │   └── SKILL.md
│   ├── frontend-development/
│   │   └── SKILL.md
│   ├── testing/
│   │   └── SKILL.md
│   └── deployment/
│       └── SKILL.md
│
└── rules/
    ├── backend.md
    ├── frontend.md
    └── database.md
```

Important optimizations:

- Keep root `CLAUDE.md` under approximately 200 lines.
- Move detailed procedures into skills.
- Use path-scoped rules for technology-specific instructions.
- Avoid duplicating instructions in agents and skills.
- Disable automatic invocation for skills that should only run when explicitly requested.

For manually invoked skills, use:

```
---
name: security-audit
description: Perform a security audit.
disable-model-invocation: true
---
```

This prevents unnecessary automatic skill activation.

Anthropic's documentation specifically recommends separating always-loaded instructions, on-demand skills, scoped rules, and deterministic hooks.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://claude.com\&sz=32)

Claude by Anthropic+2



## **5. Stop agents from repeating project discovery**

This is another significant opportunity.

Imagine your backend developer, frontend developer and QA engineer all independently investigate:

- Project structure
- Database schema
- API conventions
- Authentication
- Existing modules
- Coding standards

You're paying for the same investigation multiple times.

Instead, create a shared project context artifact.

For example:

```
.ai/
├── project-context/
│   ├── project-overview.md
│   ├── architecture.md
│   ├── database-schema.md
│   ├── api-conventions.md
│   └── dependency-map.md
│
├── active-work/
│   └── feature-123/
│       ├── requirements.md
│       ├── technical-plan.md
│       ├── tasks.md
│       └── status.md
│
└── handoffs/
    └── latest-session.md
```

The workflow becomes:

1. PM identifies what context is needed.
2. Architect investigates only missing information.
3. Architect updates the relevant artifacts.
4. Developers consume the technical plan.
5. QA consumes requirements, acceptance criteria and test instructions.

Don't make every agent reread every artifact. Give each one only the files it needs.

## **6. Reduce model costs through model routing**

I'd retain your existing Opus/Sonnet philosophy but make it more selective.

| Model  | Responsibilities                                                    |
| ------ | ------------------------------------------------------------------- |
| Opus   | Complex architecture, difficult technical decisions, major planning |
| Sonnet | Normal implementation, feature development, debugging               |
| Haiku  | Simple analysis, classification, summaries, lightweight checks      |

A practical example:

- PM: Sonnet
- Architect: Opus, only for complex decisions
- Backend developer: Sonnet
- Frontend developer: Sonnet
- QA: Sonnet or Haiku, depending on complexity
- Documentation: Haiku
- Simple code review: Sonnet

Don't use Opus for every planning conversation. Don't use multiple expensive models to independently reach the same conclusion.

Also, use scripts instead of AI for deterministic operations:

- Checking Git status
- Finding changed files
- Running tests
- Formatting code
- Checking lint errors
- Generating project inventories
- Checking migration status

These operations don't need an LLM.

## **7. Introduce a feature execution contract**

Every feature should have one compact, reusable handoff document.

For example:

```
# Feature: Student Booking

## Objective
Allow parents to book verified drivers for students.

## Requirements
- Parent must own the student.
- Driver must be verified.
- Driver must have sufficient capacity.
- Prevent duplicate active bookings.

## Technical Scope
- Backend: Booking module
- Database: Bookings table
- API: POST /bookings
- Frontend: Parent booking screen

## Acceptance Criteria
- Valid booking succeeds.
- Unverified driver is rejected.
- Invalid student ownership is rejected.
- Insufficient seats are rejected.
- Duplicate bookings are prevented.

## Execution
- Backend developer: Implement API.
- Frontend developer: Integrate API.
- QA: Verify acceptance criteria.

## Constraints
- Follow existing architecture.
- Reuse existing authentication.
- Avoid unrelated refactoring.
```

Now each agent works from the same contract rather than independently interpreting the original conversation.

Your PM should own the contract, and agents should report only:

```
Status: Completed
Files changed: ...
Tests: ...
Issues: ...
Next dependency: ...
```

Avoid lengthy reports describing everything they did.

## **8. Control agent concurrency and context**

I would start with these limits:

| Setting                     | Recommended default    |
| --------------------------- | ---------------------- |
| Main orchestrator           | 1                      |
| Concurrent subagents        | 1                      |
| Subagent nesting            | 1 level                |
| Independent planning agents | 1                      |
| Code reviewers              | 1                      |
| Full test executions        | At defined checkpoints |

You don't need five agents working simultaneously on one feature.

For Claude Code, you can also configure:

```
export CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=1
export CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1
```

Use `/context` to inspect what is loaded, `/compact` when finishing a phase, and `/clear` between unrelated tasks.

Anthropic also points out that subagents are not automatically cheaper: they create separate contexts. They are most valuable when isolating substantial investigation or noisy output, not delegating tiny tasks.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://claude.com\&sz=32)

Claude by Anthropic+2



## **9. Introduce session-independent execution**

One of your original goals was to have the framework work across sessions without losing progress.

I'd make this mandatory.

At the end of each execution phase, update:

`active-work/feature-123/status.md`

```
# Execution Status

Feature: Student Booking
Phase: Backend Implementation

Completed:
- Booking entity
- Booking service
- Booking API

Pending:
- Frontend integration
- Integration tests

Decisions:
- Existing authentication reused.
- Existing driver verification service reused.

Known Issues:
- None

Next Action:
Implement frontend API integration.
```

When a new session starts, the orchestrator reads this file instead of reconstructing the entire previous conversation.

This also helps avoid repeating architecture discussions.

## **10. My recommended target architecture**

I'd make these changes to your existing framework:

## **Lean AI Development Framework**

Recommended architecture

**1. Central Orchestrator**

Understand request · classify complexity · manage approvals

**2. Context & Planning Engine**

Discover existing architecture · retrieve relevant docs · create feature contract

**3. Development**

Backend / Frontend / Database

**4. Quality**

Tests / Security / Review

**5. Integration & Approval**

Validate · report · user approval · release

**Persistent shared state**

Specs

Architecture

Tasks

Dependencies

Session status

Available to the relevant agents without repeatedly reconstructing project knowledge.

## **11. Measure before and after**

Don't optimize blindly. Track these metrics for each feature:

| Metric                      | What it tells you                  |
| --------------------------- | ---------------------------------- |
| Total input tokens          | Context consumption                |
| Output tokens               | Reasoning and response consumption |
| Cache read/write tokens     | Prompt caching effectiveness       |
| Number of agent invocations | Delegation overhead                |
| Number of model turns       | Conversation overhead              |
| Repeated file reads         | Context duplication                |
| Cost per completed feature  | Actual efficiency                  |

Your primary KPI should be:

**Cost per successfully completed feature, not cost per agent or number of agents.**

## **12. What I'd do with your existing framework**

I wouldn't rebuild everything from scratch.

I'd perform a framework optimization audit in this order:

1. Audit every skill and agent for duplicated instructions.
2. Identify which agents are being unnecessarily activated.
3. Identify repeated project discovery and file reads.
4. Separate always-loaded instructions from lazy-loaded knowledge.
5. Introduce complexity-based agent routing.
6. Introduce compact handoff contracts.
7. Measure token consumption on the same representative features before and after.

**One important consideration:** Preserve your existing principles:

- User approves plans.
- Opus handles major planning and business/architecture decisions.
- Sonnet handles implementation.
- Testing happens alongside development.
- Only PM communicates with the user.
- Small, independently releasable features.
- No unnecessary Git pushes, PRs or agent coordination loops.

## **One thing I'd like to inspect**

Rather than giving you generic AI-agent optimization advice, I'd like to optimize the framework you already built.

**Can you share your current AI framework repository or upload its directory structure and these files?**

- Root `CLAUDE.md`
- Agent definitions
- Skills and their `SKILL.md` files
- Main orchestration instructions
- Any workflow or pipeline definitions

I can then perform a proper audit and identify:

- Which agents should be merged.
- Which skills are redundant.
- Which instructions should be removed or relocated.
- Where unnecessary LLM calls are happening.
- Which operations should become scripts/hooks instead of AI tasks.
- How to redesign orchestration without sacrificing development quality.

The objective would be to make your existing framework significantly more token-efficient, not to simplify it by sacrificing its capabilities.