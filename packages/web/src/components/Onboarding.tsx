import { useState } from "react";
import { Upload, Clock, Bell, DollarSign, ArrowRight } from "lucide-react";

interface Props {
  onComplete: () => void;
}

const STEPS = [
  {
    icon: <Upload className="text-brand-600" size={32} />,
    title: "Upload your receipts",
    description:
      "Paste receipt text or a saved email. A photo is optional. Items and prices are read on this machine.",
  },
  {
    icon: <Clock className="text-amber-600" size={32} />,
    title: "30-day window",
    description:
      "Costco's US price match page lists 30 days for Costco.com orders. This app assumes 30 days for warehouse purchases too and tracks each item until then. Costco decides every request.",
  },
  {
    icon: <Bell className="text-purple-600" size={32} />,
    title: "Get notified of price drops",
    description:
      "Import a price file you saved, or type a price you saw. If it is lower at the same warehouse, you get an alert with the difference.",
  },
  {
    icon: <DollarSign className="text-green-600" size={32} />,
    title: "Ask for the price match",
    description:
      "Follow the step-by-step guide: the Returns counter at the warehouse where you bought it, or Costco's online form for Costco.com orders.",
  },
];

export function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(0);

  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === step ? "bg-brand-600" : i < step ? "bg-brand-300" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-6">
            {STEPS[step].icon}
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-3">
            {STEPS[step].title}
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            {STEPS[step].description}
          </p>
        </div>

        {/* Navigation */}
        <div className="mt-10 flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
          )}
          <button
            onClick={() => {
              if (isLast) {
                localStorage.setItem("onboarding-complete", "true");
                onComplete();
              } else {
                setStep(step + 1);
              }
            }}
            className="flex-1 flex items-center justify-center gap-2 bg-brand-600 text-white px-4 py-3 rounded-xl text-sm font-medium hover:bg-brand-700"
          >
            {isLast ? "Get Started" : "Next"}
            <ArrowRight size={16} />
          </button>
        </div>

        {/* Skip */}
        {!isLast && (
          <button
            onClick={() => {
              localStorage.setItem("onboarding-complete", "true");
              onComplete();
            }}
            className="w-full text-center text-xs text-gray-400 mt-4 hover:text-gray-600"
          >
            Skip intro
          </button>
        )}
      </div>
    </div>
  );
}
