// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./CreatorCoin.sol";
import "./PostNFT.sol";

/// @title PostFactoryV2 — deploys a tradable CreatorCoin AND mints the post's ERC-721 collectible.
contract PostFactoryV2 {
    PostNFT public immutable postNFT;
    address[] public allCoins;
    mapping(address => address[]) public coinsByOwner;

    event PostAssetCreated(
        address indexed coin,
        uint256 indexed nftTokenId,
        bytes32 indexed postId,
        string name,
        string symbol,
        address owner
    );

    constructor(address _postNFT) {
        postNFT = PostNFT(_postNFT);
    }

    /// @param postId keccak256(bytes(postIdString)) — must match Echo's post UUID string hash.
    /// @param tokenURI ERC-721 metadata URL (Echo serves JSON at /api/nft/[postId]).
    function createPostAsset(
        string memory name,
        string memory symbol,
        address owner,
        bytes32 postId,
        string memory tokenURI
    ) external payable returns (address coin, uint256 nftTokenId) {
        CreatorCoin created = new CreatorCoin{value: msg.value}(name, symbol, 1_000_000e18, owner);
        coin = address(created);
        allCoins.push(coin);
        coinsByOwner[owner].push(coin);
        nftTokenId = postNFT.mintForPost(owner, postId, tokenURI);
        emit PostAssetCreated(coin, nftTokenId, postId, name, symbol, owner);
    }

    function getCoinsByOwner(address owner) external view returns (address[] memory) {
        return coinsByOwner[owner];
    }

    function getAllCoins() external view returns (address[] memory) {
        return allCoins;
    }

    /// @notice Mint only the ERC-721 collectible for a post that already has an ERC-20 coin (v1 backfill).
    function mintPostNft(address to, bytes32 postId, string memory tokenURI) external returns (uint256 nftTokenId) {
        nftTokenId = postNFT.mintForPost(to, postId, tokenURI);
    }
}
