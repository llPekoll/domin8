import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { logger } from "../lib/logger";
import { toast } from "sonner";

/**
 * Hook to handle referral tracking
 * 1. Captures referral code from URL on mount
 * 2. Stores it in localStorage
 * 3. Provides function to track referral when user signs up
 */
export function useReferralTracking() {
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const trackReferralMutation = useMutation(api.referrals.trackReferral);

  // Capture referral code from URL on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get("ref");

    if (refCode) {
      // Store in localStorage so it persists across page reloads
      localStorage.setItem("referralCode", refCode);
      setReferralCode(refCode);
      logger.ui.info("Referral code captured:", refCode);

      // Clean URL (remove ?ref= parameter)
      const url = new URL(window.location.href);
      url.searchParams.delete("ref");
      window.history.replaceState({}, document.title, url.toString());
    } else {
      // Check if we have a stored referral code
      const storedCode = localStorage.getItem("referralCode");
      if (storedCode) {
        setReferralCode(storedCode);
      }
    }
  }, []);

  /**
   * Track referral for a new user
   * Call this when player is created
   */
  const trackReferral = async (userId: string): Promise<boolean> => {
    if (!referralCode) {
      logger.ui.debug("No referral code to track");
      return false;
    }

    try {
      logger.ui.info("Tracking referral:", { referralCode, userId });
      await trackReferralMutation({
        referralCode,
        referredUserId: userId,
      });

      // Clear referral code after successful tracking
      localStorage.removeItem("referralCode");
      setReferralCode(null);

      logger.ui.info("Referral tracked successfully!");
      toast.success("Referral applied! You were referred successfully.");
      return true;
    } catch (error) {
      logger.ui.error("Failed to track referral:", error);

      // Parse error message to show user-friendly toast
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes("Cannot refer yourself")) {
        toast.error("You cannot use your own referral code!");
        // Clear the invalid referral code
        localStorage.removeItem("referralCode");
        setReferralCode(null);
      } else if (errorMessage.includes("User was already referred")) {
        toast.error("You have already been referred by someone else!");
        // Clear the referral code since they're already registered
        localStorage.removeItem("referralCode");
        setReferralCode(null);
      } else if (errorMessage.includes("Invalid referral code")) {
        toast.error("Invalid referral code. Please check the link and try again.");
        // Clear the invalid referral code
        localStorage.removeItem("referralCode");
        setReferralCode(null);
      } else {
        toast.error("Failed to apply referral. Please try again later.");
        // Don't clear localStorage on unknown errors, allow retry
      }

      return false;
    }
  };

  return {
    referralCode,
    trackReferral,
    hasReferralCode: !!referralCode,
  };
}
