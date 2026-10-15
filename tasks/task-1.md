# Design a Reusable AI-Driven Software Development Lifecycle Framework

## 1. Vision

I want to design and build a reusable **AI-driven Software Development Lifecycle (SDLC) framework** that transforms Claude Code into a coordinated, role-based software development organization.

The framework must work with both new and existing projects, support multiple repositories under one project root, adapt to different technology stacks, and use **GitHub Spec Kit as its core feature-specification and implementation workflow**.

The goal is not simply to generate code or create a set of Markdown templates. I want a systematic way to manage the entire software development process through specialized AI skills, persistent project knowledge, structured workflows, and controlled automation.

Ultimately, I want to open Claude Code at a project's root and say:

> Let's work on the next feature.

The framework should understand the product, its repositories, its current implementation, its documentation, its existing features, and its outstanding work. It should then determine the appropriate next steps, coordinate the relevant roles, use Spec Kit, and guide the feature through its lifecycle.

Before building anything, analyze the requirements and design the framework's architecture. Identify ambiguities, risks, missing components, and potential overengineering. Present a concrete design for review and approval before implementing the framework.

## 2. Core Principles

The framework must follow these principles:

**Feature-oriented development:** Features are the primary units of planning, implementation, testing, tracking, and delivery. Activities such as architecture, UI design, backend development, and testing are stages or responsibilities within a feature's lifecycle, not disconnected work streams.

**Technology independence:** The framework must adapt to the project's actual stack instead of assuming a specific language, framework, database, cloud provider, or deployment platform.

**Context before action:** Understand the existing project and its instructions before proposing changes or executing work.

**Spec Kit integration:** Use GitHub Spec Kit as an integral part of the workflow rather than treating it as an optional tool that I must invoke manually.

**Persistent knowledge:** Decisions, requirements, plans, feature status, and verification results must be recorded in project artifacts instead of relying on conversation history.

**Specialized responsibilities:** Separate product, design, architecture, development, testing, and delivery responsibilities into appropriately scoped skills or agents.

**Controlled autonomy:** Automate routine, reversible work while requiring explicit approval for important decisions and potentially destructive actions.

**Minimal duplication:** Maintain one authoritative source for each kind of information. Avoid duplicating Spec Kit specifications, existing documentation, and framework-generated records unnecessarily.

## 3. Workspace and Multi-Repository Architecture

The framework must operate at a **product workspace root**, which may contain multiple independent Git repositories.

For example:

    ProductRoot/
    ├── frontend/             # Independent Git repository
    ├── backend/              # Independent Git repository
    ├── mobile/               # Independent Git repository
    ├── infrastructure/       # Independent Git repository
    ├── product-docs/         # Optional documentation repository
    └── ...

This is only an illustrative structure. The framework must not require these exact folder names or repository types.

It must be able to:

- Discover repositories and relevant project directories beneath the workspace root.
- Identify each repository's purpose, technology stack, build system, testing tools, and development conventions.
- Understand dependencies and communication between repositories, including APIs, shared data models, authentication, and deployment relationships where applicable.
- Distinguish workspace-wide configuration from repository-specific instructions.
- Coordinate a single feature across several repositories without losing its identity or lifecycle.
- Preserve independent Git histories, branches, and repository-specific workflows.
- Support monorepos, multiple independent repositories, and mixed arrangements where appropriate.

A critical architectural decision is **where shared specifications, feature records, product documentation, and framework configuration should live**. Design a strategy that handles these concerns without unnecessarily modifying or merging existing repositories.

## 4. Automatic Project Discovery and Context Loading

Before planning or implementing work, the framework must inspect the project and build an evidence-based understanding of its current state.

It should discover and read relevant information, including:

- `README.md`, `CLAUDE.md`, and other Markdown documentation.
- Claude Code skills, commands, hooks, and project instructions.
- Instructions and configuration intended for other coding agents.
- GitHub Copilot instructions and other agent-specific rules, when present.
- Architecture, product requirements, API specifications, and database documentation.
- Existing Spec Kit configuration, constitutions, templates, specifications, plans, and tasks.
- Repository structure, manifests, dependency files, build scripts, and configuration.
- Database schemas and migrations.
- Automated tests, CI/CD workflows, deployment configuration, and release procedures.
- Existing feature implementations, relevant code, and project-management artifacts.

Do not attempt to read every file indiscriminately. Develop a context-discovery strategy that prioritizes authoritative instructions, project documentation, entry points, architecture, and files relevant to the current feature. Use summaries or an indexed project map where necessary to manage context size.

The framework must distinguish between:

1. Verified facts about the existing project.
2. Behavior confirmed by the current implementation.
3. Existing requirements and specifications.
4. Planned or proposed functionality.
5. Unknowns, contradictions, and assumptions.

Do not treat documentation as proof that functionality exists, and do not assume that missing documentation means functionality is absent.

If instructions conflict, identify the conflict and apply a clearly defined precedence policy rather than silently choosing one. Respect repository-specific instructions and never overwrite existing instructions or documentation without an explicit reason and appropriate approval.

For existing projects, discovery should establish a baseline rather than immediately proposing a rewrite or imposing a new architecture.

## 5. Support for New and Existing Projects

The framework must support two initialization paths.

### Existing project

1. Discover the workspace and repositories.
2. Read and reconcile existing instructions and documentation.
3. Inspect the implementation and development workflow.
4. Identify implemented, partially implemented, planned, and unclear functionality.
5. Discover existing specifications and feature records.
6. Create or update a product-level project map, feature inventory, and dependency model.
7. Identify gaps and conflicts for review.
8. Recommend the next suitable feature or action.

The framework should reuse and improve existing documentation where appropriate. It must not replace an established process simply because its own templates differ.

### New project

1. Establish the product vision and problem being solved.
2. Identify users, business objectives, constraints, and success criteria.
3. Define the initial product requirements.
4. Establish architecture and technology decisions at the appropriate level of certainty.
5. Create an initial feature backlog.
6. Identify dependencies, risks, and MVP boundaries.
7. Establish the project constitution and development conventions.
8. Begin the feature lifecycle.

Do not force a new project's architecture, technology stack, or design decisions before enough information is available.

## 6. GitHub Spec Kit as the Core Workflow

The framework must integrate GitHub Spec Kit deeply into its feature lifecycle.

It should understand and orchestrate the appropriate Spec Kit stages for specification, clarification, planning, task generation, analysis, and implementation, using the actual commands and capabilities supported by the installed version.

I should not need to remember the command sequence or manually coordinate every stage.

For each feature, the framework should determine which actions are required, invoke the appropriate supported commands or workflows, verify their outputs, and update the feature's lifecycle state.

It must:

- Detect whether Spec Kit is installed and initialized.
- Discover the existing Spec Kit configuration and project conventions.
- Initialize or configure it only when necessary and after accounting for existing project state.
- Respect the project's existing constitution and rules.
- Use Spec Kit's native artifacts as the authoritative source wherever possible.
- Extend templates or workflows only where genuine project or framework requirements justify doing so.
- Avoid inventing unsupported commands, assuming a specific Spec Kit version, or silently replacing native workflows.
- Provide a sensible fallback or explain the blocker when the installed tools cannot perform an expected action.

The framework should orchestrate Spec Kit rather than duplicate its functionality.

## 7. Feature-Oriented Lifecycle

Every feature should have a traceable lifecycle from initial discovery to post-release verification.

Design a lifecycle that covers the following responsibilities where relevant:

    Feature Request
        ↓
    Product Discovery and Business Analysis
        ↓
    Requirements Clarification
        ↓
    Feature Specification
        ↓
    UX/UI Design
        ↓
    Solution Architecture and Technical Design
        ↓
    Implementation Planning and Task Breakdown
        ↓
    Cross-Repository Implementation
        ↓
    Automated and Manual Testing
        ↓
    Code and Security Review
        ↓
    Acceptance and Verification
        ↓
    Release and Deployment
        ↓
    Post-Deployment Verification
        ↓
    Maintenance and Feedback

This is a conceptual lifecycle, not a rigid sequence that every feature must follow identically. Some activities may be skipped, combined, revisited, or performed in parallel when justified.

The framework must define entry criteria, exit criteria, expected artifacts, responsibilities, and approval requirements for each stage. It must be able to identify incomplete work, failed checks, unresolved decisions, and stages that need to be revisited.

Feature completion must mean more than code generation. Completion criteria should be tied to agreed acceptance criteria, relevant test results, repository changes, and the required verification evidence.

## 8. Specialized Skills and Responsibilities

A central requirement is a **role-based collection of AI skills representing the responsibilities of a real software organization**.

Potential roles include:

- Product Manager
- Product Owner
- Business Analyst
- Requirements Analyst
- UX/UI Designer
- Solution Architect
- Software Architect
- Backend Developer
- Frontend Developer
- Mobile Developer
- Database Engineer
- QA and Test Engineer
- Security Reviewer
- Code Reviewer
- DevOps and Release Engineer
- Technical Writer
- Project Manager

These are candidate responsibilities, not a requirement to create a separate skill for every title.

Design a modular role system. Determine which roles should be independent skills, which should be combined, and which are better represented as shared capabilities or workflow stages. Avoid creating a large, redundant collection of personas that adds overhead without improving outcomes.

Each skill or role must define, where applicable:

- Purpose, scope, and responsibilities.
- Required inputs and relevant context.
- Expected outputs and artifacts.
- Lifecycle stages in which it operates.
- Allowed tools and repository access.
- Actions it may perform autonomously.
- Actions requiring approval.
- Responsibilities it must not assume.
- Handoffs and dependencies on other roles.
- Quality checks and completion criteria.
- Escalation behavior for ambiguity, conflicts, and missing information.

Roles must collaborate through persistent artifacts and explicitly defined handoffs rather than relying entirely on conversational coordination.

For example, a Product Manager may define business requirements, but should not silently change the business rules during implementation. A developer who discovers a requirement conflict should document it and request clarification rather than independently redefining the feature.

The framework should activate only the relevant roles for the current feature and stage. Avoid running every role on every request.

## 9. Feature Backlog and Dependency Management

The framework must maintain a coherent product-level view of features and their relationships.

It should track relevant information such as:

- Feature identifier and title.
- Business value and priority.
- Current lifecycle status.
- Acceptance criteria.
- Dependencies and blockers.
- Affected repositories and systems.
- Technical risks and unresolved questions.
- Relevant specifications and implementation artifacts.
- Verification and release status.

It must distinguish between a prerequisite, a technical dependency, a sequencing preference, and an optional relationship. A simple ordered list must not be mistaken for a true dependency graph.

When recommending the next feature, consider dependency readiness, product value, risk, MVP objectives, cross-repository impact, and required infrastructure.

The framework should be capable of answering questions such as:

- What features exist?
- Which are implemented and verified?
- Which are incomplete or blocked?
- What is the next feature that is actually ready to start?
- Why is that feature the recommended next step?
- Which repositories and capabilities will it affect?
- What decisions or dependencies must be resolved first?

Do not infer completion from a feature's title, a task marked complete, or code that has not been verified.

## 10. Persistent Artifacts and Source of Truth

The framework must maintain enough structured documentation to make project state recoverable across sessions and understandable by different roles.

Potential artifacts include:

- Product overview and goals.
- Project and repository map.
- Architecture and integration overview.
- Feature inventory and backlog.
- Feature dependency map.
- Decision log.
- Project-specific engineering principles.
- Lifecycle and approval rules.
- Feature specifications, plans, and tasks.
- UX and technical design artifacts where needed.
- Test plans and verification evidence.
- Release and deployment records.

These are logical categories, not a mandatory list of separate files.

Design a clear source-of-truth policy: decide which information belongs in Spec Kit's native artifacts, which belongs in workspace-level documentation, which belongs in repository-specific documentation, and which can be generated or summarized from other sources.

Avoid maintaining the same requirements or status in several independently edited files. Ensure cross-repository features can be tracked as one product-level feature while implementation tasks remain attributable to their respective repositories.

Support incremental updates, change history where appropriate, and reconciliation when the implementation diverges from the documentation.

## 11. Human Approval and Safe Automation

The framework should be agentic but controlled.

Define explicit autonomy levels and approval gates. For example:

- Repository discovery and documentation analysis can generally be automated.
- Requirements ambiguity should trigger clarification.
- Specifications and major design decisions should follow configurable approval rules.
- Implementation should begin only when the required specification, plan, and approvals are in place.
- Changes spanning repositories should be identified before execution.
- Destructive operations, sensitive configuration changes, database migrations with significant impact, and deployment actions must have appropriate safeguards and approval.
- Verification must evaluate actual results rather than assume success.
- Failed checks must be reported honestly and should not silently advance the lifecycle.

The framework must be able to resume interrupted work by inspecting persisted state and determining what remains to be done. It must not repeat completed stages blindly or assume that a previous conversation's claims still reflect the current workspace.

## 12. Claude Code Integration and Framework Distribution

The solution should be reusable across projects without requiring me to rebuild the framework for every workspace.

Design the appropriate use of:

- Claude Code skills and role-specific instructions.
- Project-level configuration and agent instructions.
- Hooks for deterministic checks, guardrails, and lifecycle enforcement.
- Commands or orchestration workflows to initiate and advance features.
- Templates and configuration presets.
- Scripts for setup, discovery, validation, and maintenance.
- GitHub Spec Kit integration.

Clarify the distinction between instructions, skills, scripts, hooks, and orchestration. A skill that tells Claude what to do should not be treated as a guaranteed enforcement mechanism.

Use hooks or scripts where deterministic behavior matters, and use AI-driven reasoning where interpretation or decision-making is required.

Support installing or initializing the framework in a new or existing workspace. Make it configurable without tying the framework's core logic to a particular project.

The framework should also provide a way to update its shared capabilities without overwriting project-specific instructions, customizations, or existing work.

## 13. Technology and Project Adaptation

The framework must remain technology agnostic.

It should discover and adapt to the actual stack, tooling, test commands, repository organization, and deployment process of each project.

Technology-specific capabilities should be introduced through appropriate extensions or configuration rather than embedded as assumptions in the universal workflow.

If a project uses an unfamiliar technology, missing test infrastructure, or an unsupported tool, the framework should state what it discovered, investigate the available options, and propose a suitable approach. It must not invent commands or assume tooling is installed.

The framework should be equally useful for a small single-repository application and a complex product with multiple frontend, backend, mobile, and infrastructure repositories.

## 14. Initial Deliverable: Architecture and Design Only

**Do not implement the framework yet.**

Begin by analyzing the complete request and proposing a technically sound, maintainable design.

Your first deliverable must include:

1. **Architecture:** The framework's major components, boundaries, responsibilities, and interactions.
2. **Workspace model:** How it operates at a project root containing multiple independent repositories.
3. **Context discovery:** How existing instructions, documentation, code, and project state are discovered and reconciled.
4. **Spec Kit integration:** How the framework detects and orchestrates the actual installed Spec Kit capabilities.
5. **Role/skill architecture:** Which roles are necessary, how responsibilities are separated, and how handoffs work.
6. **Lifecycle state model:** How features progress through stages, how status is persisted, and how interrupted work resumes.
7. **Artifact and source-of-truth strategy:** Where specifications, plans, backlog records, decisions, and verification evidence live.
8. **Automation and approval model:** Which activities run autonomously, which require approval, and how safety is enforced.
9. **Proposed directory structure:** The framework's own structure and how it integrates into individual project workspaces.
10. **Representative walkthrough:** Demonstrate how the design would handle one feature spanning at least two separate repositories, including requirements, implementation, testing, and verification.
11. **Trade-offs and risks:** Identify complexity, failure modes, context limits, duplication risks, and areas where the design may be too ambitious.
12. **Implementation roadmap:** Recommend a phased build plan, beginning with the smallest useful version and expanding only when necessary.

Clearly distinguish essential functionality for the initial version from optional future capabilities.

Do not assume every proposed role needs its own agent, every lifecycle stage needs a separate file, or every task requires a complex orchestration mechanism. Prefer the simplest architecture that satisfies the requirements while remaining extensible.

If you have access to the target environment, inspect the relevant Claude Code and Spec Kit capabilities and existing workspace conventions before making tool-specific architectural commitments. Where information is unavailable, state your assumptions explicitly.

Present the design, explain the important decisions, and identify any unresolved architectural choices. **Stop at the design stage and wait for my approval before creating or modifying framework files.**

## Final Objective

The result should behave like a persistent, adaptable AI software organization operating across an entire product workspace.

It should understand the project before acting, manage development around features, coordinate specialized responsibilities, automatically use Spec Kit where appropriate, respect each repository's boundaries, maintain trustworthy project state, and guide features through the complete software delivery lifecycle.

The framework—not the developer—should manage the complexity of coordinating these activities, while leaving business decisions and consequential approvals under human control.