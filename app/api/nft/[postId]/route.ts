import { NextResponse } from "next/server";
import { getLivePost } from "@/lib/db/dal";
import { appUrl } from "@/lib/app-url";

/** ERC-721 metadata for BridgeKey / wallet NFT galleries. */
export async function GET(_req: Request, ctx: { params: Promise<{ postId: string }> }) {
  const { postId } = await ctx.params;
  try {
    const post = await getLivePost(postId, null);
    if (!post) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const base = appUrl();
    const image = post.image?.startsWith("http") ? post.image : post.image ? `${base}${post.image}` : `${base}/globe.svg`;
    const symbol = post.postCoin?.symbol ?? "POST";
    const name = post.postCoin?.name ?? `Echo Post ${symbol}`;

    const metadata = {
      name,
      description: post.caption || `Collectible post by @${post.creator}`,
      image,
      external_url: `${base}/post/${post.id}`,
      attributes: [
        { trait_type: "Creator", value: post.creator },
        { trait_type: "Symbol", value: symbol },
        { trait_type: "Kind", value: post.kind },
      ],
    };

    return NextResponse.json(metadata, {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json({ error: "metadata_failed" }, { status: 500 });
  }
}
