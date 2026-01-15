import { v } from "convex/values";
import { action } from "./_generated/server";
import { Resend } from "resend";

/**
 * Send a referral payout issue email to admin
 * Called when a referrer hasn't received their payment
 */
export const sendPayoutIssueEmail = action({
  args: {
    walletAddress: v.string(),
    message: v.string(),
    pendingAmount: v.number(), // in lamports
    email: v.optional(v.string()), // optional contact email from user
  },
  handler: async (_, args) => {
    const resendApiKey = process.env.RESEND_API_KEY;
    const adminEmail = process.env.ADMIN_EMAIL || "support@domin8.gg";

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const resend = new Resend(resendApiKey);

    const pendingSOL = (args.pendingAmount / 1e9).toFixed(4);

    const { error } = await resend.emails.send({
      from: "Domin8 <noreply@domin8.gg>",
      to: adminEmail,
      subject: `[Referral Payout Issue] ${args.walletAddress.slice(0, 8)}...`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #6366f1;">Referral Payout Issue</h2>

          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0 0 8px 0;"><strong>Wallet:</strong></p>
            <code style="background: #e5e7eb; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
              ${args.walletAddress}
            </code>
          </div>

          <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0;"><strong>Pending Amount:</strong> ${pendingSOL} SOL</p>
          </div>

          ${args.email ? `
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0;"><strong>Contact Email:</strong> ${args.email}</p>
          </div>
          ` : ""}

          <div style="margin: 24px 0;">
            <p style="margin: 0 0 8px 0;"><strong>Message:</strong></p>
            <div style="background: #f9fafb; padding: 16px; border-radius: 8px; border-left: 4px solid #6366f1;">
              ${args.message.replace(/\n/g, "<br>")}
            </div>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            Sent from Domin8 Referral System
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("Failed to send email:", error);
      throw new Error("Failed to send email");
    }

    return { success: true };
  },
});
