import { describe, expect, it } from "vitest";

import {
  classOptions,
  EMPTY_FILTER,
  filterApps,
  isFilterActive,
  locationOptions,
  matchesQuery,
  type FilterableApp,
} from "@/lib/app-filters";

const app = (over: Partial<FilterableApp>): FilterableApp => ({
  app_no: 12,
  status: "new",
  student_class: "৮ম শ্রেণি",
  subject: "গণিত",
  location: "মিরপুর ১০",
  requirements: null,
  guardian_phone: "01712345678",
  ...over,
});

const mathClass8 = app({});
const physicsClass12 = app({
  app_no: 13,
  status: "found",
  student_class: "দ্বাদশ শ্রেণি",
  subject: "পদার্থবিজ্ঞান",
  location: "ধানমন্ডি",
});
const rows = [mathClass8, physicsClass12];

describe("Guardian application search", () => {
  it("finds an application by its number", () => {
    expect(matchesQuery(mathClass8, "12")).toBe(true);
    expect(matchesQuery(mathClass8, "13")).toBe(false);
  });

  it("treats Bengali and Latin digits as the same search", () => {
    expect(matchesQuery(mathClass8, "৮ম")).toBe(true);
    expect(matchesQuery(mathClass8, "8ম")).toBe(true);
  });

  it("searches subject, area and phone text", () => {
    expect(matchesQuery(physicsClass12, "পদার্থবি")).toBe(true);
    expect(matchesQuery(physicsClass12, "ধানমন্ডি")).toBe(true);
    expect(matchesQuery(mathClass8, "01712345678")).toBe(true);
    expect(matchesQuery(mathClass8, "উত্তরা")).toBe(false);
  });

  it("filters by class, area and status together", () => {
    expect(filterApps(rows, { ...EMPTY_FILTER, cls: "৮ম শ্রেণি" })).toEqual([mathClass8]);
    expect(filterApps(rows, { ...EMPTY_FILTER, loc: "ধানমন্ডি" })).toEqual([physicsClass12]);
    expect(filterApps(rows, { ...EMPTY_FILTER, status: "found" })).toEqual([physicsClass12]);
    expect(filterApps(rows, { ...EMPTY_FILTER, status: "found", loc: "মিরপুর ১০" })).toEqual([]);
  });

  it("combines the free-text search with a status filter", () => {
    expect(filterApps(rows, { ...EMPTY_FILTER, q: "গণিত", status: "found" })).toEqual([]);
    expect(filterApps(rows, { ...EMPTY_FILTER, q: "গণিত", status: "new" })).toEqual([mathClass8]);
  });

  it("keeps every application when nothing is searched or filtered", () => {
    expect(filterApps(rows, EMPTY_FILTER)).toHaveLength(2);
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(isFilterActive({ ...EMPTY_FILTER, loc: "ধানমন্ডি" })).toBe(true);
  });

  it("lists class choices in form order and area choices from the data", () => {
    expect(classOptions(rows, ["৮ম শ্রেণি", "দ্বাদশ শ্রেণি", "বিশ্ববিদ্যালয়"])).toEqual([
      "৮ম শ্রেণি",
      "দ্বাদশ শ্রেণি",
    ]);
    expect(locationOptions(rows)).toEqual(["মিরপুর ১০", "ধানমন্ডি"].sort((a, b) => a.localeCompare(b, "bn")));
  });
});
