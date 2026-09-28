// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./CreatorCoin.sol";

/// @title Marketplace — thin trading router over CreatorCoin pools.
contract Marketplace {
    event Trade(address indexed coin, address indexed trader, bool buy, uint256 amount);

    /// @notice Buy a coin's tokens with MST. `recipient` receives the tokens.
    function buy(address payable coin, address recipient) external payable {
        require(msg.value > 0, "Marketplace: no MST");
        CreatorCoin(coin).buy{value: msg.value}(recipient);
        emit Trade(coin, msg.sender, true, msg.value);
    }

    /// @notice Sell a coin's tokens for MST. Seller must approve this contract first.
    function sell(address payable coin, uint256 units, address recipient) external {
        CreatorCoin(coin).transferFrom(msg.sender, address(this), units);
        CreatorCoin(coin).sell(units, recipient);
        emit Trade(coin, msg.sender, false, units);
    }
}
