// Search/filter rules for the dashboard Applications tab. Kept free of UI so the
// rules can be unit tested (src/test/app-filters.test.ts).

export type AppFilter = {
  q: string;
  cls: string;
  loc: string;
  status: string;
};

export const EMPTY_FILTER: AppFilter = { q: "", cls: "", loc: "", status: "all" };

/** The columns the search reads; the dashboard row carries more fields than this. */
export type FilterableApp = {
  app_no: number;
  status: string;
  student_class: string;
  subject: string;
  location: string;
  requirements: string | null;
  guardian_phone: string;
};

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

// Guardian applications are stored with Bengali labels, so "৮ম" and "8ম" must search alike.
function normalize(s: string): string {
  return Array.from(s.trim().toLowerCase())
    .map((ch) => {
      const i = BN_DIGITS.indexOf(ch);
      return i >= 0 ? String(i) : ch;
    })
    .join("");
}

export function matchesQuery(app: FilterableApp, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  if (String(app.app_no).includes(q)) return true;
  return [app.student_class, app.subject, app.location, app.requirements ?? "", app.guardian_phone]
    .some((f) => normalize(f).includes(q));
}

export function filterApps<T extends FilterableApp>(apps: T[], f: AppFilter): T[] {
  return apps.filter(
    (a) =>
      (f.status === "all" || a.status === f.status) &&
      (f.cls === "" || a.student_class === f.cls) &&
      (f.loc === "" || a.location === f.loc) &&
      matchesQuery(a, f.q),
  );
}

export function isFilterActive(f: AppFilter): boolean {
  return f.q !== "" || f.cls !== "" || f.loc !== "" || f.status !== "all";
}

function distinct(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "bn"),
  );
}

/** Class choices: the form's class list first, then anything unexpected in the data. */
export function classOptions<T extends FilterableApp>(apps: T[], classList: string[]): string[] {
  const seen = distinct(apps.map((a) => a.student_class));
  const known = classList.filter((c) => seen.includes(c));
  return [...known, ...seen.filter((c) => !known.includes(c))];
}

/** Location choices: every district/area actually used by a guardian. */
export function locationOptions<T extends FilterableApp>(apps: T[]): string[] {
  return distinct(apps.map((a) => a.location));
}
