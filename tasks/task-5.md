# task 5
- this task is about my review and future development of the framework

# details
- here are the task details

# 1. Consumption
- I am consuming the framework in the project 'Wali App'
- Refer to: 'D:\Work\Wali_app'

## 2. Reviews and Changes
- First of all rephrase my reviews in technical language before any assumption

- Here are my detailed notes along implement the features and tasks
```
- Code conventions
- Use plan english language with user according to his interactions
- use graphify as RAG
- Steps produced by the technical project manager or team lead and followed by the team leads
- product must be very clear about its requirement
- specflow will turn it into features based on roles tags phases etc
- Plan will be approved by the user
- it should configure it self according to the user preferences and by asking questions
- always ask user for confusions
- testing should be done side by side to development
- if possible test through unit testing 
- product designing, naming, etc
- db analyzer
- db normalizer
- third party suggestions
- user may interupt to provide the urgent task or simple task to do before any thing proceed with it check dependencies first check depndencies map, keep in mind the standard flow
- framework should learn from user decisions and comment up the code for ai to have better understanding of features and to avoid repeated mistakes
- a separate way to make better the existing system so that existing system can be changed or modified to have a more professional
- create different pipelines etc, development, publishing, testing, etc
- claude opus will plan the task and will take business decisions
- only implementation will be done by claude sonnet
- should work with feature by feature
- ask user about future development
- current status of the project and on-going task must be saved so that, user can work regardless of the session history
- it should be memory effiecient 
- each feature must be small and releseable 
- must be easy to use
- must adapt itself according to the user interacitons
- new issues emerging while coding or developing a feature must go to the team
- for now it stuck in loop of moving forwaed and pushing to github and small prs
- an agent which must have clear knowledge of the product it must ask user if any confusion is there
- understand like: how a project onging is handed over to a new team?
- support shorter session development to save token and context memory
- auditing current ui/ux, features, development, and asking user about the inconsistensies
- all the things will be vide coded by ai human will take very specific decisions
```


## 3. helping you to get better understanding of the above point
- above points are just my reviews about the framework, these are not standard for the task
- Let me clearify the purpose of the framework

```
- User can install the framework on a existing project or design a new project or product through the framework
- Framework should replicate the way how a feature is developed, a team performing its roles and duties, same in our framework, there will be a full hierarchy of the team developing the product
- framework must be able to research on other alternatives and features so that, we provide the same consistency withour own requirements
- Framework should configure itself in the project by analyzing it, ask user questions in plan english, like: Which approach to use?, feature by feature or task by task, 
- There must be a team in the framework, which on ask, audit the current approach of doing something, so, we can kill the ai-ness from the code, or make it more mature
- ask user like, Should the 'team' (ai team), handle the publishing and releasing? if yes configure that team too
- there must be the proper domain knowledge to a project manager, so that, a devloper from team can ask about any feature
- framework must be able to perform like a standard sdlc and all the phases
- Only project manager can interact with user,
- there must be a planner in the team, which will research the feature or task for better
- RESTRICT REQUIREMENT IS TO WORK FAST WITH LESS TOKEN CONSUMPTION
- Framework should consider it self as a team
- team members can answer to other team member's questions and discussion
- framework should configure the team according to the tech stack
```

# Open for suggestions

# Here's technical language of the task
```
# Framework Review — Technical Requirements

## A. Framework Configuration and Adaptation

The framework must support both existing and new products and dynamically configure its workflows, team structure, and development practices based on the project's architecture, technology stack, maturity, and the user's preferences.

- Analyze the project before configuring the framework.
- Discover existing documentation, instructions, architecture, code conventions, development practices, and available tooling.
- Ask the user concise questions in plain English when important requirements, preferences, or architectural decisions cannot be established confidently.
- Adapt workflows to user preferences, such as feature-oriented versus task-oriented execution, preferred approval gates, autonomous versus human-managed releases, and development practices.
- Persist configuration decisions so they remain available across sessions.
- Allow configuration to evolve as the project matures without unnecessarily replacing existing project conventions.

## B. Organizational Structure and Role-Based Responsibilities

The framework must represent a structured software development team with a clear hierarchy, defined responsibilities, and controlled communication between roles.

- The Project Manager acts as the primary interface between the AI team and the user.
- The Project Manager maintains product-level awareness, tracks delivery status, coordinates team members, and communicates blockers and decisions requiring user input.
- A Planner or Researcher investigates requirements, technical alternatives, relevant domain knowledge, and potential implementation approaches before planning work.
- Technical leads coordinate implementation within their respective areas.
- Developers implement approved specifications and tasks.
- Other specialized roles perform product analysis, UX/UI design, architecture, database engineering, testing, code review, security review, and release management as required.
- Role responsibilities must be adapted to the project's technology stack and actual needs.
- Team members must be able to exchange findings, challenge assumptions, ask questions, and resolve technical issues through structured handoffs.
- The team must have sufficient product and domain knowledge to explain existing features and design decisions accurately.
- Organizational hierarchy must define decision-making authority, escalation paths, approval boundaries, and accountability.

## C. Feature Lifecycle and Delivery Management

The framework must manage the product through a feature-oriented lifecycle, with each feature treated as a traceable unit of business value.

- Maintain a product-level feature inventory, dependency graph, and current delivery status.
- Convert approved product requirements into appropriately scoped features using the framework's specification workflow.
- Use GitHub Spec Kit to produce and maintain the relevant specifications, plans, task breakdowns, and implementation artifacts.
- Establish clear entry criteria, exit criteria, acceptance criteria, dependencies, and verification requirements for each feature.
- Break features into small, independently verifiable and releasable increments whenever practical.
- Ensure implementation tasks follow an approved plan coordinated by the relevant technical lead.
- Keep testing and verification integrated into development rather than postponing them until the end.
- Identify newly discovered issues during implementation, record them, assess their impact, and route them to the responsible role.
- Prevent unplanned issues from silently expanding the scope of the current feature.
- Preserve the standard workflow when an urgent request or small task must take priority.

## D. Planning, Research, and Decision-Making

The framework must distinguish product decisions, planning decisions, technical decisions, and implementation activities.

- Research relevant alternatives before making significant architectural, product, or technology recommendations.
- Evaluate alternatives against explicit requirements, constraints, risks, maintainability, cost, and complexity.
- Ensure the Product Manager has a reliable understanding of the product, business rules, feature history, and user requirements.
- Escalate ambiguous or conflicting requirements rather than allowing individual developers to invent business rules.
- Generate a structured implementation plan and obtain user approval where required by project policy.
- Use the selected model or planning capability for high-level reasoning, requirements, research, and planning.
- Reserve routine implementation for the designated implementation model where supported by the available tools.
- Make the model-selection policy configurable and verify which models and capabilities are actually available.

## E. Engineering Quality and Existing-System Improvement

The framework must support both adding new functionality and professionally improving an existing system.

- Establish and enforce project-specific naming conventions, coding standards, architectural rules, and documentation practices.
- Analyze existing UI/UX, business functionality, architecture, implementation quality, testing, and operational practices.
- Identify inconsistencies, duplicated logic, unnecessary complexity, immature patterns, and potential AI-generated code that requires additional engineering scrutiny.
- Present material inconsistencies and proposed improvements to the user or relevant decision-maker.
- Provide a controlled workflow for auditing, refactoring, modernizing, and improving existing implementations without destabilizing verified behavior.
- Incorporate appropriate unit, integration, end-to-end, and other relevant tests into feature development.
- Analyze database schemas and migrations, identifying normalization problems, integrity risks, inefficient queries, and maintainability concerns.
- Keep database analysis, normalization recommendations, and schema changes subject to domain requirements and explicit engineering safeguards.
- Research suitable third-party tools, libraries, services, and implementation alternatives when they offer meaningful benefits.
- Maintain useful technical context in documentation and code comments where necessary, avoiding redundant or noisy commentary.

## F. Testing, Review, and Release Pipelines

The framework must support configurable pipelines for different engineering activities.

Potential pipelines include:

- Requirements and specification validation.
- Planning and task generation.
- Feature implementation.
- Continuous testing and verification.
- Code quality and security review.
- Existing-system auditing and modernization.
- Documentation maintenance.
- Build and integration validation.
- Publishing, deployment, release management, and post-release verification.

Testing should occur alongside development, with automated tests used wherever appropriate. Each pipeline must define its inputs, outputs, dependencies, success criteria, failure behavior, and approval requirements.

The framework must not repeatedly execute planning, committing, pushing, and pull-request creation without meaningful progression. Repository operations and delivery actions should be tied to intentional workflow transitions, validated outputs, and clear completion criteria.

## G. Session Continuity, Memory, and Context Efficiency

The framework must operate reliably across short sessions without depending on previous conversation history.

- Persist the current project state, active feature, approved plan, completed work, outstanding tasks, decisions, unresolved questions, blockers, and verification results.
- Allow work to resume from a new session by inspecting persisted state and validating it against the current repositories.
- Use a compact, structured project context rather than repeatedly loading every document or source file.
- Retrieve additional documentation and code only when relevant to the task.
- Reuse existing research and verified findings instead of repeating expensive investigations unnecessarily.
- Maintain a reliable distinction between completed, attempted, pending, blocked, and verified work.
- Optimize model usage, context consumption, tool calls, and agent coordination while preserving essential quality checks.
- Record recurring user preferences and decisions at the appropriate scope so the framework can avoid repeating previously resolved questions and mistakes.

## H. User Interaction and Change Management

The framework should minimize the user's involvement in routine execution while reserving human attention for meaningful decisions.

- Use the Project Manager as the primary user-facing coordinator.
- Communicate in plain English, adapting the language and detail to the user's interactions.
- Ask targeted questions when uncertainty affects requirements, scope, architecture, or important implementation decisions.
- Ask about future product direction and planned development at appropriate planning points rather than interrupting every task.
- Allow the user to submit an urgent request or small task at any time.
- Evaluate its dependencies and urgency before deciding whether to interrupt current work.
- Support controlled reprioritization without losing the state of the interrupted feature.
- Route new defects, technical debt, scope changes, and newly discovered requirements through an explicit issue-management process.
- Explain significant recommendations, trade-offs, blockers, and approval requests without flooding the user with internal agent discussions.

## I. Configuration, Handover, and Auditability

The framework must behave like a persistent engineering organization capable of handing work from one team member or session to another.

- Maintain current product knowledge, architecture records, feature specifications, important decisions, coding conventions, and known limitations.
- Make each feature understandable to a new developer or agent without relying on the original conversation.
- Maintain traceability between requirements, specifications, implementation tasks, repository changes, tests, and release evidence where appropriate.
- Support different levels of autonomy for development, testing, publishing, and releasing.
- Allow the user to enable or disable specific responsibilities and pipelines through explicit configuration.
- Provide a repeatable audit process for evaluating how work is currently performed and recommending improvements.
- Use verified outcomes and recorded user decisions to improve future recommendations while preserving human control over business requirements and consequential decisions.

## J. Primary Optimization Objective

The framework must optimize for **fast, controlled, context-efficient delivery of small, verifiable product increments**.

Efficiency should come from better context retrieval, reduced duplication, reusable research, appropriately scoped tasks, selective role activation, targeted testing, and reliable session continuity—not from indiscriminately skipping planning, review, or essential quality checks.
```