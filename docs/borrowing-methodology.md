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

## Strategy Cost-Risk Frontier

The model scores the financing strategies on a cost-risk objective rather than ranking only by coupon cost:

```text
objective =
  cumulative_interest_cost
  + refinancing_risk_score
  + bank_rate_risk_score
  + absorption_risk_score
```

Refinancing risk prices the annual rollover stock, Bank Rate risk prices the one-year shock exposure implied by each portfolio's pass-through, and absorption risk prices overloads against the market-capacity proxy. This surfaces the strategy with the lowest combined objective while still showing the user's selected strategy.

## Dynamic Debt-Management Optimiser

The fixed strategies are supplemented by a constrained optimiser. It searches feasible 5pp issuance mixes across Treasury bills, short gilts, medium gilts, long gilts, and index-linked gilts. Candidate portfolios must meet debt-management constraints for average maturity, Bank Rate exposure, Treasury bill share, index-linked share, and minimum medium/long-gilt issuance. Each feasible mix is then scored with the same cost-risk objective used for the strategy frontier:

```text
optimised_mix =
  argmin(objective)
  subject to maturity, rollover, Bank Rate, and instrument-share constraints
```

This is not a security-by-security DMO order book. It is a reduced-form optimiser for the marginal financing package, designed to show when the user's selected strategy is materially away from the model's least-cost-risk portfolio.

## Market Absorption

Each strategy is also checked against annual DMO-style issuance buckets. The model estimates the marginal issuance allocated to each maturity/type bucket and adds a weighted APF/QT competing-supply proxy, because gilt sales or runoff from the Bank of England portfolio can absorb investor balance sheet capacity at the same time as new DMO issuance.

The absorption layer is now an auction demand curve calibrated from DMO Annual Review auction and Treasury bill tender tables. Each instrument has a normal bid-cover ratio and a price-elastic demand slope. The model estimates how much yield concession would be required to clear the net supply:

```text
net_market_supply_i =
  marginal_issuance_i + APF_competing_supply_i * crowding_weight

base_auction_demand_i =
  planned_annual_issuance_i * digestible_share * normal_cover_i

required_concession_bp_i =
  max(0, net_market_supply_i - base_auction_demand_i)
  / demand_elasticity_i
```

The annual bucket is then split through a DMO remit calendar in `src/data/borrowing-remit.ts`. The calendar uses the April 2026 2026-27 remit revision: Treasury bill contribution, short/medium/long/index-linked gilt auction counts, planned syndications, and unallocated flexibility. The model derives a per-operation supply load and adds a calendar concession when marginal issuance would require unusually large operations:

```text
calendar_operation_size_i =
  planned_average_operation_i + marginal_issuance_i / planned_operations_i

calendar_concession_bp_i =
  max(0, calendar_operation_size_i / normal_operation_capacity_i - 1)
  * calendar_slope
```

Investor demand is segmented into overseas investors, insurers/pensions, asset managers, and bank/liquidity books using recent DMO/ONS holder shares. Each segment has maturity preferences, a demand share, and an elasticity multiplier. This changes the demand slope and reports the binding investor base; for example, long and index-linked gilt stress is more likely to bind insurers/pensions, while bills and short gilts bind liquidity and overseas demand.

When supply exceeds base demand, the instrument receives an auction-clearing concession capped at 75bp. The model also reports the implied cover ratio, auction-tail proxy, operation-calendar pressure, investor bottleneck, and any residual uncovered supply after the capped concession. Long and index-linked gilts have lower demand elasticity than bills and short conventional gilts because depth is thinner and investor bases are more specialised. The auction-curve calibration lives in `src/data/generated/auction-demand-calibration.json`; the remit calendar and investor segmentation live in `src/data/borrowing-remit.ts` so changes remain reviewable.

## Monetary-Fiscal Overlay

The model also reports a Bank Rate sensitivity overlay using Bank of England reserve balances and APF gilt stock. A +100bp Bank Rate shock raises the cost of remunerating reserves directly. A smaller APF cashflow proxy is added to represent the way higher short rates worsen the cashflow gap between APF financing costs and the gilt coupons held in the portfolio:

```text
reserve_cost = reserves_balances * bank_rate_shock
apf_cashflow_proxy = apf_gilt_stock * bank_rate_shock * APF_beta
```

This overlay is not added to every borrowing line's central PSNB path, because it is mostly a whole-balance-sheet sensitivity rather than the direct consequence of one marginal gilt issue. It is exposed beside borrowing scenarios because it materially changes fiscal risk in high-rate states.

## Monetary Policy Reaction

The scenario macro path now includes a reduced-form Bank Rate reaction. CPI and GDP deviations create a Taylor-rule-style target for the policy rate, and the model smooths the response through time:

```text
bank_rate_target_pp =
  CPI_deviation_pp * CPI_response
  + GDP_deviation_pct * output_response

bank_rate_deviation_t =
  smoothing * bank_rate_deviation_(t-1)
  + (1 - smoothing) * bank_rate_target_pp
```

The resulting Bank Rate deviation feeds back into borrowing costs through each instrument's Bank Rate pass-through. This matters most for Treasury bills and short gilts; long gilts remain driven mainly by the term yield and debt-risk channels.

## Iterative Macro-Fiscal Loop

Borrowing costs now feed back into the scenario projection iteratively. The model first builds the no-feedback PSNB/debt path, derives debt/GDP, Bank Rate, and gilt-yield deviations, then reprojects borrowing costs with those deviations. The updated debt-service path is fed back into the macro state until the largest annual change in net revenue, PSNB, debt interest, or debt stock is below £1m, capped at six iterations:

```text
projection_0 = no_feedback_path
macro_t = f(projection_t)
projection_(t+1) = borrowing_costs(macro_t)
stop when max_abs_change <= GBP1m
```

This closes the realistic debt-service loop where higher interest worsens PSNB, pushes debt/GDP up, lifts gilt yields, and raises later debt service. It remains reduced-form rather than a full general-equilibrium model, but it avoids treating borrowing feedback as a one-shot adjustment.

## Rate And Risk Channels

Each instrument has a base nominal yield, or a real yield plus inflation for index-linked gilts. Bank Rate shocks pass through most strongly to bills and short gilts. A parallel yield-curve shock can be supplied by macro feedback or stress tests. The instrument rate combines base yield, debt-risk premium, market-absorption concession, macro yield shift, and Bank Rate pass-through.

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

The rule-correction path is a stylised policy reaction. When headroom is breached or becomes very thin, the model ramps in the required annual fiscal tightening by the rule horizon and reports corrected PSNB/debt outcomes.

The panel also shows fiscal reaction options: balanced, tax-led, spending-led, and delayed consolidation. Each option grosses up the required action for demand-side macro feedback using the model's tax-to-GDP ratio, then reports the implied GDP drag, tax/spending split, corrected PSNB, and debt/GDP at the rule horizon. This is not a recommendation about whether the adjustment should come from tax rises or spending cuts; it is a sensitivity showing how the same rule correction can have different macro and debt-path consequences.

## Stress And Stochastic Cases

Deterministic stress cases show:

- +100bp Bank Rate.
- +3pp inflation.
- +100bp gilt credibility premium.

The stochastic fan samples Bank Rate, inflation, and gilt-premium shocks with a seeded Monte Carlo draw. For borrowing lines it also samples a labelled regime from the credibility/backstop classifier and applies that regime's yield overlay to the draw. Bands are parameter and regime uncertainty around borrowing costs, not a complete macroeconomic scenario tree.

The fan now uses correlated macro-fiscal shocks rather than independent draws. A common stress factor pushes Bank Rate, inflation, and gilt premia in the same direction while reducing nominal-growth assumptions at the margin. This is still a reduced-form covariance structure, but it avoids the unrealistic case where adverse rate, inflation, and credibility shocks are sampled as unrelated events.

The borrowing popover also decomposes the year-horizon fan. The continuous component is the gap between the central debt-interest path and the 95th percentile under continuous Bank Rate, inflation, gilt-premium, and growth shocks. The regime component is the additional 95th-percentile movement after sampling credibility/backstop regimes. For backstop-like regimes this contribution can be negative, showing that QE or safe-asset demand offsets part of the continuous issuance stress.

## Fiscal-Rule Fan

The OBR baseline comparison also runs a joint macro-fiscal fan. Each draw samples a common adverse shock, nominal-growth shock, inflation shock, Bank Rate shock, gilt-premium shock, and a persistent PSNB forecast error. The same draw is applied to scenario projections and the baseline headroom calculation, producing:

- Stability-rule breach probability.
- Probability of tight-or-breached headroom.
- 90% headroom band at the rule horizon.
- PSNB and debt/GDP bands at the rule horizon.

When the scenario includes positive borrowing, each fiscal-rule fan draw also samples the borrowing stress regime and feeds the resulting yield overlay through the scenario projection. This is still reduced-form rather than a full OBR economy forecast, but it makes fiscal-rule risk probabilistic instead of treating the central headroom estimate as certain.

## Market Reaction Loop

Large borrowing packages also receive an endogenous market-reaction path. The central path applies the static debt/GDP and issuance risk premium. The market-reaction path then carries forward an additional credibility premium when debt/GDP, refinancing exposure, or the size of the issuance package cross risk thresholds:

```text
reaction_premium_t =
  0.75 * reaction_premium_(t-1)
  + debt_gdp_pressure_t
  + refinancing_pressure_t
  + large_issuance_pressure_t
```

The premium is capped at 150bp. This is deliberately stylised: it represents a loss of fiscal credibility or a weaker gilt-market absorption environment, not a forecast of DMO auction tails.

## Historical Backtests

Borrowing stress calibration is checked against curated historical episodes in `src/data/borrowing-backtests.ts`. Each episode defines the discretionary borrowing shock, an observed peak gilt-move range, the source, and any regime overlay needed to make the central model comparable with history.

The audit deliberately distinguishes:

- Central fit: issuance size, debt/GDP, absorption, and endogenous market reaction explain the observed range.
- Credibility overlay: the central model undercalls a political or institutional confidence shock, as in the 2022 Growth Plan.
- Monetary backstop overlay: the central model overcalls stress because QE or safe-asset demand suppressed yields, as in pandemic borrowing.

The reference page reports central and overlay pass rates, mean absolute basis-point misses, and the largest miss. This is a calibration diagnostic, not a claim that future episodes will match the same overlays.

## Regime Classifier

The backtest labels also feed a forward-looking regime classifier in `src/lib/borrowing-regime.ts`. For any borrowing package, the model computes features from the central market-reaction path:

- Borrowing size as a share of the DMO gross financing requirement.
- Debt/GDP shift at the horizon.
- Central peak pressure from debt-risk, auction absorption, and market reaction premia.
- Peak auction concession, absorption stress, and endogenous market-reaction premium.

Those features are compared with the labelled backtest episodes using a scaled nearest-neighbour softmax. The output is a probability distribution over normal absorption, credibility shock, and monetary-backstop regimes. Each regime carries an expected yield overlay, so the UI can report both the central pressure and the probability-weighted peak pressure. The stochastic borrowing and fiscal-rule fans sample from this distribution on each draw. This is deliberately small-sample and diagnostic: it turns known misses into explicit regime risk rather than pretending the central borrowing model can infer institutional credibility or central-bank backstop states from issuance arithmetic alone.

Borrowing lines can also carry explicit context metadata. The stack editor lets users mark the package as OBR-scored, unscored, emergency, QE/backstopped, temporary, or persistent. These markers enter the classifier as logit priors: OBR scrutiny shifts probability toward normal absorption, unscored/persistent packages toward credibility shock, and QE/backstopped/temporary packages toward monetary-backstop regimes. The central cash/debt path is unchanged; the metadata affects regime probabilities, stochastic borrowing fans, and fiscal-rule fan tails.

The reference page now exposes the calibration audit directly. It reports the historical trigger window for each regime, the classifier probabilities assigned to each labelled episode, and the backtest fit before and after applying the documented regime overlay. This makes the regime switch auditable: users can see which historical episode is anchoring the probability, where the central balance-sheet model misses, and whether the overlay is adding credibility stress or subtracting monetary-backstop pressure.

## Sources

- UK Debt Management Office financing remit: https://www.dmo.gov.uk/responsibilities/financing-remit/
- DMO 2026-27 remit revision, April 2026: https://www.dmo.gov.uk/media/ajmifgdv/pr230426_2.pdf
- DMO Budget 2025 remit revision: https://www.dmo.gov.uk/media/qh4nii4m/sa261125.pdf
- DMO Annual Review 2024-25: https://www.dmo.gov.uk/media/dmgaetip/gar2025a.pdf
- DMO Annual Review 2023-24: https://www.dmo.gov.uk/media/5rqb2scf/gar2024_final.pdf
- DMO Quarterly Review, October-December 2025: https://dmo.gov.uk/media/wysdetq0/oct-dec-2025.pdf
- Bank of England Monetary Policy Summary, March 2026: https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/2026/march-2026
- OBR Fiscal risks and sustainability, July 2025: https://obr.uk/frs/fiscal-risks-and-sustainability-july-2025/
- OBR Economic and fiscal outlook, March 2025: https://obr.uk/efo/economic-and-fiscal-outlook-march-2025/
- OBR Economic and fiscal outlook, November 2022: https://obr.uk/efo/economic-and-fiscal-outlook-november-2022/
- OBR Briefing Paper 8, Forecasting during the coronavirus pandemic: https://obr.uk/forecasts-in-depth/brief-guides-and-explainers/briefing-paper-no-8-forecasting-during-the-coronavirus-pandemic/

## Calibration Workflow

The model reads debt-stock, yield, APF, and issuance assumptions from `src/data/generated/borrowing-calibration.json`. Auction demand curves are stored separately in `src/data/generated/auction-demand-calibration.json`. The remit calendar and investor-base segmentation live in `src/data/borrowing-remit.ts` because they are curated from published remit and holder-share tables rather than generated by an update script. The generated files are intentionally checked into git so builds are deterministic and reviewable.

Validate the current calibration:

```bash
npm run borrowing:check
npm run auction:check
```

Update from a structured extract:

```bash
npm run borrowing:update -- --input ./path/to/borrowing-calibration.json
```

Or from a maintained endpoint:

```bash
BORROWING_CALIBRATION_URL=https://example.gov.uk/borrowing-calibration.json npm run borrowing:update
AUCTION_DEMAND_CALIBRATION_URL=https://example.gov.uk/auction-demand-calibration.json npm run auction:update
```

The update scripts validate source domains, required instruments, share totals, rate ranges, debt aggregates, risk-premium parameters, auction cover ratios, tails, and demand-curve slopes before replacing generated files. They do not scrape PDFs directly; the expected input is a structured extract from the official DMO, Bank of England, and OBR publications listed above.

## Known Limitations

The model does not yet estimate a structural MPC forecast or a complete joint macro-fiscal covariance matrix. The remit calendar is still reduced-form: it works by maturity bucket and issuance method, not by individual gilt ISIN, exact auction date, GEMM order book, switch auction, PAOF take-up, or syndication book quality. The regime classifier is calibrated from a small, hand-labelled episode set, so its probabilities should be read as structured stress diagnostics rather than statistically estimated event frequencies.
