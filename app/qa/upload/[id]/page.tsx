import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getProductById } from "@/lib/inventory-db";
import { getDocumentsForProduct, getRequiredCategories, getCategoryLabel } from "@/lib/documents";
import Link from "next/link";
import UploadSection from "./UploadSection";

export const dynamic = "force-dynamic";

export default async function UploadPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/qa/login");

  const { id } = await params;
  const product = getProductById(id);
  if (!product) redirect("/qa");

  const documents = getDocumentsForProduct(id);
  const categories = getRequiredCategories(product);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href="/qa" className="text-sm text-[#4a90c4] hover:underline mb-4 inline-block">
        &larr; Back to Dashboard
      </Link>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="bg-[#1a2b5f] px-6 py-4 text-white">
          <h1 className="text-xl font-bold">{product.product}</h1>
          <p className="text-sm text-white/70 mt-1">
            Upload required documents for this product
          </p>
        </div>

        <div className="p-6 space-y-8">
          {categories.map((category) => {
            const docs = documents.filter((d) => d.category === category);
            return (
              <UploadSection
                key={category}
                productId={id}
                category={category}
                label={getCategoryLabel(category)}
                documents={docs.map((d) => ({
                  ...d,
                  url: `/uploads/${d.productId}/${d.category}/${d.filename}`,
                }))}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
