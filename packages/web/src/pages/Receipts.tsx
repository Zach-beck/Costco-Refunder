import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Receipt, Upload, Calendar, MapPin } from "lucide-react";
import { api } from "../lib/api";

interface ReceiptSummary {
  id: string;
  receiptDate: string;
  warehouseId: number | null;
  parseStatus: string;
  total: string | null;
  createdAt: string;
}

export function ReceiptsPage() {
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await api.listReceipts();
      if (res.success && res.data) {
        setReceipts(res.data);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Receipts</h2>
        <Link
          to="/upload"
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          <Upload size={16} />
          Upload New
        </Link>
      </div>

      {receipts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Receipt className="mx-auto text-gray-300 mb-3" size={40} />
          <p className="text-gray-500">No receipts uploaded yet.</p>
          <Link
            to="/upload"
            className="text-brand-600 font-medium text-sm hover:text-brand-700 mt-2 inline-block"
          >
            Upload your first receipt
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
          {receipts.map((receipt) => (
            <Link
              key={receipt.id}
              to={`/receipts/${receipt.id}`}
              className="block px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                    <Calendar size={14} className="text-gray-400" />
                    {receipt.receiptDate}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                    {receipt.warehouseId && (
                      <>
                        <MapPin size={12} />
                        Warehouse #{receipt.warehouseId}
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  {receipt.total && (
                    <p className="text-sm font-medium">${receipt.total}</p>
                  )}
                  <StatusBadge status={receipt.parseStatus} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-gray-100 text-gray-600",
    processing: "bg-blue-100 text-blue-600",
    complete: "bg-green-100 text-green-600",
    failed: "bg-red-100 text-red-600",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${styles[status] || styles.pending}`}>
      {status}
    </span>
  );
}
