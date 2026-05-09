import { MailCheck, RefreshCcw, ArrowLeft } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function VerifyEmail() {
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email;
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const resendVerification = async () => {
    if (!email) {
      setMessage("Please return to signup and enter your email again.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Verification email sent again. Please check your inbox.");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="glass-card w-full max-w-md p-8 text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 border border-primary/30">
          <MailCheck className="h-8 w-8 text-primary" />
        </div>

        <div>
          <h1 className="text-3xl font-bold gradient-text">Verify your email</h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            We’ve sent a verification link to your inbox. Click the link to activate your
            AlphaSwarm account.
          </p>

          {email && (
            <p className="mt-3 rounded-full bg-secondary/60 border border-border px-4 py-2 text-xs font-mono">
              {email}
            </p>
          )}
        </div>

        <div className="soft-card p-4 text-left">
          <p className="text-sm font-semibold mb-2">Next steps</p>
          <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
            <li>Open your email inbox.</li>
            <li>Click the Supabase confirmation link.</li>
            <li>Return to AlphaSwarm and log in.</li>
          </ol>
        </div>

        {message && (
          <p className="text-sm text-warning bg-warning/10 border border-warning/20 rounded-lg p-3">
            {message}
          </p>
        )}

        <button
          type="button"
          onClick={resendVerification}
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
        >
          <RefreshCcw className="h-4 w-4" />
          {loading ? "Sending..." : "Resend verification email"}
        </button>

        <Link
          to="/login"
          className="inline-flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>
      </div>
    </div>
  );
}