"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import EnquiryForm from "./EnquiryForm";

function ContactPageInner() {
  const searchParams = useSearchParams();
  const productId = searchParams.get("productId") || undefined;
  const productName = searchParams.get("product") || undefined;
  // Clamp pre-fill values to the same length caps the form inputs use, since
  // maxLength on <input> only constrains user typing, not programmatic values.
  const initialName = searchParams.get("name")?.slice(0, 200) || undefined;
  const initialCompany = searchParams.get("company")?.slice(0, 200) || undefined;
  const initialEmail = searchParams.get("email")?.slice(0, 254) || undefined;

  const isProductSpecific = !!productId;

  // Re-mount the form when any pre-fill param changes so the useState
  // initializer re-runs. Without this, navigating between two /contact?...
  // URLs without a full page reload would leave stale pre-fill values.
  const formKey = `${productId ?? ""}|${initialName ?? ""}|${initialCompany ?? ""}|${initialEmail ?? ""}`;

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
        <EnquiryForm
          key={formKey}
          productId={productId}
          productName={productName}
          initialName={initialName}
          initialCompany={initialCompany}
          initialEmail={initialEmail}
        />
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
