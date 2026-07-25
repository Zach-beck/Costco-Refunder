import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingDown, Package, Bell, DollarSign, Upload } from "lucide-react";
import { api } from "../lib/api";
import type { DashboardStats, TrackedItem } from "@costco-refunder/shared";

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [trackedItems, setTrackedItems] = useState<TrackedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [statsRes, itemsRes] = await Promise.all([
        api.getStats(),
        api.getTrackedItems(),
      ]);
      if (statsRes.success && statsRes.data) setStats(statsRes.data);
      if (itemsRes.success && itemsRes.data) setTrackedItems(itemsRes.data);
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
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>
        <Link
          to="/upload"
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          <Upload size={16} />
          Upload Receipt
        </Link>
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<Package size={20} />}
            label="Tracked Items"
            value={stats.activeTrackedItems.toString()}
            color="blue"
          />
          <StatCard
            icon={<Bell size={20} />}
            label="Pending Alerts"
            value={stats.pendingAlerts.toString()}
            color="amber"
          />
          <StatCard
            icon={<DollarSign size={20} />}
            label="Savings Claimed"
            value={`$${stats.totalSavingsClaimed.toFixed(2)}`}
            color="green"
          />
          <StatCard
            icon={<TrendingDown size={20} />}
            label="Available Savings"
            value={`$${stats.totalSavingsAvailable.toFixed(2)}`}
            color="purple"
          />
        </div>
      )}

      {/* Tracked items */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Active Tracking
        </h3>
        {trackedItems.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <Package className="mx-auto text-gray-300 mb-3" size={40} />
            <p className="text-gray-500">No items being tracked yet.</p>
            <Link
              to="/upload"
              className="text-brand-600 font-medium text-sm hover:text-brand-700 mt-2 inline-block"
            >
              Upload your first receipt to start tracking
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-100">
              {trackedItems.map((item) => (
                <div key={item.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.description}
                    </p>
                    <p className="text-xs text-gray-500">
                      #{item.itemNumber} &middot; {item.warehouseName} &middot;{" "}
                      {item.daysRemaining}d remaining
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm font-medium">${item.purchasePrice.toFixed(2)}</p>
                    {item.priceDrop && (
                      <p className="text-xs text-green-600 font-medium">
                        -${item.priceDrop.toFixed(2)} drop!
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "blue" | "amber" | "green" | "purple";
}) {
  const colorMap = {
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${colorMap[color]}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
