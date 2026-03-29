"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Link from "next/link";
import DocumentRequestForm from "./DocumentRequestForm";

function ContactForm() {
  const searchParams = useSearchParams();
  const prefilledProduct = searchParams.get("product") || "";

  const [form, setForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    product: prefilledProduct,
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(
      `Inquiry: ${form.product || "Lamex Inventory"}`
    );
    const body = encodeURIComponent(
      `Name: ${form.name}\nCompany: ${form.company}\nPhone: ${form.phone}\n\nProduct of Interest: ${form.product}\n\nMessage:\n${form.message}`
    );
    window.location.href = `mailto:sales@lamexfoods.us?subject=${subject}&body=${body}`;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90c4]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company *</label>
          <input
            type="text"
            required
            value={form.company}
            onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90c4]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90c4]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90c4]"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Product of Interest</label>
        <input
          type="text"
          value={form.product}
          onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90c4]"
          placeholder="e.g., Mango IQF, Apple Juice Concentrate"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
        <textarea
          rows={4}
          value={form.message}
          onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90c4]"
          placeholder="Quantity needed, delivery requirements, quality specs, etc."
        />
      </div>
      <button
        type="submit"
        className="w-full bg-[#1a2b5f] text-white font-semibold py-3 px-6 rounded-md hover:bg-[#4a90c4] transition-colors"
      >
        Send Inquiry
      </button>
    </form>
  );
}

function ContactPageInner() {
  const searchParams = useSearchParams();
  const type = searchParams.get("type");
  const productId = searchParams.get("productId");
  const productName = searchParams.get("product") || "";

  const isDocRequest = type === "documents" && productId;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href={productId ? `/product/${productId}` : "/"} className="text-sm text-[#4a90c4] hover:underline mb-4 inline-block">
        &larr; {productId ? "Back to Product" : "Back to Inventory"}
      </Link>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        {isDocRequest ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Request Documents</h1>
            <p className="text-gray-500 mb-6">
              Select the documents you need and we will review and send them to you by email.
            </p>
            <DocumentRequestForm productId={productId} productName={productName} />
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Request a Quote</h1>
            <p className="text-gray-500 mb-6">
              Fill out the form below and we will get back to you with pricing and availability.
            </p>
            <ContactForm />
          </>
        )}
      </div>
    </div>
  );
}

export default function ContactPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto px-4 py-8 text-gray-500">Loading...</div>}>
      <ContactPageInner />
    </Suspense>
  );
}
