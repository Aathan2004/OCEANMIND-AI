export interface PopulationDataPoint {
  year: number;
  population: number; // relative index (100 = baseline 1990)
  catch_mt: number; // metric tonnes (thousands)
}

export interface SpeciesTrend {
  id: string;
  common_name: string;
  scientific_name: string;
  iucn_status: string;
  family: string;
  region: string;
  color: string;
  data: PopulationDataPoint[];
}

export interface RegionalCatch {
  region: string;
  catch_2000: number;
  catch_2010: number;
  catch_2020: number;
  catch_2026: number;
}

export interface IUCNBreakdown {
  status: string;
  count: number;
  percentage: number;
  color: string;
}

// ── Species population trends ────────────────────────────────────────────────
//
// IMPORTANT: this is an ILLUSTRATIVE dataset, not official statistics.
//
// The series below are shaped after the broad trends in published FAO capture
// production and IUCN assessments so the charts have something realistic to
// render, but the individual numbers are not real measurements and must not be
// cited. The UI labels them as illustrative. Live, authoritative data is used
// elsewhere in the app: GBIF/WoRMS for species profiles and the IUCN Red List
// (via GBIF) for conservation status on the Fish ID page.

export const speciesTrends: SpeciesTrend[] = [
  {
    id: "bluefin_tuna",
    common_name: "Atlantic Bluefin Tuna",
    scientific_name: "Thunnus thynnus",
    iucn_status: "Endangered",
    family: "Scombridae",
    region: "Atlantic Ocean",
    color: "#ef4444",
    data: [
      { year: 1990, population: 100, catch_mt: 52 },
      { year: 1995, population: 88, catch_mt: 44 },
      { year: 2000, population: 71, catch_mt: 38 },
      { year: 2005, population: 58, catch_mt: 32 },
      { year: 2010, population: 52, catch_mt: 25 },
      { year: 2015, population: 61, catch_mt: 22 },
      { year: 2018, population: 69, catch_mt: 28 },
      { year: 2020, population: 74, catch_mt: 30 },
      { year: 2022, population: 78, catch_mt: 32 },
      { year: 2026, population: 82, catch_mt: 33 },
    ],
  },
  {
    id: "yellowfin_tuna",
    common_name: "Yellowfin Tuna",
    scientific_name: "Thunnus albacares",
    iucn_status: "Near Threatened",
    family: "Scombridae",
    region: "Indo-Pacific",
    color: "#f59e0b",
    data: [
      { year: 1990, population: 100, catch_mt: 980 },
      { year: 1995, population: 96, catch_mt: 1050 },
      { year: 2000, population: 91, catch_mt: 1200 },
      { year: 2005, population: 87, catch_mt: 1300 },
      { year: 2010, population: 83, catch_mt: 1280 },
      { year: 2015, population: 79, catch_mt: 1180 },
      { year: 2018, population: 77, catch_mt: 1140 },
      { year: 2020, population: 75, catch_mt: 1090 },
      { year: 2022, population: 74, catch_mt: 1050 },
      { year: 2026, population: 73, catch_mt: 1020 },
    ],
  },
  {
    id: "atlantic_cod",
    common_name: "Atlantic Cod",
    scientific_name: "Gadus morhua",
    iucn_status: "Vulnerable",
    family: "Gadidae",
    region: "North Atlantic",
    color: "#8b5cf6",
    data: [
      { year: 1990, population: 100, catch_mt: 800 },
      { year: 1995, population: 40, catch_mt: 180 },
      { year: 2000, population: 28, catch_mt: 80 },
      { year: 2005, population: 22, catch_mt: 55 },
      { year: 2010, population: 20, catch_mt: 48 },
      { year: 2015, population: 26, catch_mt: 62 },
      { year: 2018, population: 31, catch_mt: 74 },
      { year: 2020, population: 35, catch_mt: 80 },
      { year: 2022, population: 38, catch_mt: 85 },
      { year: 2026, population: 41, catch_mt: 90 },
    ],
  },
  {
    id: "salmon",
    common_name: "Atlantic Salmon",
    scientific_name: "Salmo salar",
    iucn_status: "Least Concern",
    family: "Salmonidae",
    region: "North Atlantic",
    color: "#06b6d4",
    data: [
      { year: 1990, population: 100, catch_mt: 640 },
      { year: 1995, population: 95, catch_mt: 580 },
      { year: 2000, population: 88, catch_mt: 490 },
      { year: 2005, population: 82, catch_mt: 420 },
      { year: 2010, population: 78, catch_mt: 390 },
      { year: 2015, population: 75, catch_mt: 360 },
      { year: 2018, population: 73, catch_mt: 340 },
      { year: 2020, population: 71, catch_mt: 320 },
      { year: 2022, population: 70, catch_mt: 310 },
      { year: 2026, population: 69, catch_mt: 300 },
    ],
  },
  {
    id: "sardine",
    common_name: "European Sardine",
    scientific_name: "Sardina pilchardus",
    iucn_status: "Least Concern",
    family: "Clupeidae",
    region: "Northeast Atlantic",
    color: "#10b981",
    data: [
      { year: 1990, population: 100, catch_mt: 420 },
      { year: 1995, population: 110, catch_mt: 450 },
      { year: 2000, population: 118, catch_mt: 480 },
      { year: 2005, population: 105, catch_mt: 440 },
      { year: 2010, population: 92, catch_mt: 380 },
      { year: 2015, population: 85, catch_mt: 340 },
      { year: 2018, population: 78, catch_mt: 300 },
      { year: 2020, population: 74, catch_mt: 280 },
      { year: 2022, population: 76, catch_mt: 290 },
      { year: 2026, population: 80, catch_mt: 310 },
    ],
  },
  {
    id: "swordfish",
    common_name: "Swordfish",
    scientific_name: "Xiphias gladius",
    iucn_status: "Least Concern",
    family: "Xiphiidae",
    region: "Global Oceans",
    color: "#f97316",
    data: [
      { year: 1990, population: 100, catch_mt: 290 },
      { year: 1995, population: 92, catch_mt: 280 },
      { year: 2000, population: 85, catch_mt: 270 },
      { year: 2005, population: 80, catch_mt: 260 },
      { year: 2010, population: 82, catch_mt: 265 },
      { year: 2015, population: 88, catch_mt: 275 },
      { year: 2018, population: 92, catch_mt: 285 },
      { year: 2020, population: 95, catch_mt: 290 },
      { year: 2022, population: 97, catch_mt: 295 },
      { year: 2026, population: 99, catch_mt: 298 },
    ],
  },
];

// ── Regional Catch Data ───────────────────────────────────────────────────────

export const regionalCatch: RegionalCatch[] = [
  {
    region: "Northwest Pacific",
    catch_2000: 21800,
    catch_2010: 20500,
    catch_2020: 20100,
    catch_2026: 19800,
  },
  {
    region: "Northeast Atlantic",
    catch_2000: 9800,
    catch_2010: 9100,
    catch_2020: 8400,
    catch_2026: 8200,
  },
  {
    region: "Western Indian Ocean",
    catch_2000: 4200,
    catch_2010: 4800,
    catch_2020: 5200,
    catch_2026: 5400,
  },
  {
    region: "Southeast Pacific",
    catch_2000: 14200,
    catch_2010: 8500,
    catch_2020: 9400,
    catch_2026: 8900,
  },
  {
    region: "Western Central Pacific",
    catch_2000: 9400,
    catch_2010: 11600,
    catch_2020: 12800,
    catch_2026: 13100,
  },
  {
    region: "Eastern Central Atlantic",
    catch_2000: 3800,
    catch_2010: 3600,
    catch_2020: 3400,
    catch_2026: 3300,
  },
  {
    region: "Northwest Atlantic",
    catch_2000: 2400,
    catch_2010: 2100,
    catch_2020: 1900,
    catch_2026: 1850,
  },
  {
    region: "Mediterranean & Black Sea",
    catch_2000: 1800,
    catch_2010: 1600,
    catch_2020: 1400,
    catch_2026: 1350,
  },
];

// ── IUCN Status Breakdown (globally tracked marine fish species) ──────────────

export const iucnBreakdown: IUCNBreakdown[] = [
  { status: "Least Concern", count: 8420, percentage: 57.4, color: "#22c55e" },
  { status: "Near Threatened", count: 1340, percentage: 9.1, color: "#86efac" },
  { status: "Vulnerable", count: 1820, percentage: 12.4, color: "#f97316" },
  { status: "Endangered", count: 1260, percentage: 8.6, color: "#ef4444" },
  { status: "Critically Endangered", count: 620, percentage: 4.2, color: "#dc2626" },
  { status: "Data Deficient", count: 880, percentage: 6.0, color: "#6b7280" },
  { status: "Not Evaluated", count: 320, percentage: 2.2, color: "#374151" },
];

// ── Global catch trend (illustrative, 1990-2026) ─────────────────────────────

export const globalCatchTrend = [
  { year: "1990", total: 85200 },
  { year: "1993", total: 87100 },
  { year: "1996", total: 93800 },
  { year: "1999", total: 91200 },
  { year: "2002", total: 84600 },
  { year: "2005", total: 86900 },
  { year: "2008", total: 89200 },
  { year: "2011", total: 83400 },
  { year: "2014", total: 91800 },
  { year: "2017", total: 92400 },
  { year: "2019", total: 91100 },
  { year: "2021", total: 89200 },
  { year: "2023", total: 87800 },
  { year: "2026", total: 88100 },
];
