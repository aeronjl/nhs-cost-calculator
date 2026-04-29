# Borrowing Methodology

This appendix documents the calculator's borrowing model. It is a reduced-form policy model, not a DMO financing forecast.

## Core Convention

Borrowing is financing, not revenue. A positive borrow line supplies cash in year 1, worsens public sector net borrowing (PSNB), adds to debt stock, and creates annual debt-interest costs. If interest is financed by further borrowing, the debt stock compounds.

For a borrow amount `B`, year `t` is:

```text
primary_financing_t = B if t = 1 else 0
interest_t = opening_debt_t * effective_rate_t
net_funding_t = primary_financing_t - interest_t
psnb_shift_t = -(primary_financing_t + interest_t)
closing_debt_t = opening_debt_t + interest_t
debt_gdp_delta_t = closing_debt_t / nominal_gdp_t
```

Positive `net_funding_t` means fiscal cash is available in that year. Positive `psnb_shift_t` means PSNB improves. Borrowing can therefore show positive year-1 cash while worsening PSNB.

## Financing Mix

The central case uses a DMO-style marginal portfolio: Treasury bills, short conventional gilts, medium conventional gilts, long conventional gilts, and index-linked gilts. Shares are calibrated to the 2025-26 DMO remit revision, which increased the planned gilt-sales total to £303.7bn and skewed issuance toward short and medium conventional gilts.

Alternative strategies are modelled explicitly:

- `dmo-remit`: central remit-style blend.
- `short-funded`: more bills and short gilts; cheaper initially, higher rollover risk.
- `long-funded`: more long gilts; higher term premium, lower refinancing exposure.
- `index-linked-heavy`: more inflation-linked issuance; higher inflation sensitivity.

## Rate And Risk Channels

Each instrument has a base nominal yield, or a real yield plus inflation for index-linked gilts. Bank Rate shocks pass through most strongly to bills and short gilts. A parallel yield-curve shock can be supplied by macro feedback or stress tests.

The debt-risk premium is:

```text
risk_premium =
  debt_gdp_delta_pp * linear_bp_per_pp
  + convexity_term_after_threshold
  + issuance_pressure_for_large_packages
```

This captures the idea that small packages have modest pricing effects, while large unfunded packages can face nonlinear credibility costs.

## Sustainability Outputs

The model reports:

- `r - g`: effective borrowing rate less nominal GDP growth.
- Stabilising primary balance: debt stock times `r - g`, adjusted for growth.
- Interest as a share of GDP.
- Annual refinancing as a share of GDP.
- Debt stock and debt/GDP shift relative to baseline.

Fiscal-rule diagnostics compare scenario-adjusted PSNB and debt proxy paths against the OBR baseline. If the stability-rule margin is exhausted, the model reports the implied consolidation need rather than treating the scenario as unconstrained.

## Stress And Stochastic Cases

Deterministic stress cases show:

- +100bp Bank Rate.
- +3pp inflation.
- +100bp gilt credibility premium.

The stochastic fan samples Bank Rate, inflation, and gilt-premium shocks with a seeded Monte Carlo draw. Bands are parameter uncertainty around borrowing costs, not a complete macroeconomic scenario tree.

## Sources

- UK Debt Management Office financing remit: https://www.dmo.gov.uk/responsibilities/financing-remit/
- DMO Budget 2025 remit revision: https://www.dmo.gov.uk/media/qh4nii4m/sa261125.pdf
- Bank of England Monetary Policy Summary, March 2026: https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/2026/march-2026
- OBR Fiscal risks and sustainability, July 2025: https://obr.uk/frs/fiscal-risks-and-sustainability-july-2025/
- OBR Economic and fiscal outlook, March 2025: https://obr.uk/efo/economic-and-fiscal-outlook-march-2025/

## Calibration Workflow

The model reads its numeric assumptions from `src/data/generated/borrowing-calibration.json`. The generated file is intentionally checked into git so builds are deterministic and reviewable.

Validate the current calibration:

```bash
npm run borrowing:check
```

Update from a structured extract:

```bash
npm run borrowing:update -- --input ./path/to/borrowing-calibration.json
```

Or from a maintained endpoint:

```bash
BORROWING_CALIBRATION_URL=https://example.gov.uk/borrowing-calibration.json npm run borrowing:update
```

The update script validates source domains, required instruments, share totals, rate ranges, debt aggregates, and risk-premium parameters before replacing the generated file. It does not scrape PDFs directly; the expected input is a structured extract from the official DMO, Bank of England, and OBR publications listed above.

## Known Limitations

The model does not yet estimate demand curves for gilt auctions, endogenous monetary-policy reaction functions, or a full joint macro-fiscal covariance matrix. It also treats the financing strategy as chosen ex ante rather than optimised dynamically as market conditions evolve.
