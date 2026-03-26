export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#1a0a05] text-[#FFD700] p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">Privacy Policy</h1>

        <div className="space-y-6 text-[#e0c068]">
          <p className="text-sm opacity-70">Last updated: February 2025</p>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">1. Introduction</h2>
            <p>
              Domin8 ("we", "us", or "our") respects your privacy. This policy explains how we
              collect, use, and protect your information when you use our battle royale betting
              game on Solana.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">2. Information We Collect</h2>

            <h3 className="text-lg font-semibold text-[#FFA500] mt-4 mb-2">Wallet Information</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Public wallet address (required for gameplay)</li>
              <li>Transaction history related to Domin8 games</li>
              <li>On-chain activity (publicly visible on Solana blockchain)</li>
            </ul>

            <h3 className="text-lg font-semibold text-[#FFA500] mt-4 mb-2">Account Information (via Privy)</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Email address (if you sign up with email)</li>
              <li>Social login identifiers (Google, Twitter, Discord - if used)</li>
              <li>Embedded wallet data (managed by Privy)</li>
            </ul>

            <h3 className="text-lg font-semibold text-[#FFA500] mt-4 mb-2">Technical Information</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Device type and browser information</li>
              <li>IP address (for security and fraud prevention)</li>
              <li>Game session data and preferences</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To provide and operate the Domin8 game</li>
              <li>To process bets and distribute winnings</li>
              <li>To verify wallet ownership and prevent fraud</li>
              <li>To improve our services and user experience</li>
              <li>To communicate important updates or changes</li>
              <li>To comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">4. Blockchain Transparency</h2>
            <p>
              <strong>Important:</strong> Solana is a public blockchain. All transactions,
              including bets, winnings, and wallet addresses, are permanently recorded and
              publicly visible. We cannot delete or modify blockchain data.
            </p>
            <p className="mt-2">
              Your wallet address and transaction history on Domin8 are publicly visible to
              anyone who views the blockchain. Do not share your wallet address if you wish
              to remain anonymous.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">5. Third-Party Services</h2>
            <p>We use the following third-party services:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>Privy:</strong> Authentication and wallet management</li>
              <li><strong>API Server:</strong> Real-time database and backend</li>
              <li><strong>Helius:</strong> Blockchain event monitoring</li>
              <li><strong>Vercel:</strong> Hosting and analytics</li>
              <li><strong>Magic Block:</strong> VRF randomness provider</li>
            </ul>
            <p className="mt-2">
              Each service has its own privacy policy. We encourage you to review them.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">6. Data Retention</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Off-chain data:</strong> Retained while your account is active, deleted upon request</li>
              <li><strong>On-chain data:</strong> Permanently stored on Solana blockchain (cannot be deleted)</li>
              <li><strong>Analytics data:</strong> Aggregated and anonymized after 90 days</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">7. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Access your personal data we hold</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of off-chain data</li>
              <li>Opt out of marketing communications</li>
              <li>Export your data in a portable format</li>
            </ul>
            <p className="mt-2">
              Note: We cannot delete on-chain blockchain data as it is immutable.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">8. Security</h2>
            <p>
              We implement industry-standard security measures to protect your data. However,
              no system is 100% secure. We recommend using strong passwords, enabling 2FA where
              available, and never sharing your wallet seed phrase.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">9. Children's Privacy</h2>
            <p>
              Domin8 is not intended for users under 18 years old. We do not knowingly collect
              information from minors. If we learn we have collected data from a minor, we will
              delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">10. Changes to This Policy</h2>
            <p>
              We may update this policy from time to time. We will notify you of significant
              changes by posting a notice on our website or sending you a notification.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">11. Contact Us</h2>
            <p>
              For privacy-related questions or requests, contact us at:{" "}
              <a href="mailto:contact@gravity5.pro" className="underline hover:text-white">
                contact@gravity5.pro
              </a>
            </p>
          </section>
        </div>

        <div className="mt-12 text-center">
          <a
            href="/"
            className="inline-block px-6 py-3 bg-[#FFA500] text-black font-bold rounded hover:bg-[#FFD700] transition-colors"
          >
            Back to Game
          </a>
        </div>
      </div>
    </div>
  );
}
