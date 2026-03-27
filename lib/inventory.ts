export interface Listing {
  warehouse: string;
  city: string;
  state: string;
  supplier: string;
  countryOfOrigin: string;
  quantity: number;
  weightLbs: number;
  arrived: string;
  minBBD: string;
  contracts: string[];
  unitType?: string;
  packDetail?: string;
}

export interface Product {
  id: string;
  product: string;
  commodity: string;
  category: string;
  format: string;
  processType: string;
  specification: string | null;
  variety: string | null;
  grade: string | null;
  organic: boolean;
  certifications: string[];
  packSize: string;
  unitType: string;
  storageType?: string;
  listings: Listing[];
}

export interface InventoryData {
  lastUpdated: string;
  products: Product[];
}

export function getTotalQuantity(product: Product): number {
  return product.listings.reduce((sum, l) => sum + l.quantity, 0);
}

export function getTotalWeight(product: Product): number {
  return product.listings.reduce((sum, l) => sum + l.weightLbs, 0);
}

export function getUniqueWarehouses(product: Product): string[] {
  const seen = new Set<string>();
  return product.listings
    .map((l) => `${l.warehouse}, ${l.city}, ${l.state}`)
    .filter((w) => {
      if (seen.has(w)) return false;
      seen.add(w);
      return true;
    });
}

export function getUniqueCOOs(product: Product): string[] {
  return [...new Set(product.listings.map((l) => l.countryOfOrigin))];
}

export function formatWeight(lbs: number): string {
  return lbs.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " lbs";
}

export function formatQuantity(qty: number, unitType: string): string {
  return qty.toLocaleString("en-US") + " " + unitType;
}

export function getFilterOptions(products: Product[]) {
  const commodities = [...new Set(products.map((p) => p.commodity))].sort();
  const formats = [...new Set(products.map((p) => p.format))].sort();
  const origins = [
    ...new Set(products.flatMap((p) => p.listings.map((l) => l.countryOfOrigin))),
  ].sort();
  const states = [
    ...new Set(products.flatMap((p) => p.listings.map((l) => l.state))),
  ].sort();

  return { commodities, formats, origins, states };
}
