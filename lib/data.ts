export type Creator = { username: string; name: string; bio: string; followers: number; following: number; verified: boolean; coinId?: string; joined: string; location: string };
export type Coin = { id: string; name: string; symbol: string; creator: string; price: number; change24h: number; volume24h: number; marketCap: number; liquidity: number; holders: number; createdAt: string; spark: number[] };
export type Post = { id: string; creator: string; time: string; caption: string; image?: string; kind: "photo" | "video" | "text"; likes: number; comments: number; shares: number; coinId?: string; collects: number };
export type Tx = { id: string; type: "buy" | "sell" | "collect" | "create" | "send" | "receive"; coinId?: string; amount: string; mst: number; time: string; hash: string };

// Deterministic: this module is evaluated on the server and again in the browser,
// so Date.now()/Math.random() here would desync the SSR'd markup.
const EPOCH = Date.UTC(2026, 0, 15, 12, 0, 0);
const h = (n: number) => new Date(EPOCH - n * 3600e3).toISOString();
let seed = 0x2f6e2b1;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const spark = (base: number, drift: number, n = 24) => Array.from({ length: n }, (_, i) => +(base * (1 + drift * (i / n) + 0.06 * Math.sin(i * 1.3) + (rnd() - 0.5) * 0.04)).toFixed(4));

export const creators: Creator[] = [
  { username: "gajanan", name: "Gajanan", bio: "Building MSTORA · onchain media experiments from Mumbai", followers: 12840, following: 312, verified: true, coinId: "gajanan", joined: "Jan 2026", location: "Mumbai" },
  { username: "anaya", name: "Anaya Rao", bio: "Generative artist · 1/1s + open editions", followers: 21400, following: 480, verified: true, coinId: "anaya", joined: "Dec 2025", location: "Bengaluru" },
  { username: "memelord", name: "Meme Lord", bio: "Professional shitposter. Amateur millionaire.", followers: 45200, following: 1200, verified: true, coinId: "memelord", joined: "Nov 2025", location: "Internet" },
  { username: "satoshi_jr", name: "Kabir", bio: "AI agents + autonomous worlds", followers: 9800, following: 210, verified: true, coinId: "aiagent", joined: "Jan 2026", location: "Delhi" },
  { username: "lensqueen", name: "Meera", bio: "Street photographer · Mumbai / Tokyo", followers: 18600, following: 640, verified: true, coinId: "meera", joined: "Dec 2025", location: "Mumbai" },
  { username: "devpatel", name: "Dev Patel", bio: "Full-stack dev · building in public on MST", followers: 7400, following: 890, verified: false, coinId: "devbuild", joined: "Feb 2026", location: "Ahmedabad" },
  { username: "synthwave", name: "Arjun Synth", bio: "Music for onchain summers", followers: 15200, following: 300, verified: true, coinId: "synth", joined: "Nov 2025", location: "Goa" },
  { username: "pixelpriya", name: "Priya Nair", bio: "Pixel art · daily drops", followers: 11300, following: 520, verified: false, coinId: "pixel", joined: "Jan 2026", location: "Kochi" },
  { username: "zeroknow", name: "Rohan ZK", bio: "ZK research, simplified", followers: 6900, following: 410, verified: false, coinId: "zerok", joined: "Feb 2026", location: "Pune" },
  { username: "foodchain", name: "Ishaan", bio: "One dish a day, minted", followers: 22800, following: 350, verified: true, coinId: "food", joined: "Dec 2025", location: "Hyderabad" },
  { username: "fitonchain", name: "Kavya", bio: "Run club captain · fitness coins", followers: 9100, following: 280, verified: false, coinId: "runclub", joined: "Mar 2026", location: "Chennai" },
  { username: "archdesk", name: "Aditya Menon", bio: "Architecture sketches + city coins", followers: 5400, following: 190, verified: false, coinId: "arch", joined: "Mar 2026", location: "Jaipur" },
  { username: "voicebox", name: "Neha", bio: "Podcast clips + voice notes", followers: 13700, following: 460, verified: true, coinId: "voice", joined: "Jan 2026", location: "Delhi" },
  { username: "gamefolio", name: "Vikram", bio: "Indie games + playtests", followers: 8200, following: 330, verified: false, coinId: "playtest", joined: "Feb 2026", location: "Bengaluru" },
  { username: "finmeme", name: "Sana", bio: "Markets, memes, MST", followers: 19500, following: 510, verified: true, coinId: "finmeme", joined: "Dec 2025", location: "Mumbai" },
  { username: "wanderwrite", name: "Farhan", bio: "Travel essays + photo coins", followers: 6700, following: 240, verified: false, joined: "Apr 2026", location: "Leh" },
  { username: "codecanvas", name: "Ritu", bio: "Creative code + shaders", followers: 4800, following: 170, verified: false, joined: "Apr 2026", location: "Indore" },
  { username: "hoopdreams", name: "Armaan", bio: "Streetball highlights", followers: 10900, following: 390, verified: false, joined: "May 2026", location: "Delhi" },
];

export const coins: Coin[] = [
  { id: "gajanan", name: "Gajanan", symbol: "$GAJANAN", creator: "gajanan", price: 0.42, change24h: 18.4, volume24h: 12800, marketCap: 420000, liquidity: 86000, holders: 821, createdAt: "Jan 2026", spark: spark(0.35, 0.25) },
  { id: "aiagent", name: "AI Agent", symbol: "$AIAGENT", creator: "satoshi_jr", price: 0.19, change24h: 42.1, volume24h: 9400, marketCap: 190000, liquidity: 41000, holders: 421, createdAt: "Feb 2026", spark: spark(0.13, 0.55) },
  { id: "memelord", name: "Meme Lord", symbol: "$MEMELORD", creator: "memelord", price: 0.08, change24h: 12.2, volume24h: 5200, marketCap: 320000, liquidity: 64000, holders: 2912, createdAt: "Nov 2025", spark: spark(0.07, 0.15) },
  { id: "anaya", name: "Anaya", symbol: "$ANAYA", creator: "anaya", price: 1.24, change24h: 8.6, volume24h: 15200, marketCap: 1240000, liquidity: 210000, holders: 1104, createdAt: "Dec 2025", spark: spark(1.1, 0.12) },
  { id: "meera", name: "Meera", symbol: "$MEERA", creator: "lensqueen", price: 0.66, change24h: -3.2, volume24h: 4800, marketCap: 660000, liquidity: 98000, holders: 642, createdAt: "Jan 2026", spark: spark(0.7, -0.05) },
  { id: "synth", name: "Synthwave", symbol: "$SYNTH", creator: "synthwave", price: 0.31, change24h: 24.8, volume24h: 7300, marketCap: 310000, liquidity: 52000, holders: 538, createdAt: "Dec 2025", spark: spark(0.24, 0.35) },
  { id: "devbuild", name: "Build Daily", symbol: "$BUILD", creator: "devpatel", price: 0.05, change24h: 64.3, volume24h: 3900, marketCap: 50000, liquidity: 12000, holders: 289, createdAt: "Mar 2026", spark: spark(0.03, 0.8) },
  { id: "pixel", name: "Pixel Priya", symbol: "$PIXEL", creator: "pixelpriya", price: 0.12, change24h: 6.1, volume24h: 2100, marketCap: 120000, liquidity: 26000, holders: 374, createdAt: "Feb 2026", spark: spark(0.11, 0.08) },
  { id: "zerok", name: "Zero Know", symbol: "$ZEROK", creator: "zeroknow", price: 0.88, change24h: -6.4, volume24h: 6100, marketCap: 880000, liquidity: 140000, holders: 456, createdAt: "Feb 2026", spark: spark(0.95, -0.08) },
  { id: "food", name: "Food Chain", symbol: "$FOOD", creator: "foodchain", price: 0.23, change24h: 15.9, volume24h: 8700, marketCap: 230000, liquidity: 48000, holders: 1204, createdAt: "Jan 2026", spark: spark(0.19, 0.22) },
  { id: "runclub", name: "Run Club", symbol: "$RUN", creator: "fitonchain", price: 0.09, change24h: 31.5, volume24h: 3200, marketCap: 90000, liquidity: 18000, holders: 512, createdAt: "Apr 2026", spark: spark(0.07, 0.4) },
  { id: "arch", name: "Arch Desk", symbol: "$ARCH", creator: "archdesk", price: 0.15, change24h: 4.2, volume24h: 1100, marketCap: 150000, liquidity: 22000, holders: 198, createdAt: "May 2026", spark: spark(0.14, 0.06) },
  { id: "voice", name: "Voicebox", symbol: "$VOICE", creator: "voicebox", price: 0.54, change24h: 11.7, volume24h: 5900, marketCap: 540000, liquidity: 76000, holders: 623, createdAt: "Jan 2026", spark: spark(0.48, 0.14) },
  { id: "playtest", name: "Playtest", symbol: "$PLAY", creator: "gamefolio", price: 0.07, change24h: -11.8, volume24h: 2800, marketCap: 70000, liquidity: 15000, holders: 341, createdAt: "Mar 2026", spark: spark(0.08, -0.14) },
  { id: "finmeme", name: "Fin Meme", symbol: "$FINMEME", creator: "finmeme", price: 0.36, change24h: 22.4, volume24h: 10400, marketCap: 360000, liquidity: 68000, holders: 987, createdAt: "Dec 2025", spark: spark(0.29, 0.28) },
  { id: "cybermumbai", name: "Cyber Mumbai", symbol: "$CYBERMUMBAI", creator: "gajanan", price: 0.034, change24h: 28.4, volume24h: 4600, marketCap: 34000, liquidity: 9000, holders: 402, createdAt: "May 2026", spark: spark(0.026, 0.36) },
];

const img = (seed: string, w = 900, h2 = 620) => `https://picsum.photos/seed/${seed}/${w}/${h2}`;

export const posts: Post[] = [
  { id: "p1", creator: "gajanan", time: h(2), caption: "My first creation on MST. Cyber Mumbai — edition of 100. Collectors get airdropped $CYBERMUMBAI.", image: img("mstora-cyber"), kind: "photo", likes: 231, comments: 42, shares: 18, coinId: "cybermumbai", collects: 96 },
  { id: "p2", creator: "anaya", time: h(4), caption: "New generative study: monsoon grids. Each collect mints a unique variant.", image: img("mstora-monsoon"), kind: "photo", likes: 412, comments: 68, shares: 31, coinId: "anaya", collects: 184 },
  { id: "p3", creator: "memelord", time: h(5), caption: "POV: you held $MEMELORD through the dip", image: img("mstora-meme1"), kind: "photo", likes: 1204, comments: 214, shares: 342, coinId: "memelord", collects: 88 },
  { id: "p4", creator: "satoshi_jr", time: h(7), caption: "My agent just earned its first 12 MST autonomously. Log + strategy in comments.", kind: "text", likes: 389, comments: 112, shares: 44, coinId: "aiagent", collects: 57 },
  { id: "p5", creator: "lensqueen", time: h(9), caption: "Bandra at 6:40am. No edit, just fog and film.", image: img("mstora-bandra"), kind: "photo", likes: 528, comments: 74, shares: 26, coinId: "meera", collects: 142 },
  { id: "p6", creator: "synthwave", time: h(11), caption: "New track: 'Neon Tide'. 30 collectors unlock the stems.", image: img("mstora-synth"), kind: "photo", likes: 296, comments: 41, shares: 19, coinId: "synth", collects: 73 },
  { id: "p7", creator: "devpatel", time: h(13), caption: "Day 42 building in public: shipped onchain comments in 3 hours. Stack: Next.js + MST.", kind: "text", likes: 187, comments: 56, shares: 12, coinId: "devbuild", collects: 34 },
  { id: "p8", creator: "foodchain", time: h(15), caption: "Dish #88: miso butter khichdi. Recipe NFT for collectors.", image: img("mstora-food"), kind: "photo", likes: 642, comments: 98, shares: 45, coinId: "food", collects: 210 },
  { id: "p9", creator: "pixelpriya", time: h(18), caption: "Daily pixel #120 — the auto-rickshaw series continues.", image: img("mstora-pixel"), kind: "photo", likes: 274, comments: 33, shares: 14, coinId: "pixel", collects: 66 },
  { id: "p10", creator: "finmeme", time: h(20), caption: "MST szn portfolio check: up only (please clap)", image: img("mstora-charts"), kind: "photo", likes: 831, comments: 129, shares: 87, coinId: "finmeme", collects: 45 },
  { id: "p11", creator: "voicebox", time: h(22), caption: "3-min clip: why creator coins beat ad revenue. Full ep for holders.", kind: "text", likes: 198, comments: 37, shares: 21, coinId: "voice", collects: 52 },
  { id: "p12", creator: "zeroknow", time: h(26), caption: "ZK in 60 seconds: prove you know the secret without revealing it. Diagram below.", image: img("mstora-zk"), kind: "photo", likes: 243, comments: 61, shares: 38, coinId: "zerok", collects: 29 },
  { id: "p13", creator: "fitonchain", time: h(28), caption: "Sunday 10K — 214 runners, one coin. $RUN rewards drop tonight.", image: img("mstora-run"), kind: "photo", likes: 356, comments: 48, shares: 22, coinId: "runclub", collects: 91 },
  { id: "p14", creator: "gamefolio", time: h(31), caption: "Playtest #7 is live. Hold 50 $PLAY to get tonight's build.", image: img("mstora-game"), kind: "photo", likes: 164, comments: 44, shares: 11, coinId: "playtest", collects: 38 },
  { id: "p15", creator: "anaya", time: h(33), caption: "Process video: 400 lines of code → 1 print. Full timelapse for collectors.", image: img("mstora-process"), kind: "video", likes: 377, comments: 52, shares: 17, coinId: "anaya", collects: 118 },
  { id: "p16", creator: "gajanan", time: h(35), caption: "Why I left Web2 social: a thread on ownership, coins and exit.", kind: "text", likes: 445, comments: 89, shares: 63, coinId: "gajanan", collects: 41 },
  { id: "p17", creator: "archdesk", time: h(38), caption: "Sketching Jaipur's old city — one facade per day.", image: img("mstora-jaipur"), kind: "photo", likes: 129, comments: 18, shares: 7, coinId: "arch", collects: 27 },
  { id: "p18", creator: "memelord", time: h(41), caption: "New coin just dropped. No utility. Pure vibes.", image: img("mstora-vibes"), kind: "photo", likes: 978, comments: 186, shares: 210, coinId: "memelord", collects: 64 },
  { id: "p19", creator: "lensqueen", time: h(44), caption: "Tokyo crossing, shot on $MEERA holders' trip.", image: img("mstora-tokyo"), kind: "photo", likes: 614, comments: 82, shares: 29, coinId: "meera", collects: 156 },
  { id: "p20", creator: "satoshi_jr", time: h(47), caption: "$AIAGENT v2: memory + tipping. Agents that pay their fans.", kind: "text", likes: 321, comments: 94, shares: 36, coinId: "aiagent", collects: 48 },
  { id: "p21", creator: "wanderwrite", time: h(50), caption: "Leh at dawn — notes on thin air and slow mornings.", image: img("mstora-leh"), kind: "photo", likes: 208, comments: 26, shares: 9, collects: 33 },
  { id: "p22", creator: "codecanvas", time: h(53), caption: "Shader study #12 — reaction-diffusion in the browser.", image: img("mstora-shader"), kind: "photo", likes: 156, comments: 24, shares: 8, collects: 21 },
  { id: "p23", creator: "hoopdreams", time: h(56), caption: "Sunday run highlights — full mixtape for collectors.", image: img("mstora-hoops"), kind: "video", likes: 287, comments: 39, shares: 16, collects: 44 },
  { id: "p24", creator: "foodchain", time: h(60), caption: "Street cart series: midnight dosa run.", image: img("mstora-dosa"), kind: "photo", likes: 519, comments: 71, shares: 33, coinId: "food", collects: 178 },
  { id: "p25", creator: "synthwave", time: h(64), caption: "Live set from Goa — recorded to MST, split with $SYNTH holders.", image: img("mstora-goa"), kind: "video", likes: 342, comments: 47, shares: 25, coinId: "synth", collects: 84 },
  { id: "p26", creator: "finmeme", time: h(68), caption: "Market update: everything I own is a personality trait now.", kind: "text", likes: 402, comments: 77, shares: 41, coinId: "finmeme", collects: 36 },
  { id: "p27", creator: "devpatel", time: h(72), caption: "Open-sourced my MST starter kit. Star it, fork it, coin it.", image: img("mstora-code"), kind: "photo", likes: 298, comments: 83, shares: 52, coinId: "devbuild", collects: 69 },
  { id: "p28", creator: "voicebox", time: h(76), caption: "Ep 42 with @gajanan: building a social network you can own.", image: img("mstora-pod"), kind: "photo", likes: 225, comments: 31, shares: 14, coinId: "voice", collects: 47 },
  { id: "p29", creator: "pixelpriya", time: h(80), caption: "Collector showcase: your walls > galleries.", image: img("mstora-wall"), kind: "photo", likes: 189, comments: 22, shares: 10, coinId: "pixel", collects: 58 },
  { id: "p30", creator: "fitonchain", time: h(84), caption: "Couch to 5K plan — free for $RUN holders.", kind: "text", likes: 143, comments: 29, shares: 12, coinId: "runclub", collects: 39 },
  { id: "p31", creator: "gajanan", time: h(90), caption: "MSTORA manifesto: create → discover → collect → trade → earn.", kind: "text", likes: 512, comments: 104, shares: 78, coinId: "gajanan", collects: 132 },
  { id: "p32", creator: "gamefolio", time: h(96), caption: "Devlog: adding onchain leaderboards took one afternoon.", image: img("mstora-devlog"), kind: "photo", likes: 138, comments: 27, shares: 6, coinId: "playtest", collects: 24 },
];

export const txns: Tx[] = [
  { id: "t1", type: "buy", coinId: "gajanan", amount: "+120 $GAJANAN", mst: 50.4, time: h(1), hash: "0x9f2a…c41d" },
  { id: "t2", type: "collect", coinId: "cybermumbai", amount: "Collected #42", mst: 0.5, time: h(3), hash: "0x71be…09aa" },
  { id: "t3", type: "sell", coinId: "memelord", amount: "-400 $MEMELORD", mst: 32.0, time: h(6), hash: "0x44d0…b882" },
  { id: "t4", type: "buy", coinId: "aiagent", amount: "+85 $AIAGENT", mst: 16.15, time: h(10), hash: "0xa0c4…77e1" },
  { id: "t5", type: "create", coinId: "cybermumbai", amount: "Created $CYBERMUMBAI", mst: 0.1, time: h(26), hash: "0x5b19…f300" },
  { id: "t6", type: "receive", amount: "+5.0 MST", mst: 5.0, time: h(30), hash: "0x33aa…12cd" },
  { id: "t7", type: "buy", coinId: "anaya", amount: "+12 $ANAYA", mst: 14.88, time: h(34), hash: "0x88f1…9c02" },
  { id: "t8", type: "send", amount: "-2.0 MST", mst: 2.0, time: h(49), hash: "0x12de…45ab" },
];

export const holdings = [
  { coinId: "gajanan", amount: 320, avgBuy: 0.31 },
  { coinId: "aiagent", amount: 150, avgBuy: 0.11 },
  { coinId: "anaya", amount: 24, avgBuy: 1.02 },
  { coinId: "memelord", amount: 900, avgBuy: 0.06 },
  { coinId: "food", amount: 200, avgBuy: 0.18 },
];

export const creatorByName = (u: string) => creators.find((c) => c.username === u)!;
export const coinById = (id: string) => coins.find((c) => c.id === id)!;
export const recentTrades = (coinId: string, n = 8) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${coinId}-tr${i}`,
    side: i % 3 === 2 ? "SELL" : "BUY",
    amount: +(rnd() * 400 + 10).toFixed(0),
    price: coinById(coinId).price * (1 + (rnd() - 0.5) * 0.02),
    time: h(i * 1.4 + 0.5),
    trader: creators[(i * 5 + 3) % creators.length].username,
  }));
