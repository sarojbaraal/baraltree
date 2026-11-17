import { describe, expect, it } from "vitest";
import { buildPersonPayload, describeRequest } from "../requests";
import { checkNewDocs } from "../docs";
import { oppositeGender } from "../text";
import type { ChangeRequest, VPerson } from "../types";

const person = (o: Partial<VPerson> = {}): VPerson => ({
  id: "p1", name: "राम बराल", gender: "M", father_id: null, mother_id: null, spouse_id: null, is_living: true, created_at: "", ...o,
});
const values = (o: Record<string, string | boolean> = {}) => ({
  name: "राम बराल", gender: "M", is_living: true, marital_status: "unknown", organization: "", ...o,
});
const fbOk = () => true;

describe("marital status / organization in the payload", () => {
  it("an untouched person sends nothing (stale cache without the field counts as unknown)", () => {
    const r = buildPersonPayload({ action: "update", person: person(), married: false, values: values() }, fbOk);
    expect(r.error).toBe("कुनै परिवर्तन गरिएको छैन।");
  });
  it("sends only the changed fields", () => {
    const r = buildPersonPayload(
      { action: "update", person: person({ marital_status: "unknown" }), married: true, values: values({ marital_status: "married", organization: "नेपाल बैंक" }) },
      fbOk
    );
    expect(r.payload).toMatchObject({ marital_status: "married", organization: "नेपाल बैंक" });
    expect(r.payload).not.toHaveProperty("name");
  });
  it("a married person is not changed to unmarried while a spouse is linked", () => {
    const r = buildPersonPayload(
      { action: "update", person: person({ spouse_id: "p2", marital_status: "married" }), married: false, values: values({ marital_status: "unmarried" }) },
      fbOk
    );
    expect(r.error).toMatch(/अविवाहित/);
  });
  it("a new person defaults to unknown", () => {
    const r = buildPersonPayload({ action: "add", person: null, married: false, values: values({ marital_status: "" }) }, fbOk);
    expect(r.payload?.marital_status).toBe("unknown");
  });
  it("marriage date is dropped when the person is not married/divorced", () => {
    const r = buildPersonPayload({ action: "add", person: null, married: false, values: values({ marriage_bs: "" }) }, fbOk);
    expect(r.payload?.marriage_bs).toBe("");
  });
});

describe("documents in the payload", () => {
  const doc = (p: string) => ({ path: p, name: p + ".pdf", size: 10 });
  it("unchanged list is not sent", () => {
    const r = buildPersonPayload(
      { action: "update", person: person({ documents: [doc("a")] }), married: false, values: values({ organization: "x" }), documents: [doc("a")] },
      fbOk
    );
    expect(r.payload).not.toHaveProperty("documents");
  });
  it("added and removed documents are sent as the whole new list", () => {
    const add = buildPersonPayload({ action: "update", person: person({ documents: [doc("a")] }), married: false, values: values(), documents: [doc("a"), doc("b")] }, fbOk);
    expect(add.payload?.documents).toEqual([doc("a"), doc("b")]);
    const del = buildPersonPayload({ action: "update", person: person({ documents: [doc("a")] }), married: false, values: values(), documents: [] }, fbOk);
    expect(del.payload?.documents).toEqual([]);
  });
  it("a document-only change is a valid change", () => {
    const r = buildPersonPayload({ action: "update", person: person(), married: false, values: values(), documents: [doc("a")] }, fbOk);
    expect(r.error).toBeUndefined();
  });
  it("describeRequest shows names and the Nepali status label", () => {
    const rq = { id: "1", requested_by: "u", action: "update", person_id: "p1", status: "pending", created_at: "", note: null,
      payload: { documents: [doc("a")], marital_status: "divorced" } } as ChangeRequest;
    const lines = describeRequest(rq, {}).lines.join("|");
    expect(lines).toContain("a.pdf");
    expect(lines).toContain("सम्बन्ध विच्छेद");
  });
});

describe("helpers", () => {
  it("opposite gender", () => {
    expect(oppositeGender("M")).toBe("F");
    expect(oppositeGender("F")).toBe("M");
    expect(oppositeGender("O")).toBe("");
    expect(oppositeGender("")).toBe("");
  });
  it("PDF limits", () => {
    const f = (name: string, type: string, size: number) => ({ name, type, size });
    expect(checkNewDocs(0, [f("a.pdf", "application/pdf", 100)])).toBe("");
    expect(checkNewDocs(0, [f("a.jpg", "image/jpeg", 100)])).toMatch(/PDF होइन/);
    expect(checkNewDocs(0, [f("a.pdf", "application/pdf", 11 * 1024 * 1024)])).toMatch(/१०MB/);
    expect(checkNewDocs(9, [f("a.pdf", "application/pdf", 1), f("b.pdf", "application/pdf", 1)])).toMatch(/बढीमा 10/);
  });
});
