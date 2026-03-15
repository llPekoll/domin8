export function CopyrightPage() {
  return (
    <div className="min-h-screen bg-[#1a0a05] text-[#FFD700] p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">Copyright Notice</h1>

        <div className="space-y-6 text-[#e0c068]">
          <p className="text-sm opacity-70">Last updated: February 2025</p>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">Copyright Ownership</h2>
            <p>
              Copyright 2025 Domin8. All rights reserved.
            </p>
            <p className="mt-4">
              The Domin8 name, logo, visual design, user interface, game mechanics, smart contract
              code, and all associated materials are the exclusive property of Domin8 and are
              protected by international copyright, trademark, and intellectual property laws.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">Protected Content</h2>
            <p>The following elements are protected by copyright:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Domin8 logo and brand assets</li>
              <li>Character designs and artwork</li>
              <li>Map designs and backgrounds</li>
              <li>User interface design and layout</li>
              <li>Animation and visual effects</li>
              <li>Sound effects and music (if applicable)</li>
              <li>Smart contract architecture and code</li>
              <li>Website and application source code</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">Open Source Components</h2>
            <p>
              Domin8 uses various open-source libraries and frameworks, each governed by their
              respective licenses. Our use of these components does not transfer any ownership
              rights to users. Key technologies include:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>React (MIT License)</li>
              <li>Phaser.js (MIT License)</li>
              <li>Solana Web3.js (Apache 2.0)</li>
              <li>Anchor Framework (Apache 2.0)</li>
              <li>Convex (Proprietary)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">Permitted Use</h2>
            <p>You are permitted to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Play the game for personal entertainment</li>
              <li>Share screenshots or recordings for non-commercial purposes</li>
              <li>Link to our website</li>
              <li>Discuss and review the game publicly</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">Prohibited Use</h2>
            <p>Without explicit written permission, you may not:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Copy, modify, or distribute our source code</li>
              <li>Use our brand assets for commercial purposes</li>
              <li>Create derivative works based on our game</li>
              <li>Reverse engineer our smart contracts for competing products</li>
              <li>Scrape or harvest content from our platform</li>
              <li>Use our trademarks without authorization</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">User-Generated Content</h2>
            <p>
              By using Domin8, you grant us a non-exclusive, royalty-free license to use any
              feedback, suggestions, or content you submit for improving our services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">DMCA Notice</h2>
            <p>
              If you believe your copyrighted work has been infringed upon, please contact us at:{" "}
              <a href="mailto:contact@gravity5.pro" className="underline hover:text-white">
                contact@gravity5.pro
              </a>
            </p>
            <p className="mt-2">
              Please include: (1) description of the copyrighted work, (2) location of the
              infringing material, (3) your contact information, (4) a statement of good faith
              belief, and (5) a statement under penalty of perjury that you are authorized to act.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#FFD700] mb-3">Contact</h2>
            <p>
              For copyright inquiries:{" "}
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
