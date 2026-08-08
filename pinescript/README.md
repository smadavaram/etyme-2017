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
   `🚀 UBER [60] px=87.40 8EMA>21EMA>VWAP + clean 2-bar move + VWAP Rip`
6. Repeat for every dashboard copy (9 alerts total for the 3×3 setup above).

### Cutting alert noise

- **Alert cooldown (closed bars)** — if a signal stays true across several
  consecutive closes (trend still stacked, no new pattern), this input
  suppresses repeat alerts for that *same symbol* until N closed bars have
  passed. Tracked per symbol by name via a map, so it survives you
  reordering or editing the ticker list. Default `0` = alert on every
  qualifying close (no suppression).
- **Cross-dashboard duplicates aren't technically de-dupable.** Each of the
  9 copies is a fully separate script instance with no shared state, so if
  the same ticker qualifies on both the 15m and 1H dashboard around the
  same time, you'll get two distinct alerts — Pine has no mechanism for one
  instance to know what another just fired. Two practical mitigations: (a)
  name each TradingView alert distinctly per dashboard (e.g. "EV 15m",
  "EV 1H", "EV Daily") so you can tell at a glance which timeframe fired,
  or (b) if 15m/1H overlap is mostly noise for your style, don't run every
  timeframe on every symbol — e.g. only keep the Daily dashboard for slower
  names and 15m/1H for the ones you actively day-trade.

## Tuning

- **VWAP Anchor** (`Session` / `Week` / `Month`) — use `Session` for the 15m
  and 1H dashboards. On the **Daily** dashboard, a session-anchored VWAP
  resets every single bar and is meaningless — set it to `Week` or `Month`
  instead.
- **Min. body strength for 'VWAP Rip'** — how much of the candle's range must
  be real body (vs. wicks) to count as a breakout thrust. Default 50%.
- **Show only rows with an active signal** — toggle on to declutter the
  table to just the tickers currently flashing a setup.
- **Alert cooldown** — see "Cutting alert noise" above.

## Optimizing the signal thresholds

Pine has no multi-symbol backtester — the Strategy Tester (and its
"Optimize"/parameter-sweep feature, where available on your plan) only runs
against one instrument at a time. So thresholds are tuned with a separate
companion script, `ema-vwap-backtest.pine`, not the scanner itself:

1. Add `ema-vwap-backtest.pine` to a chart for **one ticker at a time** —
   pick 3–5 representative names from your list (mix of high/low volatility,
   stock + ETF) rather than optimizing against a single symbol.
2. Open the **Strategy Tester** tab. It exposes the exact same knobs as the
   scanner (EMA lengths, body-strength %, VWAP anchor) plus an **Exit rule**
   the original setup didn't specify — `Trend Flip` (exit when 8EMA crosses
   back below 21EMA), `Fixed %` stop/target, or `ATR Multiple` stop/target.
3. Adjust inputs and compare **Win Rate, Profit Factor, and Max Drawdown**
   together — not Net Profit alone, which one lucky trade can dominate on a
   short backtest window. Use the **Backtest start** input to control how
   much history is included.
4. Once a setting holds up across several symbols (not just the one that
   happened to backtest best), set that same value as the **default** on
   the matching input in `ema-vwap-scanner.pine` so all 9 dashboard copies
   pick it up.

## Performance

- The scanner only re-scans its full ticker batch when the **dashboard's own
  timeframe** closes a genuinely new bar — detected with a single cheap
  `request.security` time check up front — instead of on every realtime
  tick. Since every signal input is built from already-closed bars (`[1]`/
  `[2]`), nothing is lost by skipping the in-between ticks; this is what
  keeps a 40-symbol loop from re-running dozens of times a second on a fast
  chart timeframe.
- The **status row** at the top of the table also flags a **misconfigured
  batch** in red — e.g. if you trim your ticker list down to 90 symbols but
  still have a Batch Index `3` copy running (which now has nothing to scan),
  it'll show `⚠ Batch 3 unused — list only needs 3 batch(es)` (or however
  many are actually needed) so you know to lower that copy's Batch Index or
  delete it, instead of it silently sitting there wasting a chart slot.

## Notes / limitations

- All signal logic uses the two most recently **closed** bars on the chosen
  timeframe (via `[1]`/`[2]` offsets and `lookahead_off`), so it does not
  repaint intrabar.
- The bullish-only interpretation (EMA/VWAP stacked up, no-overlap gap **up**,
  candle closing green) matches "8ema > 21ema > vwap" as a long-bias trend
  filter. If you also want the mirrored bearish short setup
  (`8ema < 21ema < vwap` + gap-down stacking + rip/reversion under VWAP), say
  so and it can be added as a second signal column.
- `ema-vwap-scanner.pine` is the multi-symbol scanner/alerting tool
  (`indicator()`). `ema-vwap-backtest.pine` is the single-symbol tuning tool
  (`strategy()`) described above — they share identical signal logic so
  values tune on one and transfer directly to the other.
