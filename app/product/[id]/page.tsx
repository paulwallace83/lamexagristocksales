import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductById, getAllProductIds } from "@/lib/inventory-db";
import {
  getTotalQuantity,
  getTotalWeight,
  formatWeight,
  formatQuantity,
  extractBaseContract,
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
  const hasLots = product.listings.some((l) => l.lots.length > 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link href="/" className="text-sm text-[#4a90c4] hover:underline mb-4 inline-block">
        &larr; Back to Inventory
      </Link>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-[#1a2b5f] px-6 py-5 text-white">
          <h1 className="text-2xl font-bold">{product.product}</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            {product.organic ? (
              <span className="bg-[#1a2b5f] text-white text-xs font-semibold px-2.5 py-1 rounded">Organic</span>
            ) : (
              <span className="bg-white/20 text-white text-xs font-semibold px-2.5 py-1 rounded">Conventional</span>
            )}
            {product.certifications.map((c) => (
              <span key={c} className="bg-white/20 text-white text-xs font-medium px-2.5 py-1 rounded">{c}</span>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-gray-50 border-b border-gray-200">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase">Format</p>
            <p className="text-sm font-medium text-gray-900">{product.format}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase">Process</p>
            <p className="text-sm font-medium text-gray-900">{product.processType}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase">Specification</p>
            <p className="text-sm font-medium text-gray-900">{product.specification || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase">Pack Size</p>
            <p className="text-sm font-medium text-gray-900">{product.packSize}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase">Total Quantity</p>
            <p className="text-sm font-medium text-gray-900">{formatQuantity(totalQty, product.unitType)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase">Total Weight</p>
            <p className="text-sm font-medium text-gray-900">{formatWeight(totalWeight)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase">Locations</p>
            <p className="text-sm font-medium text-gray-900">{product.listings.length} listing{product.listings.length > 1 ? "s" : ""}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase">Price</p>
            <Link
              href={`/contact?product=${encodeURIComponent(product.product)}`}
              className="inline-block mt-0.5 bg-[#1a2b5f] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#4a90c4] transition-colors"
            >
              Inquire
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
                showLots={hasLots}
              />
            ))}
          </div>
        </div>

        {/* Contract Documents */}
        <ContractDocuments
          productId={id}
          documents={documents}
          baseContracts={getBaseContracts(product)}
          requiredContractDocs={getRequiredDocs(product).contractLevel}
        />
      </div>
    </div>
  );
}

function ListingCard({
  listing,
  unitType,
  documents,
  showLots,
}: {
  listing: Listing;
  unitType: string;
  documents: DocumentEntry[];
  showLots: boolean;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">
          {listing.warehouse}
          <span className="text-gray-500 font-normal"> — {listing.city}, {listing.state}</span>
        </h3>
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
          {listing.countryOfOrigin}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <span className="text-gray-500">Supplier:</span>
          <span className="ml-1 text-gray-900">{listing.supplier}</span>
        </div>
        {!showLots && (
          <>
            <div>
              <span className="text-gray-500">Quantity:</span>
              <span className="ml-1 text-gray-900">
                {listing.quantity.toLocaleString()} {listing.unitType || unitType}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Weight:</span>
              <span className="ml-1 text-gray-900">{formatWeight(listing.weightLbs)}</span>
            </div>
          </>
        )}
        <div>
          <span className="text-gray-500">Arrived:</span>
          <span className="ml-1 text-gray-900">{listing.arrived}</span>
        </div>
        {listing.packDetail && (
          <div>
            <span className="text-gray-500">Pack:</span>
            <span className="ml-1 text-gray-900">{listing.packDetail}</span>
          </div>
        )}
      </div>

      {/* Lots */}
      {listing.lots.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Lots</h4>
          <div className="space-y-2">
            {listing.lots.map((lot) => (
              <LotRow key={lot.id} lot={lot} unitType={listing.unitType || unitType} documents={documents} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LotRow({ lot, unitType, documents }: { lot: Lot; unitType: string; documents: DocumentEntry[] }) {
  const lotDocs = documents.filter((d) => d.lotIds.includes(lot.id));
  const coaDocs = lotDocs.filter((d) => d.category === "coa");
  const testDocs = lotDocs.filter((d) => d.category === "test-results");

  return (
    <div className="bg-gray-50 rounded px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-mono font-semibold text-gray-900">Lot {lot.lotNumber}</span>
        {lot.contracts.length > 0 && (
          <span className="text-xs text-gray-500">Ref: {lot.contracts.join(", ")}</span>
        )}
        <span className="text-gray-600">
          {lot.quantity.toLocaleString()} {unitType}
        </span>
        <span className="text-gray-600">{formatWeight(lot.weightLbs)}</span>
        <span className="text-gray-500 text-xs">BBD: {lot.bbd}</span>
      </div>

      {/* Lot documents */}
      {(coaDocs.length > 0 || testDocs.length > 0) && (
        <div className="mt-1 flex flex-wrap gap-3">
          {coaDocs.map((doc) => (
            <a
              key={doc.id}
              href={getDocumentUrl(doc.productId, doc.category, doc.filename, { lotId: doc.lotIds[0] })}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#4a90c4] hover:underline"
            >
              COA: {doc.originalName}
            </a>
          ))}
          {testDocs.map((doc) => (
            <a
              key={doc.id}
              href={getDocumentUrl(doc.productId, doc.category, doc.filename, { lotId: doc.lotIds[0] })}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#4a90c4] hover:underline"
            >
              Tests: {doc.originalName}
            </a>
          ))}
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
  const contractDocs = documents.filter((d) => d.baseContract != null);
  if (contractDocs.length === 0 && baseContracts.length === 0) {
    return (
      <div className="p-6 border-t border-gray-200 bg-gray-50">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Documents</h2>
        <p className="text-sm text-gray-500">
          Documents are being prepared for this product. Contact us for specifications, COAs, or product photos.
        </p>
      </div>
    );
  }

  if (contractDocs.length === 0) return null;

  return (
    <div className="p-6 border-t border-gray-200">
      <h2 className="text-lg font-bold text-gray-900 mb-4">Contract Documents</h2>
      <div className="space-y-4">
        {baseContracts.map((bc) => {
          const docs = contractDocs.filter((d) => d.baseContract === bc);
          if (docs.length === 0) return null;

          return (
            <div key={bc}>
              <h3 className="text-sm font-semibold text-gray-600 mb-2">Contract {bc}</h3>
              <div className="space-y-2">
                {requiredContractDocs.map((cat) => {
                  const catDocs = docs.filter((d) => d.category === cat);
                  if (catDocs.length === 0) return null;
                  return (
                    <div key={cat}>
                      <p className="text-xs font-semibold text-gray-500 uppercase">{getCategoryLabel(cat)}</p>
                      {catDocs.map((doc) => (
                        <a
                          key={doc.id}
                          href={getDocumentUrl(doc.productId, doc.category, doc.filename, { baseContract: bc })}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-[#4a90c4] hover:underline"
                        >
                          {doc.originalName}
                        </a>
                      ))}
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
