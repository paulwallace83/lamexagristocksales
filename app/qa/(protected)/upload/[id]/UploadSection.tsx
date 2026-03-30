"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface DocumentWithUrl {
  id: string;
  productId: string;
  category: string;
  filename: string;
  originalName: string;
  uploadedAt: string;
  uploadedBy: string;
  url: string;
  baseContract?: string | null;
  lotIds?: number[];
}

interface UploadSectionProps {
  productId: string;
  category: string;
  label: string;
  documents: DocumentWithUrl[];
  /** For lot-level uploads (coa, test-results) */
  lotIds?: number[];
  /** For contract-level uploads (specs, labels, photos) */
  baseContract?: string;
  /** Extra delete params for file path resolution */
  deleteParams?: Record<string, string>;
}

export default function UploadSection({ productId, category, label, documents, lotIds, baseContract, deleteParams }: UploadSectionProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("productId", productId);
      formData.append("category", category);

      if (lotIds && lotIds.length > 0) {
        formData.append("lotIds", lotIds.join(","));
      }
      if (baseContract) {
        formData.append("baseContract", baseContract);
      }

      await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
    }

    setUploading(false);
    router.refresh();
  };

  const handleDelete = async (doc: DocumentWithUrl) => {
    if (!confirm(`Delete ${doc.originalName}?`)) return;

    const params = new URLSearchParams({
      documentId: doc.id,
      filename: doc.filename,
      category: doc.category,
      ...deleteParams,
    });

    await fetch(`/api/documents/${productId}?${params}`, { method: "DELETE" });
    router.refresh();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  };

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 mb-2">
        {label}
        {documents.length > 0 && (
          <span className="ml-2 text-green-600 font-normal">
            ({documents.length} uploaded)
          </span>
        )}
      </h4>

      {documents.length > 0 && (
        <div className="space-y-2 mb-3">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded px-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm text-gray-700 truncate">{doc.originalName}</span>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(doc.uploadedAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#4a90c4] hover:underline">
                  View
                </a>
                <button onClick={() => handleDelete(doc)} className="text-xs text-red-500 hover:underline">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragOver ? "border-[#4a90c4] bg-blue-50" : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
        {uploading ? (
          <p className="text-sm text-gray-500">Uploading...</p>
        ) : (
          <p className="text-sm text-gray-500">
            Drop files or <span className="text-[#4a90c4] font-medium">browse</span>
          </p>
        )}
      </div>
    </div>
  );
}
