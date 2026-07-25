import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await api.forgotPassword(email);
    setSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Reset password</h1>
          <p className="text-gray-500 mt-1">
            Enter your email and we'll send you a reset link
          </p>
        </div>

        {sent ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <p className="text-sm text-green-700 font-medium">
              If an account exists with that email, a reset link has been sent.
            </p>
            <p className="text-xs text-green-600 mt-2">
              Check your inbox (and spam folder). The link expires in 1 hour.
            </p>
            <Link
              to="/login"
              className="text-brand-600 font-medium text-sm mt-4 inline-block"
            >
              Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                placeholder="you@example.com"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 text-white py-2.5 rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Sending..." : "Send reset link"}
            </button>
            <p className="text-center text-sm text-gray-500">
              <Link to="/login" className="text-brand-600 font-medium hover:text-brand-700">
                Back to login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
