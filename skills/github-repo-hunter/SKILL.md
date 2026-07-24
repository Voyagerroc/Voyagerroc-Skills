---
name: github-repo-hunter
description: Rigorously research and recommend GitHub repositories for a given topic, framework, or problem — going beyond star count to evaluate maintenance health, license risk, bus factor, production readiness, and ecosystem strength. Use this skill whenever the user asks to "find a repo/library/package for X", "what's the best GitHub project for Y", wants trending or well-maintained open-source options, or needs to compare candidate repositories before adopting one into a project. Also trigger when the user is choosing a dependency for real code (not just browsing) and needs a defensible, evidence-based pick rather than a quick guess.
---

# GitHub Repo Hunter

An evaluation pipeline for finding GitHub repositories that are genuinely trending, actively maintained, and practically usable — not just popular. Prioritize quality over popularity; never rank candidates by star count alone.

## Use this skill when
- The user asks to "find a repo/library/package for X".
- The user asks "what's the best GitHub project for Y".
- The user wants trending or well-maintained open-source options.
- The user needs to compare candidate repositories before adopting one into a project.

## Do not use this skill when
- The user is asking for general programming advice without needing a specific repository or dependency.

## Output modes

Decide the depth before searching:

- **Compact mode (default):** For general queries. Report only: rank, repo name, purpose, stars, last commit, license, production readiness, one-line verdict.
- **Full mode:** Only when the user explicitly asks for depth — "detailed", "compare", "deep dive", "architecture review", "production evaluation", "enterprise analysis" (or non-English equivalents, e.g. Turkish "detaylı", "derinlemesine", "karşılaştır"). Use the full template in "Response format" below.

## Instructions (Workflow)

**Workflow (do this internally — don't narrate step labels or your search process to the user; go straight from question to final answer)**

**1. Discovery**
Search from at least 3 independent angles: direct topic, "awesome-X" curated lists, alternative/synonymous technical terminology. If you have web search available, prioritize: GitHub Trending, GitHub Explore/Topics, OSS Insight (ossinsight.io/trending), Project-Awesome.org, and official project sites. Treat blog posts as supporting evidence only, never as the sole source for a factual claim. Collect 8-12 candidates before ranking anything.

If you don't have live web/search access in this environment, say so explicitly, rely on your training knowledge instead, and label every uncertain metric "Estimated."

**2. Quality filter**
Drop candidates that are: abandoned or inactive 6+ months (unless an established industry standard — keep with a note), poorly documented, missing install instructions or usage examples, or demo-only with no real usage (unless the user specifically wants research/experimental projects). Note any known security advisories.

**3. License review**
Flag commercial-use restrictions, copyleft obligations (GPL/LGPL), network copyleft (AGPL), and Business Source licenses (BUSL/SSPL/Elastic). MIT/Apache-2.0/BSD are generally safe — no need to flag. Never assume commercial compatibility without checking.

**4. Maintenance score (1-10)**
- 9-10: weekly commits, active CI/CD, fast PR merges, <48h issue response
- 7-8: monthly releases, stable maintenance, healthy community
- 5-6: slow but maintained, growing issue backlog
- <5: exclude unless it's the only viable option in this space

**5. Community score:** ★★★★★ (industry standard) down to ★☆☆☆☆ (dormant).

**6. Production readiness:** classify as Experimental / Beta / Production Ready / Enterprise Grade.

**7. Project stability:** note Project Age (New/Established/Mature/Legacy) and Bus Factor (Single Maintainer/Small Team/Org-Backed) — a single-maintainer project is a real risk regardless of star count; flag it.

**8. Ecosystem:** plugins, SDKs, third-party integrations, tutorials, templates, example projects.

**9. Cross-validation:** remove duplicates and inferior/abandoned forks (prefer the actively maintained upstream). Ensure the shortlist is technically diverse, not five repos solving the problem the same way. Match to the user's actual goal (prototype / MVP / production / enterprise / learning / automation / AI agents / infra / etc). Narrow to 3-5 finalists.

**10. Refinement (max 2 passes):** ask and act — did this solve the actual problem? Is a newer, faster-growing alternative missing? Are candidates too similar? Could the user start using one within 5 minutes? Fix what you can, then stop.

**11. Final ranking order:** practical usefulness → maintenance quality → production readiness → documentation → ecosystem → community → current growth velocity. Never rank by stars alone.

**Final check before responding:** no duplicates, popularity not confused with quality, all uncertain values labeled "Estimated," license info accurate, trade-offs explained, shortlist genuinely diverse.

## Response format

### Compact mode
```
## Rank. Repository Name
- Purpose: one sentence
- Stars: count (or "Estimated")
- Last Commit: date
- License: type
- Production Readiness: [classification]
- Why It Stands Out: one sentence
```

### Full mode
```
## Rank. Repository Name
- Purpose: one sentence
- Stars: count (mark "Estimated" if uncertain)
- Recent Growth: velocity/trend
- Last Commit / Last Release
- Primary Language / Stack
- License: type — state explicitly if commercial usage is restricted
- Production Readiness: [classification]
- Maintenance Score: X/10
- Community Score: ★☆☆☆☆ to ★★★★★
- Learning Curve: Beginner / Intermediate / Advanced
- Documentation Quality: brief assessment
- Project Age & Bus Factor
- Ecosystem Health
- Verified Integrations: only ones actually confirmed
- Real-world Adoption: name companies/projects only with reliable evidence; otherwise "No reliable adoption information found"
- Pros / Cons
- Why NOT Choose This Repository: one honest sentence
- Why It Stands Out: 1-2 sentences
- Confidence: High / Medium / Low + one-line reason.
  Rule: if more than half the fields above are "Estimated," Confidence must be Medium or Low — never High.
```

### Always include (both modes)

**Comparison table:**
| Repository | Production | Docs | Maintenance | Community | License | Difficulty | Best For |

**🔥 Hidden Gem** — one repo with relatively low stars but unusually strong fundamentals or momentum, genuinely distinct from the main picks, with a one-line reason it deserves attention.

**Best repository by use case** — only relevant lines: Fast Prototype → / Production → / Enterprise → / Learning → / Automation/AI Agents → / Coding Assistant/RAG → / Infrastructure →

## Hard rules

- Never fabricate stars, dates, adoption claims, or integrations. If unverified, say "Estimated" or "No reliable information found" — never present a guess as fact.
- Never present an outdated or abandoned repo as currently trending.
- Never infer enterprise adoption from star count alone.
- Explain trade-offs honestly — if a lower-star repo outranks a higher-star one, say why.
- If the user's request is too broad ("find me a repo for AI"), ask exactly one clarifying question before searching.
- Respond in the language the user writes in; keep technical terms (repository, commit, PR, issue, release, fork, CI/CD, license) in English.
- Never show step labels, internal reasoning, or your search/filtering process — only the final formatted answer.
- If this skill is being used to select a dependency for actual code the user is writing, also sanity-check the license against how the user's project will be distributed/licensed before recommending it.
