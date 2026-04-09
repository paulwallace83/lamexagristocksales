import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getProductById, getAllProductIds } from "@/lib/inventory-db";
import {
  getTotalQuantity,
  getTotalWeight,
  formatWeight,
  formatQuantity,
  getBaseContracts,
} from "@/lib/inventory";
import type { Listing, Lot } from "@/lib/inventory";
import {
  getDocumentsForProduct,
  getRequiredDocs,
  getCategoryLabel,
  getDocumentUrl,
} from "@/lib/documents";
import type { DocumentEntry, DocCategory } from "@/lib/documents";
import { countryFlag } from "@/lib/country-flags";
import { getCoaDataForLots, formatCoaFields, detectCoaTestTypes } from "@/lib/coa-data";
import type { CoaData } from "@/lib/coa-data";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return getAllProductIds().map((id) => ({ id }));
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = getProductById(id);

  if (!product) notFound();

  const totalQty = getTotalQuantity(product);
  const totalWeight = getTotalWeight(product);
  const documents = getDocumentsForProduct(id);
  const allLotIds = product.listings.flatMap((l) => l.lots.map((lot) => lot.id));
  const coaDataMap = getCoaDataForLots(allLotIds);
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/" className="hover:text-[#4a90c4] transition-colors">Inventory</Link>
        <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-900 font-medium">{product.product}</span>
      </nav>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1a2b5f] to-[#243f75] px-6 py-6 text-white">
          <h1 className="text-2xl md:text-3xl font-bold">{product.product}</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            {product.organic ? (
              <span className="bg-green-500/20 text-green-100 text-xs font-semibold px-2.5 py-1 rounded border border-green-400/30">
                Organic
              </span>
            ) : (
              <span className="bg-white/10 text-white/80 text-xs font-semibold px-2.5 py-1 rounded border border-white/10">
                Conventional
              </span>
            )}
            {product.certifications.filter((c) => c !== "Organic").map((c) => (
              <span key={c} className="bg-white/10 text-white/80 text-xs font-medium px-2.5 py-1 rounded border border-white/10">{c}</span>
            ))}
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-200">
          <SummaryCell label="Format" value={product.format} />
          <SummaryCell label="Process" value={product.processType} />
          <SummaryCell label="Specification" value={product.specification || "—"} />
          <SummaryCell label="Pack Size" value={product.packSize} />
          <SummaryCell label="Total Quantity" value={formatQuantity(totalQty, product.unitType)} />
          <SummaryCell label="Total Weight" value={formatWeight(totalWeight)} />
          <SummaryCell label="Locations" value={`${product.listings.length} listing${product.listings.length > 1 ? "s" : ""}`} />
          <div className="bg-white p-4 flex flex-col justify-center">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Price</p>
            <Link
              href={`/contact?productId=${encodeURIComponent(id)}&product=${encodeURIComponent(product.product)}`}
              className="inline-flex items-center justify-center gap-1.5 bg-[#1a2b5f] text-white text-sm font-semibold px-4 py-2 rounded-md hover:bg-[#4a90c4] transition-colors"
            >
              Request Quote
            </Link>
          </div>
        </div>

        {/* Warehouse Listings with Lots */}
        <div className="p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Warehouse Listings</h2>
          <div className="space-y-4">
            {product.listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                unitType={product.unitType}
                documents={documents}
                coaDataMap={coaDataMap}
                showLots={listing.lots.length > 0}
              />
            ))}
          </div>
        </div>

        {/* Contract Documents (labels + photos only — specs are restricted) */}
        <ContractDocuments
          productId={id}
          documents={documents}
          baseContracts={getBaseContracts(product)}
          requiredContractDocs={getRequiredDocs(product).contractLevel}
        />

        {/* Sticky CTA on mobile.
            position: sticky reserves its own space in document flow, so at max
            scroll the CTA sits at its natural position at the end of the card
            and the last content row is fully visible above it — no extra
            clearance padding needed. Mid-scroll, the CTA hovers over content;
            this is the standard sticky CTA UX. The pb-[calc(...)] adds the
            iOS safe-area inset (requires viewport-fit=cover in app/layout.tsx). */}
        <div className="md:hidden sticky bottom-0 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
          <Link
            href={`/contact?productId=${encodeURIComponent(id)}&product=${encodeURIComponent(product.product)}`}
            className="block w-full text-center bg-[#1a2b5f] text-white font-semibold py-3 rounded-md hover:bg-[#4a90c4] transition-colors"
          >
            Request Quote
          </Link>
        </div>
      </div>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}

function ListingCard({
  listing,
  unitType,
  documents,
  coaDataMap,
  showLots,
}: {
  listing: Listing;
  unitType: string;
  documents: DocumentEntry[];
  coaDataMap: Map<number, CoaData>;
  showLots: boolean;
}) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 text-sm">
          {listing.warehouse}
          <span className="text-gray-400 font-normal"> — {listing.city}, {listing.state}</span>
        </h3>
        <div className="flex items-center gap-1.5">
          {countryFlag(listing.countryOfOrigin) && (
            <span className="text-2xl leading-none">{countryFlag(listing.countryOfOrigin)}</span>
          )}
          <span className="text-xs bg-[#1a2b5f]/10 text-[#1a2b5f] px-2 py-0.5 rounded font-medium">
            {listing.countryOfOrigin}
          </span>
        </div>
      </div>
      <div className="px-4 py-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <span className="text-gray-400 text-xs">Supplier</span>
            <p className="text-gray-900">{listing.supplier}</p>
          </div>
          {!showLots && (
            <>
              <div>
                <span className="text-gray-400 text-xs">Quantity</span>
                <p className="text-gray-900">
                  {listing.quantity.toLocaleString()} {listing.unitType || unitType}
                </p>
              </div>
              <div>
                <span className="text-gray-400 text-xs">Weight</span>
                <p className="text-gray-900">{formatWeight(listing.weightLbs)}</p>
              </div>
            </>
          )}
          <div>
            <span className="text-gray-400 text-xs">Arrived</span>
            <p className="text-gray-900">{listing.arrived}</p>
          </div>
          {listing.packDetail && (
            <div>
              <span className="text-gray-400 text-xs">Pack</span>
              <p className="text-gray-900">{listing.packDetail}</p>
            </div>
          )}
        </div>

        {/* Lots */}
        {listing.lots.length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Lots ({listing.lots.length})
            </h4>
            <div className="space-y-3">
              {listing.lots.map((lot) => (
                <LotRow key={lot.id} lot={lot} unitType={listing.unitType || unitType} documents={documents} coaDataMap={coaDataMap} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LotRow({ lot, unitType, documents, coaDataMap }: { lot: Lot; unitType: string; documents: DocumentEntry[]; coaDataMap: Map<number, CoaData> }) {
  const lotDocs = documents.filter((d) => d.lotIds.includes(lot.id));
  const coaDocs = lotDocs.filter((d) => d.category === "coa");
  const testDocs = lotDocs.filter((d) => d.category === "test-results");
  const hasCOA = coaDocs.length > 0;
  const coaData = coaDataMap.get(lot.id);
  // Only show publicly once a QA user has approved the AI extraction.
  const coaApproved = coaData?.reviewStatus === "approved";
  const formattedFields = coaApproved && coaData ? formatCoaFields(coaData.fields) : [];
  const coaTestTypes = coaApproved && coaData
    ? detectCoaTestTypes(coaData.fields)
    : { hasHeavyMetals: false, hasPesticide: false };

  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100 border-l-4 border-l-[#1a2b5f]">
      {/* Line 1: Lot number + contract refs + COA status */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex items-center gap-1.5">
          {hasCOA ? (
            <svg className="w-4 h-4 text-emerald-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-gray-300 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
          )}
          <span className="font-mono font-bold text-sm text-[#1a2b5f]">Lot {lot.lotNumber}</span>
        </div>
        {lot.contracts.length > 0 && (
          <span className="text-xs text-gray-400">Ref: {lot.contracts.join(", ")}</span>
        )}
        {/* Availability badges (restricted docs — not downloadable) */}
        {hasCOA && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
            </svg>
            COA
          </span>
        )}
        {(() => {
          // Collect labels from uploaded test result documents
          const docLabels = new Set<string>();
          const docBadges = testDocs.map((d) => {
            const name = (d.originalName || d.filename).toLowerCase();
            const label = name.includes("heavy") || name.includes("metal") || /\bhm\b/.test(name)
              ? "Heavy Metal Test Available"
              : name.includes("pesticide") || /\bpest\b/.test(name)
                ? "Pesticide Test Available"
                : /micro(?!so)/i.test(name)
                  ? "Microbiological Test Available"
                  : "Test Results Available";
            docLabels.add(label);
            return (
              <span key={d.id} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                </svg>
                {label}
              </span>
            );
          });
          // Add badges from COA-extracted data (only if not already covered by a document badge)
          const coaBadges: React.ReactNode[] = [];
          if (coaTestTypes.hasHeavyMetals && !docLabels.has("Heavy Metal Test Available")) {
            coaBadges.push(
              <span key="coa-hm" className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                </svg>
                Heavy Metal Test Available
              </span>
            );
          }
          if (coaTestTypes.hasPesticide && !docLabels.has("Pesticide Test Available")) {
            coaBadges.push(
              <span key="coa-pest" className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                </svg>
                Pesticide Test Available
              </span>
            );
          }
          return [...docBadges, ...coaBadges];
        })()}
      </div>

      {/* Line 2: Quantity, weight, BBD */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-600">
        <span>
          {lot.quantity.toLocaleString()} {unitType}
        </span>
        <span>{formatWeight(lot.weightLbs)}</span>
        {lot.bbd ? (
          new Date(lot.bbd) < new Date() ? (
            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">BBD: {lot.bbd}</span>
          ) : (
            <span className="text-gray-400 text-xs">BBD: {lot.bbd}</span>
          )
        ) : null}
      </div>

      {/* Line 3: COA key aspects (only when data exists) */}
      {formattedFields.length > 0 && (
        <div className="mt-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {formattedFields.map((f) => (
              <span
                key={f.label}
                className="text-xs bg-[#1a2b5f]/5 text-[#1a2b5f]/70 px-1.5 py-0.5 rounded"
              >
                <span className="font-medium">{f.label}:</span> {f.value}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-1 italic">
            AI-extracted — may contain errors. Request official documents before contracting.
          </p>
        </div>
      )}
    </div>
  );
}

function ContractDocuments({
  productId,
  documents,
  baseContracts,
  requiredContractDocs,
}: {
  productId: string;
  documents: DocumentEntry[];
  baseContracts: string[];
  requiredContractDocs: DocCategory[];
}) {
  // Only show public contract-level categories (labels + photos); specs are restricted
  const PUBLIC_CONTRACT_CATEGORIES = new Set(["labels", "photos"]);
  const contractDocs = documents.filter((d) => d.baseContract != null && PUBLIC_CONTRACT_CATEGORIES.has(d.category));
  const publicContractDocs = requiredContractDocs.filter((c) => PUBLIC_CONTRACT_CATEGORIES.has(c));

  if (contractDocs.length === 0 && baseContracts.length === 0) return null;
  if (contractDocs.length === 0) return null;

  const isImage = (filename: string) => /\.(jpe?g|png|gif|webp)$/i.test(filename);

  return (
    <div className="p-6 border-t border-gray-200">
      <h2 className="text-lg font-bold text-gray-900 mb-4">Contract Documents</h2>
      <div className="space-y-6">
        {baseContracts.map((bc) => {
          const docs = contractDocs.filter((d) => d.baseContract === bc);
          const hasSpecs = documents.some((d) => d.baseContract === bc && d.category === "specs");
          if (docs.length === 0 && !hasSpecs) return null;

          return (
            <div key={bc} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Contract {bc}</h3>
                {hasSpecs && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                    </svg>
                    Spec Sheet
                  </span>
                )}
              </div>
              <div className="p-4 space-y-4">
                {publicContractDocs.map((cat) => {
                  const catDocs = docs.filter((d) => d.category === cat);
                  if (catDocs.length === 0) return null;

                  const hasImages = catDocs.some((d) => isImage(d.filename));

                  return (
                    <div key={cat}>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                        {getCategoryLabel(cat)}
                      </p>
                      {hasImages ? (
                        <div className="flex flex-wrap gap-3">
                          {catDocs.map((doc) => {
                            const url = getDocumentUrl(doc.productId, doc.category, doc.filename, { baseContract: bc });
                            if (isImage(doc.filename)) {
                              return (
                                <a
                                  key={doc.id}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group block w-24 h-24 rounded-lg overflow-hidden border border-gray-200 hover:border-[#4a90c4] transition-colors"
                                >
                                  <Image
                                    src={url}
                                    alt={doc.originalName}
                                    width={96}
                                    height={96}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                  />
                                </a>
                              );
                            }
                            return (
                              <a
                                key={doc.id}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-sm text-[#4a90c4] hover:underline"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                {doc.originalName}
                              </a>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {catDocs.map((doc) => (
                            <a
                              key={doc.id}
                              href={getDocumentUrl(doc.productId, doc.category, doc.filename, { baseContract: bc })}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-[#4a90c4] hover:underline"
                            >
                              <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              {doc.originalName}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
