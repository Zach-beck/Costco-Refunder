import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { Upload as UploadIcon, Camera, Image, Loader2 } from "lucide-react";
import { api } from "../lib/api";

type UploadState = "idle" | "uploading" | "processing" | "done" | "error";

export function UploadPage() {
  const [state, setState] = useState<UploadState>("idle");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const navigate = useNavigate();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    // Show preview
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    setState("uploading");
    setError("");

    try {
      // Step 1: Get presigned upload URL
      const urlRes = await api.getUploadUrl();
      if (!urlRes.success || !urlRes.data) {
        throw new Error(urlRes.error || "Failed to get upload URL");
      }

      // Step 2: Upload image directly to S3/R2
      await api.uploadImage(urlRes.data.uploadUrl, file);

      setState("processing");

      // Step 3: Create receipt record and queue parsing
      const receiptRes = await api.createReceipt({
        imageKey: urlRes.data.imageKey,
      });

      if (!receiptRes.success || !receiptRes.data) {
        throw new Error(receiptRes.error || "Failed to create receipt");
      }

      setState("done");

      // Navigate to receipt detail page to see parsing results
      setTimeout(() => {
        navigate(`/receipts/${receiptRes.data.id}`);
      }, 1000);
    } catch (err: any) {
      setState("error");
      setError(err.message || "Upload failed");
    }
  }, [navigate]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".webp", ".heic"],
    },
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024, // 20MB
    disabled: state === "uploading" || state === "processing",
  });

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Upload Receipt</h2>
        <p className="text-sm text-gray-500 mt-1">
          Take a photo or upload an image of your Costco receipt
        </p>
      </div>

      {/* Upload zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          isDragActive
            ? "border-brand-400 bg-brand-50"
            : state === "error"
            ? "border-red-300 bg-red-50"
            : "border-gray-300 hover:border-brand-400 hover:bg-gray-50"
        }`}
      >
        <input {...getInputProps()} />

        {state === "idle" && (
          <>
            <div className="flex justify-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center">
                <Camera className="text-brand-600" size={24} />
              </div>
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                <Image className="text-gray-600" size={24} />
              </div>
            </div>
            <p className="text-sm font-medium text-gray-700">
              {isDragActive
                ? "Drop your receipt here"
                : "Drag & drop or tap to upload"}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              PNG, JPG, WEBP up to 20MB
            </p>
          </>
        )}

        {(state === "uploading" || state === "processing") && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="animate-spin text-brand-600" size={32} />
            <p className="text-sm font-medium text-gray-700">
              {state === "uploading" ? "Uploading..." : "Processing receipt..."}
            </p>
            <p className="text-xs text-gray-400">
              {state === "processing" &&
                "Running OCR and extracting items. This takes a few seconds."}
            </p>
          </div>
        )}

        {state === "done" && (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <UploadIcon className="text-green-600" size={20} />
            </div>
            <p className="text-sm font-medium text-green-700">
              Receipt uploaded! Redirecting...
            </p>
          </div>
        )}

        {state === "error" && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm font-medium text-red-700">{error}</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setState("idle");
                setError("");
                setPreview(null);
              }}
              className="text-xs text-brand-600 font-medium hover:text-brand-700"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Preview */}
      {preview && state !== "error" && (
        <div className="rounded-xl overflow-hidden border border-gray-200">
          <img
            src={preview}
            alt="Receipt preview"
            className="w-full max-h-96 object-contain bg-gray-50"
          />
        </div>
      )}

      {/* Direct camera capture button (mobile-friendly) */}
      {state === "idle" && (
        <div className="md:hidden">
          <label className="flex items-center justify-center gap-2 w-full bg-gray-800 text-white py-3 rounded-xl font-medium cursor-pointer hover:bg-gray-900 transition-colors">
            <Camera size={20} />
            Take Photo with Camera
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onDrop([file]);
              }}
            />
          </label>
        </div>
      )}

      {/* Tips */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">Tips for best results</h4>
        <ul className="text-xs text-blue-700 space-y-1">
          <li>- Flatten the receipt and photograph on a dark surface</li>
          <li>- Ensure all text is visible and in focus</li>
          <li>- Include the full receipt from header to total</li>
          <li>- Good lighting helps OCR accuracy</li>
        </ul>
      </div>
    </div>
  );
}
