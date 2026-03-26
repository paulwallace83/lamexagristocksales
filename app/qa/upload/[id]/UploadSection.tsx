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
}

interface UploadSectionProps {
  productId: string;
  category: string;
  label: string;
  documents: DocumentWithUrl[];
}

export default function UploadSection({ productId, category, label, documents }: UploadSectionProps) {
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

    await fetch(
      `/api/documents/${productId}?documentId=${doc.id}&filename=${doc.filename}&category=${doc.category}`,
      { method: "DELETE" }
    );

    router.refresh();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
        {label}
        {documents.length > 0 && (
          <span className="ml-2 text-green-600 font-normal normal-case">
            ({documents.length} uploaded)
          </span>
        )}
      </h3>

      {/* Existing documents */}
      {documents.length > 0 && (
        <div className="space-y-2 mb-4">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded px-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm text-gray-700 truncate">{doc.originalName}</span>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(doc.uploadedAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#4a90c4] hover:underline"
                >
                  View
                </a>
                <button
                  onClick={() => handleDelete(doc)}
                  className="text-xs text-red-500 hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-[#4a90c4] bg-blue-50"
            : "border-gray-300 hover:border-gray-400"
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
          <>
            <p className="text-sm text-gray-500">
              Drag & drop files here, or <span className="text-[#4a90c4] font-medium">click to browse</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">PDF, images, or documents</p>
          </>
        )}
      </div>
    </div>
  );
}
