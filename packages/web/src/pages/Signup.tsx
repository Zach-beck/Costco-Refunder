import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../lib/store";
import { api } from "../lib/api";

export function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [warehouseId, setWarehouseId] = useState<number | undefined>();
  const [whSearch, setWhSearch] = useState("");
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signup } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    api.getWarehouses().then((res) => {
      if (res.success && res.data) setWarehouses(res.data);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    const err = await signup(email, password, warehouseId);
    if (err) {
      setError(err);
      setLoading(false);
    } else {
      navigate("/");
    }
  };

  const filteredWarehouses = whSearch
    ? warehouses.filter(
        (w) =>
          w.name.toLowerCase().includes(whSearch.toLowerCase()) ||
          w.city?.toLowerCase().includes(whSearch.toLowerCase()) ||
          w.state?.toLowerCase().includes(whSearch.toLowerCase())
      )
    : warehouses;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="h-12 w-12 rounded-xl bg-brand-600 flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">CR</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create account</h1>
          <p className="text-gray-500 mt-1">Start tracking your Costco price adjustments</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Home Costco Warehouse <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="Search by city, name, or state..."
              value={whSearch}
              onChange={(e) => setWhSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm mb-1"
            />
            <select
              value={warehouseId ?? ""}
              onChange={(e) =>
                setWarehouseId(e.target.value ? parseInt(e.target.value) : undefined)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Skip for now</option>
              {filteredWarehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} — {w.city}, {w.state}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 text-white py-2.5 rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-brand-600 font-medium hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
