"use client";

import { useRef, useState } from "react";

export function DeleteConfirmationDialog({
  recordName,
  description,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  recordName: string;
  description: string;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [stage, setStage] = useState<1 | 2>(1);
  const submitting = useRef(false);

  const confirmDelete = async () => {
    if (stage === 1) {
      setStage(2);
      return;
    }

    if (pending || submitting.current) return;
    submitting.current = true;
    try {
      await onConfirm();
    } finally {
      submitting.current = false;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirmation-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 id="delete-confirmation-title" className="text-lg font-bold text-[#102f50]">
          {stage === 1
            ? "Apakah yakin kamu ingin menghapus data ini?"
            : "Apakah kamu benar-benar yakin ingin menghapus data ini?"}
        </h2>
        {stage === 2 && (
          <>
            <p className="mt-3 text-sm text-slate-700">
              Data yang dipilih: <span className="font-semibold">{recordName}</span>
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Data akan disembunyikan dari data aktif tetapi tetap tersimpan.
            </p>
            <p className="mt-2 text-sm text-slate-600">{description}</p>
          </>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={pending}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
          >
            {pending ? "Menghapus..." : stage === 1 ? "Lanjutkan" : "Ya, Hapus"}
          </button>
        </div>
      </div>
    </div>
  );
}
