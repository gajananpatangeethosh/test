// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./CreatorCoin.sol";

/// @title PostFactory — deploys a CreatorCoin per post.
contract PostFactory {
    address[] public allCoins;
    mapping(address => address[]) public coinsByOwner;

    event CoinCreated(address indexed coin, string name, string symbol, address indexed owner);

    function createPostCoin(string memory name, string memory symbol, address owner)
        external
        payable
        returns (address)
    {
        CreatorCoin coin = new CreatorCoin{value: msg.value}(name, symbol, 1_000_000e18, owner);
        allCoins.push(address(coin));
        coinsByOwner[owner].push(address(coin));
        emit CoinCreated(address(coin), name, symbol, owner);
        return address(coin);
    }

    function getCoinsByOwner(address owner) external view returns (address[] memory) {
        return coinsByOwner[owner];
    }

    function getAllCoins() external view returns (address[] memory) {
        return allCoins;
    }
}
