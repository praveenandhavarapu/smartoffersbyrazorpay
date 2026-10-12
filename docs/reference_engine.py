"""Smart Offers reference engine (Python). The TypeScript engine must reproduce
fixtures/expected_outputs.json exactly (money to the rupee after rounding).

Run:  python3 docs/reference_engine.py      -> rewrites fixtures/expected_outputs.json
All money in INR. Conversions are fractions (0.24 = 24%). Lifts in the fixture are
percentage points (pp) and are divided by 100 here.
"""
import json, math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FX = lambda name: json.load(open(os.path.join(ROOT, "fixtures", name), encoding="utf-8"))

PROFILE = FX("alpha_profile.json")
GROUPS = {g["id"]: g for g in FX("alpha_groups_sep2026.json")["groups"]}
OFFERS = {o["id"]: o for o in FX("offers.json")["ladder"]}
CREATORS = FX("creator_codes.json")["codes"]
PILOT = FX("pilot_truth.json")


def rhu(x):
    """round half up (JS: Math.floor(x + 0.5)) for non-negative numbers"""
    return int(math.floor(x + 0.5))


def per_checkout(g, offer_id, margin):
    """Economics per eligible checkout for one group and one offer."""
    grp = GROUPS[g]
    lift = grp["lifts_pp"][offer_id] / 100
    cost = OFFERS[offer_id]["cost_per_order_inr"]
    p = grp["base_conversion"] + lift          # buy rate with the offer
    spend = p * cost                           # discount is paid to EVERY buyer
    extra_sales = lift * grp["aov_inr"]        # only extra buyers create value
    profit = extra_sales * margin - spend
    ret = extra_sales / spend if spend else 0
    return dict(spend=spend, extra_sales=extra_sales, profit=profit, ret=ret, lift=lift)


def plan(budget=100000, margin=None, floor=None, coverage=None, allowed=None):
    """Goal = MOST PROFIT. For each group pick the offer with the highest extra
    profit whose return >= floor (default break-even = 1/margin). If total spend
    exceeds budget, repeatedly apply the cheapest downgrade: the switch (to a
    cheaper offer or to none) that loses the least profit per rupee saved."""
    margin = margin if margin is not None else PROFILE["gross_margin_pct"] / 100
    floor = floor if floor is not None else 1 / margin
    coverage = coverage if coverage is not None else 1 - PROFILE["pilot"]["holdout_pct"] / 100

    def opts(g):
        out = [("none", dict(spend=0, extra_sales=0, profit=0, ret=0, lift=0))]
        for o in GROUPS[g]["lifts_pp"]:
            if allowed and o not in allowed:
                continue
            e = per_checkout(g, o, margin)
            if e["ret"] >= floor - 1e-12:
                out.append((o, e))
        return out

    choice = {}
    for g in GROUPS:
        best = max(opts(g), key=lambda t: (round(t[1]["profit"], 9), -t[1]["spend"]))
        choice[g] = best if best[1]["profit"] > 1e-9 else opts(g)[0]

    def totals(ch):
        t = dict(spend=0.0, extra_sales=0.0, extra_orders=0.0)
        for g, (o, e) in ch.items():
            n = GROUPS[g]["checkouts"] * coverage
            t["spend"] += n * e["spend"]
            t["extra_sales"] += n * e["extra_sales"]
            t["extra_orders"] += n * e["lift"]
        return t

    t = totals(choice)
    downgraded = t["spend"] > budget + 1e-6
    while t["spend"] > budget + 1e-6:
        cands = []
        for g, (o, e) in choice.items():
            if o == "none":
                continue
            for o2, e2 in opts(g):
                saved = e["spend"] - e2["spend"]
                if o2 == o or saved <= 0:
                    continue
                cands.append(((e["profit"] - e2["profit"]) / saved, g, (o2, e2)))
        cands.sort(key=lambda c: c[0])
        _, g, new = cands[0]
        choice[g] = new
        t = totals(choice)

    # Refill (v3): the greedy downgrades can leave budget unused. Add the upgrade with the largest
    # profit gain that still fits, until none does. Plans that never hit the budget are unchanged.
    while downgraded:
        room = budget - t["spend"]
        best = None
        for g, (o, e) in choice.items():
            n = GROUPS[g]["checkouts"] * coverage
            for o2, e2 in opts(g):
                gain = (e2["profit"] - e["profit"]) * n
                extra = (e2["spend"] - e["spend"]) * n
                if gain > 1e-9 and extra <= room + 1e-6 and (best is None or gain > best[0] + 1e-9):
                    best = (gain, g, (o2, e2))
        if best is None:
            break
        choice[best[1]] = best[2]
        t = totals(choice)

    rows = []
    for g, (o, e) in choice.items():
        n = GROUPS[g]["checkouts"] * coverage
        rows.append(dict(group=g, offer=o, spend=round(n * e["spend"]), extra_sales=round(n * e["extra_sales"]),
                         extra_orders=round(n * e["lift"], 1), ret=round(e["ret"], 2)))
    profit = t["extra_sales"] * margin - t["spend"]
    return dict(rows=rows, spend=round(t["spend"]), extra_sales=round(t["extra_sales"]),
                extra_orders=round(t["extra_orders"], 1),
                ret=round(t["extra_sales"] / t["spend"], 2) if t["spend"] else 0, profit=round(profit))


def codes_economics(code_filter, margin=0.40):
    """Economics of today's codes (no holdout existed; lifts are network estimates)."""
    S = X = O = 0.0
    rows = []
    for g, grp in GROUPS.items():
        s = x = o = 0.0
        for u in grp["today"]:
            if not code_filter(u["code"]):
                continue
            n = grp["checkouts"] * u["share"]
            l = u["lift_pp"] / 100
            s += n * (grp["base_conversion"] + l) * u["discount_inr"]
            x += n * l * grp["aov_inr"]
            o += n * l
        if s:
            rows.append(dict(group=g, spend=round(s), extra_sales=round(x), extra_orders=round(o, 1), ret=round(x / s, 2)))
        S += s; X += x; O += o
    return dict(rows=rows, spend=round(S), extra_sales=round(X), extra_orders=round(O, 1),
                ret=round(X / S, 2), profit=round(X * margin - S))


def pilot_day(days=None):
    """Exact-count pilot results vs the 10% holdout, with 90% ranges."""
    days = days or PILOT["days_elapsed"]
    margin = PROFILE["gross_margin_pct"] / 100
    p = plan()
    offer_of = {r["group"]: r["offer"] for r in p["rows"]}
    out, S, X, O, VAR = [], 0.0, 0.0, 0.0, 0.0
    for g, grp in GROUPS.items():
        n = grp["checkouts"] * days / 30
        nt, nh = rhu(n * 0.9), rhu(n * 0.1)
        o = offer_of[g]
        lift_true = PILOT["actual_lift_pp"].get(g, 0) / 100 if o != "none" else 0
        ot, oh = rhu(nt * (grp["base_conversion"] + lift_true)), rhu(nh * grp["base_conversion"])
        pt, ph = ot / nt, oh / nh
        lift = pt - ph
        se = math.sqrt(pt * (1 - pt) / nt + ph * (1 - ph) / nh)
        extra = nt * lift
        spend = ot * OFFERS[o]["cost_per_order_inr"]
        sales = extra * grp["aov_inr"]
        row = dict(group=g, offer=o, treated_checkouts=nt, treated_orders=ot, holdout_checkouts=nh, holdout_orders=oh,
                   treated_rate=round(pt * 100, 1), holdout_rate=round(ph * 100, 1), lift_pp=round(lift * 100, 1),
                   lift_range_pp=[round((lift - 1.645 * se) * 100, 1), round((lift + 1.645 * se) * 100, 1)],
                   still_learning=(lift - 1.645 * se) <= 0, trust_weight=round(nh / (nh + 300), 2))
        if o != "none":
            row.update(spend=spend, extra_orders=round(extra, 1), extra_sales=round(sales), ret=round(sales / spend, 2))
            S += spend; X += sales; O += extra
            VAR += (nt * se) ** 2
        out.append(row)
    sd_orders = math.sqrt(VAR)
    aov_mix = X / O if O else 0
    return dict(days=days, rows=out, spend=round(S), extra_sales=round(X), extra_orders=round(O, 1),
                extra_orders_range=[round(O - 1.645 * sd_orders), round(O + 1.645 * sd_orders)],
                ret=round(X / S, 2), ret_range=[round((O - 1.645 * sd_orders) * aov_mix / S, 2), round((O + 1.645 * sd_orders) * aov_mix / S, 2)],
                profit=round(X * margin - S),
                budget_pace=round(plan()["spend"] * days / 30),
                alpha10_same_period_profit=round(codes_economics(lambda c: c == "ALPHA10")["profit"] * days / 30),
                returning_not_given_away=round([r for r in codes_economics(lambda c: c == "ALPHA10")["rows"] if r["group"] == "returning"][0]["spend"] * days / 30))


def creator_report():
    rows = []
    for c in CREATORS:
        share = c["returning_uses"] / c["uses"]
        rows.append(dict(code=c["code"], creator=c["creator"], uses=c["uses"], returning_uses=c["returning_uses"],
                         returning_share_pct=round(share * 100), discount_to_returning=c["returning_uses"] * 250,
                         flag=share > 0.30))
    ret_uses = sum(c["returning_uses"] for c in CREATORS)
    # first-order-only fix: returning buyers lose ₹250; ~3 in 100 of their checkouts would not buy without it
    ret_checkouts = GROUPS["returning"]["checkouts"] * 0.25
    lost_orders = ret_checkouts * 0.03
    saved = ret_uses * 250
    net = saved - lost_orders * GROUPS["returning"]["aov_inr"] * 0.40
    return dict(rows=rows, total_uses=sum(c["uses"] for c in CREATORS), returning_uses=ret_uses,
                monthly_discount_to_returning=saved, first_order_only_net_gain=round(net), lost_orders=round(lost_orders, 1))


if __name__ == "__main__":
    m = PROFILE["gross_margin_pct"] / 100
    base_orders = sum(g["checkouts"] * g["base_conversion"] for g in GROUPS.values())
    a10 = codes_economics(lambda c: c == "ALPHA10")
    creator_extra_orders = sum(GROUPS[g]["checkouts"] * u["share"] * u["lift_pp"] / 100
                               for g in GROUPS for u in GROUPS[g]["today"] if u["code"] == "CREATOR15")  # = 60
    orders_today = base_orders + a10["extra_orders"] + creator_extra_orders
    p = plan()
    orders_plan = base_orders + p["extra_orders"] + creator_extra_orders
    gmv = sum(g["checkouts"] * g["base_conversion"] * g["aov_inr"] for g in GROUPS.values()) + \
        codes_economics(lambda c: True)["extra_sales"]
    returning_row = [r for r in a10["rows"] if r["group"] == "returning"][0]

    def with_orders(res):
        """Add store orders per month and % change vs today (creator codes keep running in every scenario)."""
        o = base_orders + res["extra_orders"] + creator_extra_orders
        res = dict(res)
        res["orders"] = round(o)
        res["orders_change_pct"] = round((o / orders_today - 1) * 100, 1)
        return res

    def fee_basis(snap):
        """Fee shown (not charged in pilot): 1% of proven extra sales, where proven = the ROUNDED lower bound of
        extra orders x the snapshot's average extra-order value; capped at 20% of extra profit."""
        mix = snap["extra_sales"] / snap["extra_orders"]
        proven_sales = snap["extra_orders_range"][0] * mix
        fee = min(0.01 * proven_sales, 0.20 * max(snap["profit"], 0))
        return dict(avg_extra_order_value=round(mix, 1), proven_extra_orders=snap["extra_orders_range"][0],
                    proven_extra_sales=round(proven_sales), fee=round(fee), cap=round(0.20 * max(snap["profit"], 0)))

    out = {
        "_note": "Generated by docs/reference_engine.py from fixtures. Engine tests must match these values. Python rounds halves to even: use roundHalfEven in TS, and allow +/- 1 rupee on money and +/- 0.01 on returns.",
        "store_month": dict(checkouts=sum(g["checkouts"] for g in GROUPS.values()), orders=round(orders_today),
                            gmv_inr=round(gmv), aov_inr=round(gmv / orders_today), break_even_return=round(1 / m, 2)),
        "today_alpha10": dict(**a10, to_returning=returning_row["spend"],
                              to_returning_pct=round(returning_row["spend"] / a10["spend"] * 100, 1)),
        "today_all_codes": codes_economics(lambda c: True),
        "rule_first_order_only": None,
        "plan_most_profit_budget_100k": with_orders(p),
        "creator_code_extra_orders_per_month": round(creator_extra_orders, 1),
        "plan_without_holdout_profit": plan(coverage=1.0)["profit"],
        "orders": dict(today=round(orders_today), with_plan=round(orders_plan),
                       change_pct=round((orders_plan / orders_today - 1) * 100, 1)),
        "profit_swing_vs_alpha10": p["profit"] - a10["profit"],
        "scenario_floor_4x": with_orders(plan(floor=4.0)),
        "scenario_floor_3x": with_orders(plan(floor=3.0)),
        "scenario_margin_30pct": with_orders(plan(margin=0.30)),
        "old_plan_profit_if_margin_is_30pct": round(p["extra_sales"] * 0.30 - p["spend"]),
        "scenario_budget_50k": with_orders(plan(budget=50000)),
        "override_returning_flat_100": None,
        "holdout_cost_per_month": dict(extra_orders=round(p["extra_orders"] / 9, 1), extra_sales=round(p["extra_sales"] / 9),
                                       profit=round(p["profit"] / 9)),
        "pilot_day_20": pilot_day(20),
        "pilot_day_60": pilot_day(60),
        "fee_basis_day_20": None,
        "fee_basis_day_60": None,
        "creator_codes": creator_report(),
    }
    # simple rule baseline: ALPHA10 only for first orders (the three new non-creator groups)
    rule = dict(spend=0.0, extra_sales=0.0)
    for r in a10["rows"]:
        if r["group"] in ("new_ads_small", "new_ads_big", "new_organic"):
            rule["spend"] += r["spend"]; rule["extra_sales"] += r["extra_sales"]
    out["rule_first_order_only"] = dict(spend=round(rule["spend"]), extra_sales=round(rule["extra_sales"]),
                                        ret=round(rule["extra_sales"] / rule["spend"], 2),
                                        profit=round(rule["extra_sales"] * m - rule["spend"]))
    out["rule_first_order_only_same_shoppers_90pct"] = dict(
        spend=round(rule["spend"] * 0.9), extra_sales=round(rule["extra_sales"] * 0.9),
        ret=round(rule["extra_sales"] / rule["spend"], 2), profit=round((rule["extra_sales"] * m - rule["spend"]) * 0.9),
        note="like-for-like with the engine plan, which also leaves out the 10% holdout")
    out["fee_basis_day_20"] = fee_basis(out["pilot_day_20"])
    out["fee_basis_day_60"] = fee_basis(out["pilot_day_60"])
    # pilot fixture must use the engine's plan offers
    truth_offers = PILOT.get("plan_offers")
    assert truth_offers == {r["group"]: r["offer"] for r in p["rows"]}, "pilot_truth.plan_offers must match the engine plan"
    # override: merchant forces ₹100 off for returning buyers (90% coverage)
    e = per_checkout("returning", "flat_100", m); n = GROUPS["returning"]["checkouts"] * 0.9
    out["override_returning_flat_100"] = dict(spend=round(n * e["spend"]), extra_orders=round(n * e["lift"], 1),
                                              extra_sales=round(n * e["extra_sales"]), ret=round(e["ret"], 2),
                                              profit=round(n * e["profit"]))
    json.dump(out, open(os.path.join(ROOT, "fixtures", "expected_outputs.json"), "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(json.dumps({k: (v if not isinstance(v, dict) else {kk: vv for kk, vv in v.items() if kk not in ("rows",)}) for k, v in out.items()}, indent=1, ensure_ascii=False))
