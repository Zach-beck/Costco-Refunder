import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Check, AlertCircle, Loader2, Trash2, Image } from "lucide-react";
import { api } from "../lib/api";

interface ReceiptItem {
  id: string;
  itemId: number | null;
  descriptionRaw: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  isTaxable: boolean;
  ocrConfidence: number;
  trackingActive: boolean;
}

interface Receipt {
  id: string;
  warehouseId: number | null;
  receiptDate: string;
  parseStatus: string;
  parseConfidence: number;
  subtotal: string | null;
  tax: string | null;
  total: string | null;
  adjustmentWindowEnd: string;
  items: ReceiptItem[];
}

export function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [polling, setPolling] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [showImage, setShowImage] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadReceipt();
  }, [id]);

  async function loadReceipt() {
    const res = await api.getReceipt(id!);
    if (res.success && res.data) {
      setReceipt(res.data);
      // If still processing, poll
      if (res.data.parseStatus === "pending" || res.data.parseStatus === "processing") {
        setPolling(true);
        setTimeout(loadReceipt, 2000);
      } else {
        setPolling(false);
      }
    }
    setLoading(false);
  }

  async function handleConfirm() {
    if (!id) return;
    setConfirming(true);
    const res = await api.confirmReceipt(id);
    if (res.success) {
      navigate("/");
    }
    setConfirming(false);
  }

  async function handleViewImage() {
    if (!id) return;
    if (imageUrl) {
      setShowImage(!showImage);
      return;
    }
    const res = await api.getReceiptImage(id);
    if (res.success && res.data) {
      setImageUrl(res.data.imageUrl);
      setShowImage(true);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!confirm("Delete this receipt and all its items? This cannot be undone.")) return;
    setDeleting(true);
    const res = await api.deleteReceipt(id);
    if (res.success) {
      navigate("/receipts");
    }
    setDeleting(false);
  }

  async function toggleTracking(itemId: string, active: boolean) {
    if (!id) return;
    await api.updateReceiptItems(id, [{ itemId, trackingActive: active }]);
    setReceipt((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((i) =>
              i.id === itemId ? { ...i, trackingActive: active } : i
            ),
          }
        : null
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!receipt) {
    return <p className="text-gray-500">Receipt not found.</p>;
  }

  const isParsing = receipt.parseStatus === "pending" || receipt.parseStatus === "processing";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Receipt Details</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleViewImage}
            className="p-2 text-gray-500 hover:text-brand-600 rounded-lg hover:bg-gray-100"
            title="View receipt image"
          >
            <Image size={18} />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
            title="Delete receipt"
          >
            <Trash2 size={18} />
          </button>
          <StatusBadge status={receipt.parseStatus} />
        </div>
      </div>

      {/* Receipt image */}
      {showImage && imageUrl && (
        <div className="rounded-xl overflow-hidden border border-gray-200">
          <img
            src={imageUrl}
            alt="Original receipt"
            className="w-full max-h-96 object-contain bg-gray-50"
          />
        </div>
      )}

      {/* Parsing in progress */}
      {isParsing && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 text-center">
          <Loader2 className="animate-spin text-brand-600 mx-auto mb-3" size={32} />
          <p className="text-sm font-medium text-blue-900">
            Parsing your receipt...
          </p>
          <p className="text-xs text-blue-600 mt-1">
            Extracting items using OCR. This usually takes 5-10 seconds.
          </p>
        </div>
      )}

      {/* Receipt metadata */}
      {!isParsing && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Date</p>
              <p className="font-medium">{receipt.receiptDate}</p>
            </div>
            <div>
              <p className="text-gray-500">Adjustment Window</p>
              <p className="font-medium">Until {receipt.adjustmentWindowEnd}</p>
            </div>
            <div>
              <p className="text-gray-500">Total</p>
              <p className="font-medium">{receipt.total ? `$${receipt.total}` : "—"}</p>
            </div>
            <div>
              <p className="text-gray-500">Parse Confidence</p>
              <ConfidenceBar confidence={receipt.parseConfidence} />
            </div>
          </div>

          {/* Items list */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Parsed Items ({receipt.items.length})
            </h3>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
              {receipt.items.map((item) => (
                <div key={item.id} className="px-4 py-3 flex items-center gap-3">
                  <button
                    onClick={() => toggleTracking(item.id, !item.trackingActive)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      item.trackingActive
                        ? "bg-brand-600 border-brand-600"
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {item.trackingActive && <Check size={12} className="text-white" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {item.descriptionRaw}
                      </p>
                      {item.ocrConfidence < 0.8 && (
                        <AlertCircle size={14} className="text-amber-500 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      #{item.itemId} &middot; Qty: {item.quantity}
                      {item.isTaxable && " &middot; Taxable"}
                    </p>
                  </div>

                  <p className="text-sm font-medium text-gray-900">
                    ${parseFloat(item.unitPrice).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Confirm button */}
          {receipt.parseStatus === "complete" && (
            <div className="flex gap-3">
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="flex-1 bg-brand-600 text-white py-3 rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {confirming ? "Confirming..." : "Confirm & Start Tracking"}
              </button>
            </div>
          )}

          <p className="text-xs text-gray-400 text-center">
            Uncheck items you don't want to track. Items with low confidence (amber icon) may need manual correction.
          </p>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-gray-100 text-gray-700",
    processing: "bg-blue-100 text-blue-700",
    complete: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };

  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${styles[status] || styles.pending}`}>
      {status}
    </span>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100);
  const color =
    percent >= 90 ? "bg-green-500" : percent >= 70 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600">{percent}%</span>
    </div>
  );
}
