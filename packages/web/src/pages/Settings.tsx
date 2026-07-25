import { useState, useEffect } from "react";
import { useStore } from "../lib/store";
import { api } from "../lib/api";
import { Save, Download, Bell, BellOff } from "lucide-react";

export function SettingsPage() {
  const { user, checkAuth } = useStore();
  const [memberId, setMemberId] = useState(user?.costcoMemberId || "");
  const [warehouseId, setWarehouseId] = useState<string>(
    user?.homeWarehouseId?.toString() || ""
  );
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [pushNotifs, setPushNotifs] = useState(true);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  // Warehouses for selector
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [whSearch, setWhSearch] = useState("");

  useEffect(() => {
    setPushSupported("serviceWorker" in navigator && "PushManager" in window);
    checkPushStatus();
    loadWarehouses();
  }, []);

  async function checkPushStatus() {
    if (!("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setPushEnabled(!!sub);
    } catch {}
  }

  async function loadWarehouses() {
    const res = await api.getWarehouses();
    if (res.success && res.data) setWarehouses(res.data);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    const res = await fetch("/api/settings/profile", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        costcoMemberId: memberId || null,
        homeWarehouseId: warehouseId ? parseInt(warehouseId) : null,
        notificationPrefs: { email: emailNotifs, push: pushNotifs },
      }),
    });

    const json = await res.json();
    if (json.success) {
      setSaved(true);
      await checkAuth();
      setTimeout(() => setSaved(false), 3000);
    } else {
      setError(json.error || "Save failed");
    }
    setSaving(false);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwSuccess(false);

    if (newPassword.length < 8) {
      setPwError("Password must be at least 8 characters");
      return;
    }

    const res = await fetch("/api/settings/change-password", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const json = await res.json();
    if (json.success) {
      setPwSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
    } else {
      setPwError(json.error || "Failed to change password");
    }
  }

  async function handleEnablePush() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
      });

      const json = sub.toJSON();
      await fetch("/api/settings/push-subscription", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      });

      setPushEnabled(true);
    } catch (err) {
      console.error("Push subscription failed:", err);
    }
  }

  async function handleDisablePush() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/settings/push-subscription", {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPushEnabled(false);
    } catch {}
  }

  async function handleExport() {
    window.open("/api/dashboard/export", "_blank");
  }

  const filteredWarehouses = whSearch
    ? warehouses.filter(
        (w) =>
          w.name.toLowerCase().includes(whSearch.toLowerCase()) ||
          w.city?.toLowerCase().includes(whSearch.toLowerCase())
      )
    : warehouses;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Settings</h2>

      {/* Profile settings */}
      <form onSubmit={handleSaveProfile} className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        <div className="p-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <p className="text-sm text-gray-900">{user?.email}</p>
        </div>

        <div className="p-4">
          <label htmlFor="memberId" className="block text-sm font-medium text-gray-700 mb-1">
            Costco Member ID
          </label>
          <input
            id="memberId"
            type="text"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm"
            placeholder="Optional — helps identify purchases"
          />
        </div>

        <div className="p-4">
          <label htmlFor="warehouse" className="block text-sm font-medium text-gray-700 mb-1">
            Home Warehouse
          </label>
          <input
            type="text"
            placeholder="Search warehouses..."
            value={whSearch}
            onChange={(e) => setWhSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm mb-2"
          />
          <select
            id="warehouse"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">No warehouse selected</option>
            {filteredWarehouses.map((w) => (
              <option key={w.id} value={w.id}>
                #{w.id} — {w.name}, {w.city}, {w.state}
              </option>
            ))}
          </select>
        </div>

        <div className="p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Notifications</label>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={emailNotifs}
                onChange={(e) => setEmailNotifs(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Email notifications</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={pushNotifs}
                onChange={(e) => setPushNotifs(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Push notifications</span>
            </label>
          </div>

          {pushSupported && (
            <div className="mt-3">
              {pushEnabled ? (
                <button
                  type="button"
                  onClick={handleDisablePush}
                  className="flex items-center gap-2 text-xs text-red-600 hover:text-red-700"
                >
                  <BellOff size={14} />
                  Disable browser push
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleEnablePush}
                  className="flex items-center gap-2 text-xs text-brand-600 hover:text-brand-700"
                >
                  <Bell size={14} />
                  Enable browser push notifications
                </button>
              )}
            </div>
          )}
        </div>

        <div className="p-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? "Saving..." : "Save Changes"}
          </button>
          {saved && <span className="text-sm text-green-600">Saved!</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </form>

      {/* Change password */}
      <form onSubmit={handleChangePassword} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Change Password</h3>
        {pwError && <p className="text-sm text-red-600">{pwError}</p>}
        {pwSuccess && <p className="text-sm text-green-600">Password changed successfully.</p>}
        <input
          type="password"
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          required
        />
        <input
          type="password"
          placeholder="New password (min 8 chars)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          required
        />
        <button
          type="submit"
          className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-900"
        >
          Change Password
        </button>
      </form>

      {/* Export */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Data Export</h3>
        <p className="text-xs text-gray-500 mb-3">
          Download all your purchase data as a CSV file.
        </p>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 text-sm text-brand-600 font-medium hover:text-brand-700"
        >
          <Download size={14} />
          Export to CSV
        </button>
      </div>

      {/* Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-2">About Costco Price Adjustments</h3>
        <div className="text-xs text-gray-600 space-y-2">
          <p>
            Costco offers a price adjustment policy: if an item you purchased drops in price
            within 30 days, you can request a refund for the difference.
          </p>
          <p>
            <strong>How to claim:</strong> Visit the Membership Counter at your Costco warehouse
            with your membership card, or call 1-800-774-2678.
          </p>
          <p>
            <strong>Exclusions:</strong> Clearance items (price ending .97), fuel, pharmacy,
            tobacco, gift cards, and special orders are typically not eligible.
          </p>
        </div>
      </div>
    </div>
  );
}
