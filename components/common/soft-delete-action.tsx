"use client";

import { useRef, useState } from "react";
import { DeleteConfirmationDialog } from "@/components/common/delete-confirmation-dialog";
import { useToast } from "@/components/common/toast-provider";

type DeleteResponse = {
  error?: string;
  message?: string;
};

export function SoftDeleteAction({
  endpoint,
  recordName,
  identifier,
  description,
  onDeleted,
}: {
  endpoint: string;
  recordName: string;
  identifier?: string;
  description: string;
  onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const { showToast } = useToast();

  const confirmDelete = async () => {
    if (pending || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);

    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const payload = await response.json().catch((): DeleteResponse => ({}));
      if (!response.ok) {
        throw new Error(
          payload.error ||
          payload.message ||
          `Gagal menghapus data (HTTP ${response.status}).`,
        );
      }

      setOpen(false);
      showToast("success", `${recordName} berhasil disembunyikan dari data aktif.`);
      onDeleted?.();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Gagal menghapus data.";
      setError(message);
      showToast("error", message);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        aria-label={`Hapus ${recordName}`}
        className="rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
      >
        Hapus
      </button>
      {open && (
        <DeleteConfirmationDialog
          recordName={identifier ? `${recordName} (${identifier})` : recordName}
          description={description}
          pending={pending}
          error={error}
          onCancel={() => {
            if (!pending) setOpen(false);
          }}
          onConfirm={confirmDelete}
        />
      )}
    </>
  );
}
