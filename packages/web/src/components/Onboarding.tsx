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
      "Take a photo of your Costco receipt. Our OCR system will automatically extract all items and prices.",
  },
  {
    icon: <Clock className="text-amber-600" size={32} />,
    title: "30-day tracking window",
    description:
      "Costco allows price adjustments within 30 days of purchase. We track each item until the window closes.",
  },
  {
    icon: <Bell className="text-purple-600" size={32} />,
    title: "Get notified of price drops",
    description:
      "When other users report lower prices, or you spot one yourself, we'll alert you immediately.",
  },
  {
    icon: <DollarSign className="text-green-600" size={32} />,
    title: "Claim your refund",
    description:
      "Follow our step-by-step guide to get your money back at the membership counter or by phone.",
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
