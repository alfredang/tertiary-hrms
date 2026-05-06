import { CheckCircle } from "lucide-react";

export default function MyInfoSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-sm w-full">
        <div className="flex justify-center mb-6">
          <CheckCircle className="h-16 w-16 text-green-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">Profile Updated</h1>
        <p className="text-gray-400 mb-2">
          Your personal information has been successfully retrieved from Singpass and saved to
          your employee profile.
        </p>
        <p className="text-gray-500 text-sm">You can close this window.</p>
      </div>
    </div>
  );
}
