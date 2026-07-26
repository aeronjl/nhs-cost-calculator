# NHS Cost Calculator

**Explore the fiscal choices behind NHS funding.** Build a policy scenario,
choose how to pay for it, and inspect the consequences for households,
borrowing, debt, growth, inflation, and fiscal rules.

[Open the live calculator](https://nhscostcalculator.com/) ·
[Read the borrowing methodology](docs/borrowing-methodology.md)

## Why this exists

Large public-spending numbers are difficult to reason about in isolation. The
NHS Cost Calculator turns them into an explicit set of policy choices: what is
the goal, which taxes or spending lines move, how much is borrowed, who bears
the cost, and what happens over time?

The aim is not to recommend a particular policy. It is to make assumptions and
trade-offs inspectable.

## What you can explore

- Build NHS funding scenarios from tax, spending, and borrowing choices.
- Compare household effects across income deciles and representative households.
- Follow multi-year paths for revenue, PSNB, debt, debt interest, GDP, and CPI.
- Stress-test borrowing strategies against rates, inflation, gilt-market demand,
  refinancing risk, and fiscal-rule headroom.
- Compare historical and research scenarios using the same modelling framework.
- Share a scenario by URL or export its assumptions and results for inspection.

## Model transparency

This is a reduced-form policy model, not an official forecast or a substitute
for the OBR, HM Treasury, the DMO, or distributional microsimulation.

The application keeps its assumptions close to the interface and exposes source
provenance, model coverage, uncertainty, and counterfactual paths. Public inputs
include OBR fiscal baselines, ONS public-finance series, NHS England budget data,
and DMO issuance and auction material.

The borrowing model—including financing mixes, debt-service feedback,
market-absorption constraints, monetary-policy reactions, and stochastic stress
cases—is documented in [the methodology appendix](docs/borrowing-methodology.md).

## Run locally

Requires Node.js 20.9 or newer.

```bash
git clone https://github.com/aeronjl/nhs-cost-calculator.git
cd nhs-cost-calculator
npm install
npm run dev
```

Open <http://localhost:3000>.

## Quality checks

```bash
npm run ci
```

The CI gate runs TypeScript checking, source-calibration checks, 600+ model and
interface tests, and a production build. Browser-level flows can be run with:

```bash
npx playwright install chromium
npm run test:e2e
```

## Technical shape

- Next.js, React, TypeScript, and Tailwind CSS
- Vitest for model and interface logic
- Playwright for end-to-end browser coverage
- Versioned public-data snapshots and reproducible calibration scripts
- Vercel deployment, analytics, and performance monitoring

## Caveat

The calculator is an exploratory and educational tool. Results depend on
simplifying assumptions and should not be interpreted as financial advice,
official costings, or policy recommendations.
