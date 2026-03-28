import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getProductById } from "@/lib/inventory-db";
import {
  getDocumentsForProduct,
  getRequiredDocs,
  getCategoryLabel,
  getDocumentUrl,
} from "@/lib/documents";
import { extractBaseContract, getAllLots, getBaseContracts } from "@/lib/inventory";
import type { Lot } from "@/lib/inventory";
import Link from "next/link";
import UploadSection from "./UploadSection";
import LotCOAUpload from "./LotCOAUpload";

export const dynamic = "force-dynamic";

export default async function UploadPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/qa/login");
  if (session.user.role !== "qa" && session.user.role !== "reviewer") redirect("/qa/login");

  const { id } = await params;
  const product = getProductById(id);
  if (!product) redirect("/qa");

  const documents = getDocumentsForProduct(id);
  const required = getRequiredDocs(product);
  const lots = getAllLots(product);
  const baseContracts = getBaseContracts(product);

  const allLotOptions = lots.map((l) => ({
    id: l.id,
    lotNumber: l.lotNumber,
    bbd: l.bbd,
  }));

  // Group lots by listing for display
  const listingsWithLots = product.listings.filter((l) => l.lots.length > 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href="/qa" className="text-sm text-[#4a90c4] hover:underline mb-4 inline-block">
        &larr; Back to Dashboard
      </Link>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="bg-[#1a2b5f] px-6 py-4 text-white">
          <h1 className="text-xl font-bold">{product.product}</h1>
          <p className="text-sm text-white/70 mt-1">
            Upload documents by lot and contract
          </p>
        </div>

        <div className="p-6 space-y-10">
          {/* ============ LOT-LEVEL DOCUMENTS ============ */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-1 border-b border-gray-200 pb-2">
              Lot Documents
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              COA and test results — uploaded per lot
            </p>

            {lots.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <p className="text-sm text-amber-800">
                  Lot data not yet imported. Document uploads will be available once lots are added to inventory.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {listingsWithLots.map((listing) => (
                  <div key={listing.id}>
                    <h3 className="text-sm font-semibold text-gray-600 mb-3">
                      {listing.warehouse}, {listing.city}, {listing.state}
                      <span className="text-gray-400 font-normal"> — {listing.supplier}</span>
                    </h3>

                    <div className="space-y-4 pl-4 border-l-2 border-gray-200">
                      {listing.lots.map((lot) => {
                        const lotDocs = documents.filter(
                          (d) => d.lotIds.includes(lot.id),
                        );
                        const lotCoaDocs = lotDocs.filter((d) => d.category === "coa");
                        const lotTestDocs = lotDocs.filter((d) => d.category === "test-results");

                        return (
                          <div key={lot.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <div className="flex items-center gap-3 mb-3">
                              <span className="font-mono font-bold text-sm text-gray-900">
                                Lot {lot.lotNumber}
                              </span>
                              <span className="text-xs text-gray-500">
                                BBD: {lot.bbd}
                              </span>
                              <span className="text-xs text-gray-500">
                                {lot.quantity.toLocaleString()} units / {lot.weightLbs.toLocaleString()} lbs
                              </span>
                              {lot.contracts.length > 0 && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                                  Ref: {lot.contracts.join(", ")}
                                </span>
                              )}
                            </div>

                            <div className="space-y-4">
                              <LotCOAUpload
                                productId={id}
                                primaryLotId={lot.id}
                                allLots={allLotOptions}
                                documents={lotCoaDocs.map((d) => ({
                                  ...d,
                                  url: getDocumentUrl(d.productId, d.category, d.filename, { lotId: d.lotIds[0] }),
                                }))}
                                deleteParams={{ lotId: String(lot.id) }}
                              />

                              <UploadSection
                                productId={id}
                                category="test-results"
                                label="Test Results"
                                lotIds={[lot.id]}
                                documents={lotTestDocs.map((d) => ({
                                  ...d,
                                  url: getDocumentUrl(d.productId, d.category, d.filename, { lotId: d.lotIds[0] }),
                                }))}
                                deleteParams={{ lotId: String(lot.id) }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ============ CONTRACT-LEVEL DOCUMENTS ============ */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-1 border-b border-gray-200 pb-2">
              Contract Documents
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Specs, labels, and photos — shared across all lots under a contract
            </p>

            {baseContracts.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <p className="text-sm text-amber-800">
                  No contract data available yet.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {baseContracts.map((bc) => {
                  // Find all container numbers under this base contract
                  const allContractRefs = product.listings.flatMap((l) => {
                    const fromListing = l.contracts.filter(
                      (c) => extractBaseContract(c) === bc,
                    );
                    const fromLots = l.lots.flatMap((lot) =>
                      lot.contracts.filter((c) => extractBaseContract(c) === bc),
                    );
                    return [...fromListing, ...fromLots];
                  });
                  const containerNumbers = [...new Set(allContractRefs)].sort();

                  const contractDocs = documents.filter((d) => d.baseContract === bc);

                  return (
                    <div key={bc} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="font-mono font-bold text-sm text-gray-900">
                          Contract {bc}
                        </span>
                        {containerNumbers.length > 0 && (
                          <span className="text-xs text-gray-500">
                            Containers: {containerNumbers.join(", ")}
                          </span>
                        )}
                      </div>

                      <div className="space-y-4">
                        {required.contractLevel.map((cat) => {
                          const catDocs = contractDocs.filter((d) => d.category === cat);
                          return (
                            <UploadSection
                              key={cat}
                              productId={id}
                              category={cat}
                              label={getCategoryLabel(cat)}
                              baseContract={bc}
                              documents={catDocs.map((d) => ({
                                ...d,
                                url: getDocumentUrl(d.productId, d.category, d.filename, { baseContract: bc }),
                              }))}
                              deleteParams={{ baseContract: bc }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
