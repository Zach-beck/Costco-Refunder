import { useState } from "react";
import { useStore } from "../lib/store";

export function SettingsPage() {
  const { user } = useStore();
  const [saved, setSaved] = useState(false);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Settings</h2>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        <div className="p-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <p className="text-sm text-gray-900">{user?.email}</p>
        </div>

        <div className="p-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Costco Member ID
          </label>
          <p className="text-sm text-gray-900">
            {user?.costcoMemberId || "Not set"}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Optional. Used to help identify your purchases.
          </p>
        </div>

        <div className="p-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Home Warehouse
          </label>
          <p className="text-sm text-gray-900">
            {user?.homeWarehouseId
              ? `Warehouse #${user.homeWarehouseId}`
              : "Not set"}
          </p>
        </div>

        <div className="p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Notifications
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded border-gray-300" />
              <span className="text-sm text-gray-700">Email notifications</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded border-gray-300" />
              <span className="text-sm text-gray-700">Push notifications</span>
            </label>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-2">
          About Costco Price Adjustments
        </h3>
        <div className="text-xs text-gray-600 space-y-2">
          <p>
            Costco offers a price adjustment policy: if an item you purchased drops
            in price within 30 days, you can request a refund for the difference.
          </p>
          <p>
            <strong>How to claim:</strong> Visit the Membership Counter at your
            Costco warehouse with your membership card, or call 1-800-774-2678.
          </p>
          <p>
            <strong>Exclusions:</strong> Clearance items (price ending .97), fuel,
            pharmacy, tobacco, gift cards, and special orders are typically not
            eligible.
          </p>
        </div>
      </div>
    </div>
  );
}
