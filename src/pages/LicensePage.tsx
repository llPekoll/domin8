export function LicensePage() {
  return (
    <div className="min-h-screen bg-[#1a0a05] text-[#FFD700] p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">License Agreement</h1>

        <div className="space-y-6 text-[#e0c068]">
          <p className="text-sm opacity-70">Last updated: February 2025</p>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">1. Grant of License</h2>
            <p>
              Domin8 ("we", "us", or "our") grants you a limited, non-exclusive, non-transferable,
              revocable license to access and use the Domin8 application and services for personal,
              non-commercial entertainment purposes, subject to the terms of this agreement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">2. Blockchain Transparency</h2>
            <p>
              Domin8 operates on the Solana blockchain. All game transactions, bets, and outcomes
              are recorded on-chain and publicly verifiable. Our smart contract address is:
              <code className="block mt-2 p-2 bg-black/30 rounded text-sm break-all">
                7bHYHZVu7kWRU4xf7DWypCvefWvuDqW1CqVfsuwdGiR7
              </code>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">3. Provably Fair Gaming</h2>
            <p>
              Winner selection uses Magic Block VRF (Verifiable Random Function) to ensure
              cryptographically secure and verifiable randomness. All randomness proofs are
              stored on-chain and can be independently verified.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">4. Fee Structure</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Multi-player games:</strong> 5% house fee, 95% to winner</li>
              <li><strong>Single-player games:</strong> 0% house fee, 100% refund</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">5. Non-Custodial</h2>
            <p>
              All funds are held in smart contract escrow, not by Domin8. We cannot access,
              freeze, or seize your funds. You maintain full custody of your wallet and assets
              at all times.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">6. Restrictions</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Use bots, scripts, or automated tools to interact with the game</li>
              <li>Exploit bugs or vulnerabilities in the smart contract or application</li>
              <li>Engage in collusion with other players</li>
              <li>Use the service for money laundering or illegal activities</li>
              <li>Reverse engineer or attempt to extract source code</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">7. Age Requirement</h2>
            <p>
              You must be at least 18 years old (or the age of majority in your jurisdiction)
              to use Domin8. By using our service, you confirm that you meet this requirement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">8. Disclaimer of Warranties</h2>
            <p>
              The service is provided "as is" without warranties of any kind. We do not guarantee
              uninterrupted access, absence of bugs, or any particular outcome from gameplay.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">9. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Domin8 shall not be liable for any indirect,
              incidental, special, or consequential damages arising from your use of the service,
              including loss of funds due to blockchain network issues.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">10. Contact</h2>
            <p>
              For questions about this license, contact us at:{" "}
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
