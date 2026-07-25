import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, MapPin, Phone, Globe, Info } from "lucide-react";
import { api } from "../lib/api";
import type { ReimbursementGuide } from "@costco-refunder/shared";

export function GuidePage() {
  const { id } = useParams<{ id: string }>();
  const [guide, setGuide] = useState<ReimbursementGuide | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    async function load() {
      const res = await api.getReimbursementGuide(id!);
      if (res.success && res.data) {
        setGuide(res.data);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!guide) {
    return <p className="text-gray-500">Guide not found.</p>;
  }

  const actionIcons = {
    visit: <MapPin size={18} className="text-brand-600" />,
    call: <Phone size={18} className="text-green-600" />,
    online: <Globe size={18} className="text-purple-600" />,
    info: <Info size={18} className="text-gray-500" />,
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <Link
        to="/alerts"
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Back to alerts
      </Link>

      <div>
        <h2 className="text-xl font-bold text-gray-900">Refund Instructions</h2>
        <p className="text-sm text-gray-500 mt-1">{guide.itemDescription}</p>
      </div>

      {/* Summary card */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-green-700">Expected refund</span>
          <span className="text-2xl font-bold text-green-700">
            ${guide.expectedRefund.toFixed(2)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-green-600">
          <span>Original: ${guide.originalPrice.toFixed(2)}</span>
          <span>New price: ${guide.newPrice.toFixed(2)}</span>
          <span>Quantity: {guide.quantity}</span>
          <span className="font-medium">
            {guide.daysRemaining}d to claim
          </span>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {guide.steps.map((step) => (
          <div
            key={step.stepNumber}
            className="bg-white rounded-xl border border-gray-200 p-4 flex gap-3"
          >
            <div className="flex-shrink-0 mt-0.5">
              {actionIcons[step.actionType]}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Step {step.stepNumber}: {step.title}
              </p>
              <p className="text-sm text-gray-600 mt-1">{step.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Mark as claimed */}
      <button
        onClick={async () => {
          await api.claimAlert(id!);
          window.history.back();
        }}
        className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
      >
        Mark as Claimed
      </button>
    </div>
  );
}
