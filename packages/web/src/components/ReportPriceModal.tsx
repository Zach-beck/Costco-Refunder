import { useState } from "react";
import { X } from "lucide-react";
import { api } from "../lib/api";

interface Props {
  itemId: number;
  itemDescription: string;
  warehouseId: number;
  currentPrice: number;
  onClose: () => void;
  onSubmit: () => void;
}

export function ReportPriceModal({
  itemId,
  itemDescription,
  warehouseId,
  currentPrice,
  onClose,
  onSubmit,
}: Props) {
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      setError("Please enter a valid price");
      return;
    }
    if (numPrice >= currentPrice) {
      setError("New price must be lower than the current tracked price");
      return;
    }

    setLoading(true);
    const res = await api.reportPrice({
      itemId,
      warehouseId,
      price: numPrice,
      observedDate: new Date().toISOString().split("T")[0],
    });

    if (res.success) {
      onSubmit();
    } else {
      setError(res.error || "Failed to report price");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Report Lower Price</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Spotted a lower price for <strong>{itemDescription}</strong>?
          Enter the new price you saw in-store.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Current tracked price
            </label>
            <p className="text-lg font-bold text-gray-900">${currentPrice.toFixed(2)}</p>
          </div>

          <div>
            <label htmlFor="new-price" className="block text-sm font-medium text-gray-700 mb-1">
              New lower price you spotted
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                id="new-price"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                placeholder="0.00"
                autoFocus
              />
            </div>
          </div>

          {price && parseFloat(price) < currentPrice && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-700 font-medium">
                Potential savings: ${(currentPrice - parseFloat(price)).toFixed(2)}
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {loading ? "Submitting..." : "Report Price"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
