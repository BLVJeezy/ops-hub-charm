import { describe, expect, it } from "vitest";
import { isDuplicate, parseCsv, parseRevolutCsv, rulePattern } from "./bank";

const CSV = `Date started (UTC),Date completed (UTC),ID,Type,State,Description,Reference,Payer,Card number,Orig currency,Orig amount,Payment currency,Amount,Fee,Balance,Account
2026-11-10,2026-11-10,abc-1,TOPUP,COMPLETED,Money added from RIORY,XQJ68I3,,,EUR,500.00,EUR,500.00,0.00,900.00,Main · EUR
2026-11-09,2026-11-09,abc-2,CARD_PAYMENT,COMPLETED,Resend,,,4242,GBP,-15.58,EUR,-18.69,-0.18,400.00,Main · EUR
2026-11-08,,abc-3,CARD_PAYMENT,PENDING,Lovable,,,4242,EUR,-25.00,EUR,-25.00,0.00,,Main · EUR
2026-11-08,2026-11-08,abc-4,EXCHANGE,COMPLETED,"Main · EUR -> Main · GBP, test",,,,EUR,-6.39,EUR,-6.39,0.00,,Main · EUR
2026-11-07,2026-11-07,abc-5,CARD_PAYMENT,COMPLETED,Something,,,,USD,-10.00,USD,-10.00,0.00,,Main · USD`;

describe("bank import", () => {
  it("splits quoted csv", () => {
    expect(parseCsv('a,b\n"x, y",2\n')).toEqual([["a", "b"], ["x, y", "2"]]);
    expect(parseCsv("a;b\n1,5;2\n")).toEqual([["a", "b"], ["1,5", "2"]]);
  });
  it("parses a Revolut Business csv", () => {
    const { rows, skipped } = parseRevolutCsv(CSV);
    expect(skipped).toBe(2); // pending + USD account
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ hash: "rvcsv-abc-1", date: "2026-11-10", type: "MOA", amount: 500, description: "Money added from RIORY • XQJ68I3" });
    expect(rows[1]).toMatchObject({ type: "CAR", amount: -18.87, orig_currency: "GBP", orig_amount: 15.58, fee: 0.18 });
    expect(rows[2]).toMatchObject({ type: "EXO", amount: -6.39 });
    expect(parseRevolutCsv("foo,bar\n1,2").error).toBeTruthy();
  });
  it("detects duplicates from the pdf import", () => {
    const existing = [{ date: "2026-11-10", amount: 500, description: "Money added from RIORY • XQJ68I3" }];
    expect(isDuplicate({ date: "2026-11-10", amount: 500, description: "Money added from RIORY" }, existing)).toBe(true);
    expect(isDuplicate({ date: "2026-11-10", amount: 501, description: "Money added from RIORY" }, existing)).toBe(false);
  });
  it("suggests rule patterns", () => {
    expect(rulePattern("CAR", "Shell 7684 Tongere 0684")).toBe("CAR Shell%");
    expect(rulePattern("MOS", "To Muhammad Masae • Solyn Global")).toBe("MOS To Muhammad Masae%");
  });
});
