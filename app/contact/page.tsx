"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import EnquiryForm from "./EnquiryForm";

function ContactPageInner() {
  const searchParams = useSearchParams();
  const productId = searchParams.get("productId") || undefined;
  const productName = searchParams.get("product") || undefined;

  const isProductSpecific = !!productId;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link
        href={productId ? `/product/${productId}` : "/"}
        className="text-sm text-[#4a90c4] hover:underline mb-4 inline-block"
      >
        &larr; {productId ? "Back to Product" : "Back to Inventory"}
      </Link>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {isProductSpecific ? "Product Enquiry" : "Contact Us"}
        </h1>
        <p className="text-gray-500 mb-6">
          {isProductSpecific
            ? "Tell us what you need and our team will get back to you with pricing and availability."
            : "Fill out the form below and we'll get back to you."}
        </p>
        <EnquiryForm productId={productId} productName={productName} />
      </div>
    </div>
  );
}

export default function ContactPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl mx-auto px-4 py-8 text-gray-500">
          Loading...
        </div>
      }
    >
      <ContactPageInner />
    </Suspense>
  );
}
