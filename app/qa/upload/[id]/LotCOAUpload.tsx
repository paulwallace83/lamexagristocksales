"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface LotOption {
  id: number;
  lotNumber: string;
  bbd: string;
}

interface DocumentWithUrl {
  id: string;
  productId: string;
  category: string;
  filename: string;
  originalName: string;
  uploadedAt: string;
  uploadedBy: string;
  url: string;
  lotIds?: number[];
}

interface LotCOAUploadProps {
  productId: string;
  /** The primary lot this section belongs to */
  primaryLotId: number;
  /** All lots for this product (for multi-lot tagging) */
  allLots: LotOption[];
  /** Existing COA documents for the primary lot */
  documents: DocumentWithUrl[];
  deleteParams?: Record<string, string>;
}

export default function LotCOAUpload({ productId, primaryLotId, allLots, documents, deleteParams }: LotCOAUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showLotPicker, setShowLotPicker] = useState(false);
  const [selectedLotIds, setSelectedLotIds] = useState<Set<number>>(new Set([primaryLotId]));
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingFiles = useRef<FileList | null>(null);
  const router = useRouter();

  const otherLots = allLots.filter((l) => l.id !== primaryLotId);

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (otherLots.length > 0) {
      pendingFiles.current = files;
      setSelectedLotIds(new Set([primaryLotId]));
      setShowLotPicker(true);
    } else {
      doUpload(files, [primaryLotId]);
    }
  };

  const doUpload = async (files: FileList, lotIds: number[]) => {
    setUploading(true);
    setShowLotPicker(false);

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("productId", productId);
      formData.append("category", "coa");
      formData.append("lotIds", lotIds.join(","));

      await fetch("/api/upload", { method: "POST", body: formData });
    }

    setUploading(false);
    pendingFiles.current = null;
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

  const toggleLot = (lotId: number) => {
    setSelectedLotIds((prev) => {
      const next = new Set(prev);
      if (lotId === primaryLotId) return next; // Can't deselect primary
      if (next.has(lotId)) next.delete(lotId);
      else next.add(lotId);
      return next;
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFilesSelected(e.dataTransfer.files);
  };

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 mb-2">
        COA
        {documents.length > 0 && (
          <span className="ml-2 text-green-600 font-normal">({documents.length} uploaded)</span>
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
                {doc.lotIds && doc.lotIds.length > 1 && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                    {doc.lotIds.length} lots
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#4a90c4] hover:underline">View</a>
                <button onClick={() => handleDelete(doc)} className="text-xs text-red-500 hover:underline">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lot picker modal */}
      {showLotPicker && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-3">
          <p className="text-sm font-medium text-gray-800 mb-2">
            Does this COA also cover other lots?
          </p>
          <div className="space-y-1 mb-3">
            {allLots.map((lot) => (
              <label key={lot.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedLotIds.has(lot.id)}
                  onChange={() => toggleLot(lot.id)}
                  disabled={lot.id === primaryLotId}
                  className="rounded"
                />
                <span className={lot.id === primaryLotId ? "font-medium" : ""}>
                  {lot.lotNumber}
                </span>
                <span className="text-gray-400 text-xs">BBD: {lot.bbd}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (pendingFiles.current) {
                  doUpload(pendingFiles.current, Array.from(selectedLotIds));
                }
              }}
              className="bg-[#1a2b5f] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#4a90c4]"
            >
              Upload COA
            </button>
            <button
              onClick={() => { setShowLotPicker(false); pendingFiles.current = null; }}
              className="text-xs text-gray-500 hover:underline px-2 py-1.5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!showLotPicker && (
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
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
          {uploading ? (
            <p className="text-sm text-gray-500">Uploading...</p>
          ) : (
            <p className="text-sm text-gray-500">
              Drop COA or <span className="text-[#4a90c4] font-medium">browse</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
