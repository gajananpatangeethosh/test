// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title PostNFT — ERC-721 collectible for each Echo post (image metadata via tokenURI).
/// @notice One NFT per post (visual collectible). Trading uses the separate CreatorCoin (MEP-20).
contract PostNFT {
    string public constant name = "Echo Post";
    string public constant symbol = "EPOST";

    address public owner;
    address public minter;

    uint256 private _nextTokenId;
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    mapping(uint256 => string) private _tokenURIs;
    mapping(bytes32 => uint256) public tokenIdByPostId;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event PostMinted(uint256 indexed tokenId, bytes32 indexed postId, address indexed to, string tokenURI);

    bytes4 private constant INTERFACE_ID_ERC165 = 0x01ffc9a7;
    bytes4 private constant INTERFACE_ID_ERC721 = 0x80ac58cd;
    bytes4 private constant INTERFACE_ID_ERC721_METADATA = 0x5b5e139f;

    constructor() {
        owner = msg.sender;
        minter = msg.sender;
    }

    function setMinter(address _minter) external {
        require(msg.sender == owner, "PostNFT: not owner");
        minter = _minter;
    }

    /// @notice Mint the visual NFT for a post. `postId` is keccak256(bytes(postIdString)).
    function mintForPost(address to, bytes32 postId, string memory uri) external returns (uint256 tokenId) {
        require(msg.sender == minter, "PostNFT: not minter");
        require(tokenIdByPostId[postId] == 0, "PostNFT: already minted");
        tokenId = ++_nextTokenId;
        tokenIdByPostId[postId] = tokenId;
        _mint(to, tokenId);
        _tokenURIs[tokenId] = uri;
        emit PostMinted(tokenId, postId, to, uri);
    }

    function balanceOf(address account) external view returns (uint256) {
        require(account != address(0), "PostNFT: zero address");
        return _balances[account];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address o = _owners[tokenId];
        require(o != address(0), "PostNFT: invalid token");
        return o;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(_owners[tokenId] != address(0), "PostNFT: invalid token");
        return _tokenURIs[tokenId];
    }

    function approve(address to, uint256 tokenId) external {
        address tokenOwner = ownerOf(tokenId);
        require(to != tokenOwner, "PostNFT: approve to owner");
        require(
            msg.sender == tokenOwner || isApprovedForAll(tokenOwner, msg.sender),
            "PostNFT: not authorized"
        );
        _tokenApprovals[tokenId] = to;
        emit Approval(tokenOwner, to, tokenId);
    }

    function getApproved(uint256 tokenId) public view returns (address) {
        require(_owners[tokenId] != address(0), "PostNFT: invalid token");
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external {
        require(operator != msg.sender, "PostNFT: approve to caller");
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address tokenOwner, address operator) public view returns (bool) {
        return _operatorApprovals[tokenOwner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "PostNFT: not authorized");
        _transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        transferFrom(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata) external {
        transferFrom(from, to, tokenId);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == INTERFACE_ID_ERC165
            || interfaceId == INTERFACE_ID_ERC721
            || interfaceId == INTERFACE_ID_ERC721_METADATA;
    }

    function _mint(address to, uint256 tokenId) internal {
        require(to != address(0), "PostNFT: mint to zero");
        require(_owners[tokenId] == address(0), "PostNFT: token exists");
        _balances[to] += 1;
        _owners[tokenId] = to;
        emit Transfer(address(0), to, tokenId);
    }

    function _transfer(address from, address to, uint256 tokenId) internal {
        require(ownerOf(tokenId) == from, "PostNFT: wrong from");
        require(to != address(0), "PostNFT: transfer to zero");
        if (_tokenApprovals[tokenId] != address(0)) {
            _tokenApprovals[tokenId] = address(0);
        }
        _balances[from] -= 1;
        _balances[to] += 1;
        _owners[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address tokenOwner = ownerOf(tokenId);
        return spender == tokenOwner
            || getApproved(tokenId) == spender
            || isApprovedForAll(tokenOwner, spender);
    }
}
