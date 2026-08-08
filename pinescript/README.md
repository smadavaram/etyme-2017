# EMA/VWAP Stack Scanner — 3-Dashboard Setup (15m / 1H / Daily)

`ema-vwap-scanner.pine` is a TradingView Pine Script v5 indicator that scans a
watchlist of tickers on one timeframe at a time and flags a specific setup:

1. **Trend stack** — `8 EMA > 21 EMA > VWAP`
2. **Clean 2-bar move** — the last two closed candles don't overlap (the more
   recent one sits fully above the prior one — a no-overlap "staircase" step)
3. **Entry trigger** (either):
   - **VWAP Rip** — the first candle opens below VWAP and closes back above
     both VWAP and the 8 EMA on a strong body (breakout thrust), or
   - **Mean Revert** — the first candle wicks down into/through VWAP and
     closes back above it (pullback bounce)

It renders as a live table (ticker, price, 8EMA, 21EMA, VWAP, trend/pattern
checks, setup type) and fires a TradingView alert per symbol the moment a bar
closes with all conditions true.

## Why 3 dashboards, and why you need multiple copies of each

TradingView hard-caps every script at **40 `request.security()` calls**, and
this scanner uses one call per ticker. That means:

- **One script instance = one timeframe × up to 40 tickers.**
- For "three dashboards" (15m, 1H, Daily) covering **100+ tickers**, you add
  the *same* script to your chart multiple times, changing two inputs on
  each copy: **Dashboard Timeframe** and **Batch Index**.

That's still multiple indicator instances (3 timeframes × as many batches as
your list needs), but as of this version **you never manually split the
ticker list yourself.** Paste your one master list — the same exact text —
into every copy's **Master Tickers List** field. Each copy then pulls its own
40-symbol window out of that shared list automatically, based on its
**Batch Index** input (1 = tickers 1–40, 2 = 41–80, 3 = 81–120, …). The
dashboard's top status row tells you, e.g.:

```
Batch 2/3 · tickers 41–80 of 118 · TF 60
```

so you always know how many batch copies your current list actually needs
(`batchesNeeded` shown right there) — add or remove a batch copy as your list
crosses a 40-ticker boundary, nothing else changes.

Example layout for a ~120-ticker list:

| Copy | Dashboard Timeframe | Batch Index |
|------|---------------------|-------------|
| 15m-1 | `15` | `1` |
| 15m-2 | `15` | `2` |
| 15m-3 | `15` | `3` |
| 1H-1  | `60` | `1` |
| 1H-2  | `60` | `2` |
| 1H-3  | `60` | `3` |
| D-1   | `D`  | `1` |
| D-2   | `D`  | `2` |
| D-3   | `D`  | `3` |

Every one of those 9 copies has the **identical** Master Tickers List pasted
in — only Timeframe and Batch Index differ. TradingView free/paid plans limit
how many indicators can run on one chart at once (5 on Basic, more on paid
tiers), so a paid plan is effectively required to run all 9 simultaneously on
one chart. If that's a constraint, put each timeframe's batches on separate
saved chart layouts instead — alerts still fire from each independently.

## Adding/removing tickers going forward

This is now a one-place edit: update the **Master Tickers List** text (add or
remove symbols — stocks, ETFs, or indexes, comma-separated, no spaces
needed), then paste that same updated string into every dashboard copy's
Master Tickers List field. You don't need to figure out which batch a ticker
lands in — Batch Index handles the slicing. You only touch Batch Index /
add a new copy when the total count crosses a multiple of 40.

The script ships with the ~40 tickers visible in your screenshot as the
default list:

```
PLTR,SNAP,ON,SPOT,CAT,MCD,PFE,CIFR,MRK,AMD,ANET,ALAB,ZETA,OPEN,BKNG,LLY,UBER,SHOP,
EOSE,DIS,CVS,SNDK,IONQ,APP,DUOL,SOUN,FIG,ELF,SMR,AXON,DDOG,CELH,OSCR,QBTS,RGTI,
DKNG,MARA,NET,MP,TT
```

That was truncated by TradingView's "Show more" — paste your complete 100+
symbol list in. One ticker from your screenshot (`SPCX`) may not resolve on
TradingView since SpaceX isn't a listed public company on standard exchanges
— swap it for whatever symbol/exchange prefix your broker's data feed
actually publishes, or drop it.

**Indexes specifically**: this scanner's VWAP needs real traded volume. Raw
index tickers (`SPX`, `NDX`, `DJI`, `RUT`, …) typically report zero/no volume
on TradingView, so VWAP will come back `n/a` and those rows will never
signal. Use the tradable ETF proxy instead — `SPY`/`QQQ`/`DIA`/`IWM` — which
carries real volume and behaves correctly in this scanner.

## Setting up alerts

1. Add each dashboard copy to your chart (or a saved layout) with its
   Timeframe + Tickers batch configured.
2. Right-click the indicator → **Add Alert**.
3. **Condition**: select the indicator → choose **"Any alert() function
   call"**.
4. **Trigger**: **Once Per Bar Close** (the script already gates on closed
   bars internally, but this keeps TradingView from re-checking mid-bar).
5. The alert message is generated per-symbol automatically, e.g.:
   `🚀 UBER [60] 8EMA>21EMA>VWAP stack + clean 2-bar move + VWAP Rip`
6. Repeat for every dashboard copy (9 alerts total for the 3×3 setup above).

## Tuning

- **VWAP Anchor** (`Session` / `Week` / `Month`) — use `Session` for the 15m
  and 1H dashboards. On the **Daily** dashboard, a session-anchored VWAP
  resets every single bar and is meaningless — set it to `Week` or `Month`
  instead.
- **Min. body strength for 'VWAP Rip'** — how much of the candle's range must
  be real body (vs. wicks) to count as a breakout thrust. Default 50%.
- **Show only rows with an active signal** — toggle on to declutter the
  table to just the tickers currently flashing a setup.

## Notes / limitations

- All signal logic uses the two most recently **closed** bars on the chosen
  timeframe (via `[1]`/`[2]` offsets and `lookahead_off`), so it does not
  repaint intrabar.
- The bullish-only interpretation (EMA/VWAP stacked up, no-overlap gap **up**,
  candle closing green) matches "8ema > 21ema > vwap" as a long-bias trend
  filter. If you also want the mirrored bearish short setup
  (`8ema < 21ema < vwap` + gap-down stacking + rip/reversion under VWAP), say
  so and it can be added as a second signal column.
- This is a scanner/alerting tool, not a backtestable strategy — it uses
  `indicator()`, not `strategy()`, since the ask was for alerts across many
  symbols rather than a single-symbol backtest.
