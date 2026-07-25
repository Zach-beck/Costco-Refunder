import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, DollarSign, Clock, CheckCircle2, X } from "lucide-react";
import { api } from "../lib/api";
import type { PriceAlert } from "@costco-refunder/shared";

export function AlertsPage() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [activeTab, setActiveTab] = useState<"pending" | "notified" | "claimed">("pending");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlerts();
  }, [activeTab]);

  async function loadAlerts() {
    setLoading(true);
    const res = await api.getAlerts(activeTab);
    if (res.success && res.data) {
      setAlerts(res.data);
    }
    setLoading(false);
  }

  async function handleClaim(id: string) {
    await api.claimAlert(id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleDismiss(id: string) {
    await api.dismissAlert(id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Price Alerts</h2>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
        {(["pending", "notified", "claimed"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors capitalize ${
              activeTab === tab
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Alert list */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Bell className="mx-auto text-gray-300 mb-3" size={40} />
          <p className="text-gray-500">No {activeTab} alerts.</p>
          {activeTab === "pending" && (
            <p className="text-xs text-gray-400 mt-1">
              We'll notify you when a price drops on an item you're tracking.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="bg-white rounded-xl border border-gray-200 p-4"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {alert.itemDescription}
                  </p>
                  <p className="text-xs text-gray-500">
                    #{alert.itemNumber} &middot; {alert.warehouseName}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-md">
                  <DollarSign size={14} />
                  <span className="text-sm font-bold">
                    {alert.savings.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                <span className="line-through">${alert.originalPrice.toFixed(2)}</span>
                <span className="text-green-600 font-medium">
                  ${alert.newPrice.toFixed(2)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {alert.daysRemaining}d left
                </span>
              </div>

              {activeTab !== "claimed" && (
                <div className="flex gap-2">
                  <Link
                    to={`/alerts/${alert.id}/guide`}
                    className="flex-1 bg-brand-600 text-white text-center py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
                  >
                    Get Refund Instructions
                  </Link>
                  {activeTab === "pending" && (
                    <>
                      <button
                        onClick={() => handleClaim(alert.id)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                        title="Mark as claimed"
                      >
                        <CheckCircle2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDismiss(alert.id)}
                        className="p-2 text-gray-400 hover:bg-gray-50 rounded-lg"
                        title="Dismiss"
                      >
                        <X size={18} />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
