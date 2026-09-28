// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CreatorCoin — a MEP-20 token with an integrated constant-product bonding-curve pool.
/// @notice The contract holds the token supply and the MST reserve. Buyers send MST and
///         receive tokens; sellers send tokens and receive MST. k = reserve * poolSupply is
///         invariant. The creator owns the contract and may withdraw the reserve.
contract CreatorCoin {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint256 public totalSupply; // ERC-20 total supply (constant)
    uint256 public reserve;     // MST (wei) held by the pool
    address public owner;

    uint256 public constant CREATOR_AIRDROP = 100; // 1% of supply goes to the creator

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Buy(address indexed buyer, uint256 mstIn, uint256 unitsOut);
    event Sell(address indexed seller, uint256 unitsIn, uint256 mstOut);
    event Seeds(address indexed seeder, uint256 mstIn);

    constructor(string memory _name, string memory _symbol, uint256 _supply, address _owner) payable {
        name = _name;
        symbol = _symbol;
        totalSupply = _supply;
        owner = _owner;
        uint256 creatorAmount = _supply / CREATOR_AIRDROP;
        balanceOf[_owner] = creatorAmount;
        balanceOf[address(this)] = _supply - creatorAmount;
        reserve = address(this).balance;
    }

    // ── AMM ────────────────────────────────────────────────────────────────

    /// @notice Spot price in wei (reserve / poolSupply).
    function price() external view returns (uint256) {
        return reserve / balanceOf[address(this)];
    }

    /// @notice Buy tokens with MST. Caller is the recipient.
    function buy() external payable {
        _buy(msg.sender);
    }

    /// @notice Buy tokens with MST for a recipient (used by the marketplace).
    function buy(address recipient) external payable {
        _buy(recipient);
    }

    function _buy(address recipient) private {
        require(msg.value > 0, "CreatorCoin: no MST sent");
        uint256 pool = balanceOf[address(this)];
        require(pool > 0, "CreatorCoin: pool empty");
        require(reserve > 0, "CreatorCoin: pool not seeded");
        uint256 k = reserve * pool;
        uint256 newReserve = reserve + msg.value;
        uint256 newPool = k / newReserve;
        uint256 units = pool - newPool;
        require(units > 0, "CreatorCoin: amount too small");
        reserve = newReserve;
        balanceOf[address(this)] = newPool;
        balanceOf[recipient] += units;
        emit Transfer(address(this), recipient, units);
        emit Buy(recipient, msg.value, units);
    }

    /// @notice Sell tokens for MST. Caller receives the MST.
    function sell(uint256 units) external {
        _sell(units, msg.sender);
    }

    /// @notice Sell tokens for MST, recipient receives the MST (used by the marketplace).
    function sell(uint256 units, address recipient) external {
        _sell(units, recipient);
    }

    function _sell(uint256 units, address recipient) private {
        require(units > 0, "CreatorCoin: no units");
        require(balanceOf[msg.sender] >= units, "CreatorCoin: insufficient balance");
        uint256 pool = balanceOf[address(this)];
        require(reserve > 0, "CreatorCoin: pool not seeded");
        uint256 newPool = pool + units;
        uint256 newReserve = (reserve * pool) / newPool;
        uint256 proceeds = reserve - newReserve;
        require(proceeds > 0, "CreatorCoin: pool empty");
        balanceOf[msg.sender] -= units;
        balanceOf[address(this)] = newPool;
        reserve = newReserve;
        (bool ok, ) = recipient.call{value: proceeds}("");
        require(ok, "CreatorCoin: MST transfer failed");
        emit Transfer(msg.sender, address(this), units);
        emit Sell(msg.sender, units, proceeds);
    }

    /// @notice Seed the pool reserve with MST.
    function seed() external payable {
        require(msg.value > 0, "CreatorCoin: no MST sent");
        reserve += msg.value;
        emit Seeds(msg.sender, msg.value);
    }

    /// @notice Owner withdraws the MST reserve.
    function withdraw() external {
        require(msg.sender == owner, "CreatorCoin: not owner");
        uint256 bal = address(this).balance;
        require(bal > 0, "CreatorCoin: nothing to withdraw");
        reserve = 0;
        (bool ok, ) = owner.call{value: bal}("");
        require(ok, "CreatorCoin: transfer failed");
    }

    // ── ERC-20 ─────────────────────────────────────────────────────────────

    function transfer(address to, uint256 amount) external returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "CreatorCoin: insufficient allowance");
        allowance[from][msg.sender] = allowed - amount;
        return _transfer(from, to, amount);
    }

    function _transfer(address from, address to, uint256 amount) private returns (bool) {
        require(to != address(0), "CreatorCoin: transfer to zero");
        require(balanceOf[from] >= amount, "CreatorCoin: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    receive() external payable {
        reserve += msg.value;
        emit Seeds(msg.sender, msg.value);
    }
}
