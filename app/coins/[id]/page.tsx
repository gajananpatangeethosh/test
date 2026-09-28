"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { BadgeCheck, ArrowUpRight, ArrowDownRight, Sparkles } from "lucide-react";
import { AppShell } from "@/components/shell";
import { Badge, Button, Card, Avatar } from "@/components/ui";
import { CoinChart } from "@/components/chart";
import { PostCard } from "@/components/post";
import { PortfolioCard, ActivityTimeline, MyCreatorCoin } from "@/components/wallet";
import { MintButton } from "@/components/mint-button";
import { coinById, creatorByName, posts, recentTrades } from "@/lib/data";
import { toMockFeedPost, fromLiveFeedPost, type FeedPost } from "@/lib/feed";
import { coinSourceLabel, fromLiveCoin, fromLiveCoinTrade, isMarketplaceDeployed, isOnChain, mintLabel, mockMarketCoins, type MarketCoin, type MarketTrade } from "@/lib/markets";
import { getCoinAction } from "@/app/actions/coins";
import { getAuthorPostsAction } from "@/app/actions/posts";
import { useApp } from "@/lib/store";
import { fmtMst, fmtNum, timeAgo } from "@/lib/utils";

export default function CoinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { openTrade, tradeTick } = useApp();
  const [live, setLive] = useState<MarketCoin | null>(null);
  const [trades, setTrades] = useState<MarketTrade[]>([]);
  const [authorPosts, setAuthorPosts] = useState<FeedPost[]>([]);
  const [state, setState] = useState<"loading" | "live" | "mock" | "missing">("loading");

  // Reset during render when the route changes (the React-recommended
  // alternative to setState-in-effect); a trade refresh keeps the old data
  // on screen instead of flashing a spinner.
  const [prevId, setPrevId] = useState(id);
  if (prevId !== id) {
    setPrevId(id);
    setState("loading");
    setLive(null);
    setTrades([]);
    setAuthorPosts([]);
  }

  useEffect(() => {
    let active = true;
    getCoinAction(id).then((r) => {
      if (!active) return;
      if (r.ok) {
        setLive(fromLiveCoin(r.coin));
        setTrades(r.trades.map(fromLiveCoinTrade));
        setState("live");
        void getAuthorPostsAction(r.coin.ownerWallet, 3).then((a) => {
          if (active && a.ok) setAuthorPosts(a.posts.map(fromLiveFeedPost));
        });
        return;
      }
      setLive(null);
      setState(coinById(id) ? "mock" : "missing");
    });
    return () => { active = false; };
  }, [id, tradeTick]);

  if (state === "missing") {
    return <AppShell><div className="py-20 text-center px-6">
      <h1 className="text-2xl font-bold">Coin not found</h1>
      <p className="muted text-sm mt-2">No live coin or mock sample with that id.</p>
      <Link href="/markets" className="inline-block mt-6 rounded-full bg-white text-black text-sm font-medium px-5 py-2.5">Back to Markets</Link>
    </div></AppShell>;
  }

  if (state === "loading" || (state === "live" && live === null)) {
    return <AppShell right={<><MyCreatorCoin /><PortfolioCard /><ActivityTimeline limit={4} /></>}>
      <div className="py-20 text-center text-sm muted">Loading coin…</div>
    </AppShell>;
  }

  if (state === "live" && live) {
    return <LiveCoinView coin={live} trades={trades} authorPosts={authorPosts} onTrade={(side) => openTrade(live, side)} />;
  }

  return <MockCoinView id={id} />;
}

function LiveCoinView({ coin, trades, authorPosts, onTrade }: {
  coin: MarketCoin;
  trades: MarketTrade[];
  authorPosts: FeedPost[];
  onTrade: (side: "buy" | "sell") => void;
}) {
  const up = coin.change24h >= 0;
  const minted = coin.mintStatus === "minted";
  const stats: [string, string][] = [
    ["Market cap", `${fmtNum(coin.marketCap)} MST`],
    ["Liquidity", `${fmtNum(coin.liquidity)} MST`],
    ["Volume 24h", `${fmtNum(coin.volume24h)} MST`],
    ["Holders", fmtNum(coin.holders)],
  ];
  return <AppShell right={<><MyCreatorCoin /><PortfolioCard /><ActivityTimeline limit={4} /></>}>
    <div className="py-4 px-3 sm:px-0 space-y-3">
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <Avatar name={coin.name} size={48} />
          <div className="flex-1">
            <div className="font-bold text-lg">{coin.name} <span className="muted font-normal text-sm">{coin.symbol}</span></div>
            <Link href={`/creator/${coin.creatorUsername}`} className="text-sm text-teal-300 hover:underline flex items-center gap-1">
              @{coin.creatorUsername}
            </Link>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge tone={up ? "up" : "down"}>{up ? "+" : ""}{coin.change24h}% 24h</Badge>
            <span className="rounded-full border border-teal-300/30 bg-teal-300/10 px-2 py-0.5 text-[10px] font-medium text-teal-200">{coinSourceLabel("live")}</span>
          </div>
        </div>

        <div className="mt-4 text-3xl font-bold">{fmtMst(coin.price)} <span className="text-sm muted font-normal">MST</span></div>
        <div className="mt-3"><CoinChart spark={coin.spark} height={240} /></div>

        <div className="mt-4 rounded-xl border border-white/10 p-4 text-xs space-y-1.5">
          <div className="flex items-center gap-2">
            <Sparkles size={13} className={minted ? "text-teal-300" : "text-amber-300"} />
            <span className="font-medium">{mintLabel(coin.mintStatus)}</span>
            {coin.chainId && <span className="muted">chain {coin.chainId}</span>}
          </div>
          {minted
            ? <p className="muted break-all">Token {coin.tokenAddress} · buys settle through BridgeKey on MST</p>
            : <p className="muted">
                {isMarketplaceDeployed()
                  ? "Mint pending. The creator must confirm Mint on MST via BridgeKey — then buyers trade on-chain and tokens land in their wallet."
                  : "This coin is live in the Echo ledger. On-chain minting opens once the MST CreatorFactory contract is deployed."}
              </p>}
          {!minted && (
            <div className="mt-3">
              <MintButton coinId={coin.id} name={coin.name} symbol={coin.symbol} owner={coin.ownerWallet} />
            </div>
          )}
        </div>

        {coin.viewerHolding > 0 && <div className="mt-3 rounded-xl border border-white/10 p-4 flex justify-between text-sm">
          <span className="muted">Your balance</span>
          <span>{fmtNum(coin.viewerHolding)} {coin.symbol}</span>
        </div>}

        <div className="grid grid-cols-2 gap-2 mt-4">
          <Button onClick={() => onTrade("buy")} disabled={isMarketplaceDeployed() && !isOnChain(coin)}>
            Buy {coin.symbol}
          </Button>
          <Button variant="outline" onClick={() => onTrade("sell")} disabled={coin.viewerHolding <= 0 || (isMarketplaceDeployed() && !isOnChain(coin))}>
            Sell
          </Button>
        </div>
        {isMarketplaceDeployed() && !isOnChain(coin) && (
          <p className="muted text-xs mt-2">Trading unlocks after the creator mints on MST via BridgeKey.</p>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{stats.map(([k, v]) => (
        <Card key={k} className="p-4"><div className="muted text-xs">{k}</div><div className="font-semibold mt-1">{v}</div></Card>))}</div>

      <Card className="p-5">
        <div className="font-semibold mb-3">Recent trades</div>
        {trades.length === 0 && <p className="muted text-sm">No trades yet — be the first buyer.</p>}
        {trades.map((t) => <div key={t.id} className="flex items-center gap-2 text-sm py-2 border-b border-white/[.04] last:border-0">
          <span className={t.side === "buy" ? "tick-up" : "tick-down"}>{t.side === "buy" ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}</span>
          <span className="muted">@{t.traderUsername}</span>
          <span className="ml-auto">{fmtNum(t.amount)} {coin.symbol}</span>
          <span className="muted text-xs w-20 text-right">{timeAgo(t.createdAt)}</span>
        </div>)}
      </Card>

      {authorPosts.length > 0 && <div>
        <div className="font-semibold px-1 mb-2">Posts by @{coin.creatorUsername}</div>
        {authorPosts.map((p) => <PostCard key={p.id} post={p} />)}
      </div>}

      <MoreCoins currentId={coin.id} />
    </div>
  </AppShell>;
}

function MockCoinView({ id }: { id: string }) {
  const { openTrade } = useApp();
  const coin = coinById(id);
  if (!coin) return null;
  const creator = creatorByName(coin.creator);
  const up = coin.change24h >= 0;
  const related = posts.filter((p) => p.coinId === coin.id);
  const trades = recentTrades(coin.id);
  const stats: [string, string][] = [
    ["Market cap", `${fmtNum(coin.marketCap)} MST`], ["Liquidity", `${fmtNum(coin.liquidity)} MST`],
    ["Volume 24h", `${fmtNum(coin.volume24h)} MST`], ["Holders", fmtNum(coin.holders)],
  ];
  const target = mockMarketCoins().find((c) => c.id === coin.id) ?? null;
  return <AppShell right={<><MyCreatorCoin /><PortfolioCard /><ActivityTimeline limit={4} /></>}>
    <div className="py-4 px-3 sm:px-0 space-y-3">
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <Avatar name={coin.name} size={48} />
          <div className="flex-1">
            <div className="font-bold text-lg">{coin.name} <span className="muted font-normal text-sm">{coin.symbol}</span></div>
            <Link href={`/creator/${creator.username}`} className="text-sm text-teal-300 hover:underline flex items-center gap-1">
              @{creator.username} {creator.verified && <BadgeCheck size={14} />}
            </Link>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge tone={up ? "up" : "down"}>{up ? "+" : ""}{coin.change24h}% 24h</Badge>
            <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[10px] font-medium text-amber-200">{coinSourceLabel("mock")}</span>
          </div>
        </div>
        <div className="mt-4 text-3xl font-bold">{fmtMst(coin.price)} <span className="text-sm muted font-normal">MST</span></div>
        <div className="mt-3"><CoinChart spark={coin.spark} height={240} /></div>
        <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/5 p-4 text-xs muted">
          Sample data from lib/data.ts. Live creator coins are minted per real profile and are labelled Live.
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <Button onClick={() => { if (target) openTrade(target, "buy"); }}>Buy {coin.symbol}</Button>
          <Button variant="outline" onClick={() => { if (target) openTrade(target, "sell"); }}>Sell</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{stats.map(([k, v]) => (
        <Card key={k} className="p-4"><div className="muted text-xs">{k}</div><div className="font-semibold mt-1">{v}</div></Card>))}</div>
      <Card className="p-5">
        <div className="font-semibold mb-3">Recent trades</div>
        {trades.map((t) => <div key={t.id} className="flex items-center gap-2 text-sm py-2 border-b border-white/[.04] last:border-0">
          <span className={t.side === "BUY" ? "tick-up" : "tick-down"}>{t.side === "BUY" ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}</span>
          <span className="muted">@{t.trader}</span>
          <span className="ml-auto">{t.amount} {coin.symbol}</span>
          <span className="muted text-xs w-20 text-right">{timeAgo(t.time)}</span>
        </div>)}
      </Card>
      {related.length > 0 && <div>
        <div className="font-semibold px-1 mb-2">Related posts</div>
        {related.map((p) => <PostCard key={p.id} post={toMockFeedPost(p)} />)}
      </div>}
      <MoreCoins currentId={coin.id} />
    </div>
  </AppShell>;
}

function MoreCoins({ currentId }: { currentId: string }) {
  const others = mockMarketCoins().filter((c) => c.id !== currentId).slice(0, 4);
  return <div>
    <div className="font-semibold px-1 mb-2">More coins</div>
    <div className="grid grid-cols-2 gap-2">
      {others.map((c) => <Link key={c.id} href={`/coins/${c.id}`} className="card card-hover p-4">
        <div className="font-semibold text-sm">{c.symbol}</div>
        <div className="muted text-xs">{fmtMst(c.price)} MST · <span className={c.change24h >= 0 ? "tick-up" : "tick-down"}>{c.change24h}%</span></div>
      </Link>)}
    </div>
  </div>;
}
