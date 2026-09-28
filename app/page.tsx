import type { Metadata } from "next";
import { LandingNav, HeroCta, HeroVisual, Ticker, HowItWorks, MarketsPreview, OrbitTeaser, WalletSection, FinalCta, LandingFooter, Reveal } from "@/components/landing";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${APP_NAME} — ${APP_TAGLINE}`,
  description: APP_DESCRIPTION,
};

export default function Landing() {
  return <div className="min-h-screen bg-[#08090b] text-[#eceef1] overflow-x-clip">
    <LandingNav />
    {/* HERO */}
    <section className="relative pt-32 sm:pt-40 pb-16 sm:pb-24">
      <div className="absolute inset-0 landing-grid pointer-events-none" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 grid lg:grid-cols-2 gap-14 lg:gap-8 items-center">
        <div>
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-300/25 bg-teal-300/[.07] px-3.5 py-1.5 text-xs text-teal-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Live on MST Testnet
            </span>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="text-4xl sm:text-6xl font-bold tracking-tighter leading-[1.04] mt-5">
              Own the culture<br />you create.
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="muted text-base sm:text-lg mt-5 max-w-md leading-relaxed">
              Echo is a social network where every post can become a coin.
              Collect editions, trade creator markets, and earn from the attention you create — settled on MST Blockchain.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="mt-7 flex flex-wrap gap-3">
              <HeroCta />
              <a href="#how" className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-7 py-3 text-sm hover:border-white/30 transition">How it works</a>
            </div>
          </Reveal>
          <Reveal delay={0.3}>
            <p className="text-xs mt-5 text-[#5b616b]">Non-custodial · Free test funds · No real money</p>
          </Reveal>
        </div>
        <HeroVisual />
      </div>
    </section>
    <Ticker />
    <HowItWorks />
    <MarketsPreview />
    <OrbitTeaser />
    <WalletSection />
    <FinalCta />
    <LandingFooter />
  </div>;
}
