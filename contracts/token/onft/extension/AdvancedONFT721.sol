// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8;

import "../ONFT721Enumerable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title Interface of the AdvancedONFT standard
/// @author exakoss
/// @notice this implementation supports: batch mint, payable public and private mint, reveal of metadata and EIP-2981 on-chain royalties
contract AdvancedONFT721 is ONFT721Enumerable, ReentrancyGuard {
    using Strings for uint;

    uint public price = 0;
    uint public nextMintId;
    uint public maxMintId;
    uint public maxTokensPerMint;

    // royalty fee in basis points (i.e. 100% = 10000, 1% = 100)
    uint royaltyBasisPoints = 500;
    // address for withdrawing money and receiving royalties, separate from owner
    address payable beneficiary;
    // Merkle Root for WL implementation
    bytes32 public merkleRoot;

    string public contractURI;
    string private baseURI;
    string private hiddenMetadataURI;

    mapping(address => uint) public _boughtCount;

    bool public _publicSaleStarted;
    bool public _saleStarted;
    bool revealed;

    /// @notice Constructor for the AdvancedONFT
    /// @param _name the name of the token
    /// @param _symbol the token symbol
    /// @param _layerZeroEndpoint handles message transmission across chains
    /// @param _startMintId the starting mint number on this chain, excluded
    /// @param _endMintId the max number of mints on this chain
    /// @param _maxTokensPerMint the max number of tokens that could be minted in a single transaction
    /// @param _baseTokenURI the base URI for computing the tokenURI
    /// @param _hiddenURI the URI for computing the hiddenMetadataUri
    constructor(string memory _name, string memory _symbol, address _layerZeroEndpoint, uint _startMintId, uint _endMintId, uint _maxTokensPerMint, string memory _baseTokenURI, string memory _hiddenURI) ONFT721Enumerable(_name, _symbol, _layerZeroEndpoint) {
        nextMintId = _startMintId;
        maxMintId = _endMintId;
        maxTokensPerMint = _maxTokensPerMint;
        //set default beneficiary to owner
        beneficiary = payable(msg.sender);
        baseURI = _baseTokenURI;
        hiddenMetadataURI = _hiddenURI;
    }

    /// @notice Mint your ONFTs
    function publicMint(uint _nbTokens) external payable {
        require(_publicSaleStarted == true, "AdvancedONFT721: Public sale has not started yet!");
        require(_saleStarted == true, "AdvancedONFT721: Sale has not started yet!");
        require(_nbTokens != 0, "AdvancedONFT721: Cannot mint 0 tokens!");
        require(_nbTokens <= maxTokensPerMint, "AdvancedONFT721: You cannot mint more than maxTokensPerMint tokens at once!");
        require(nextMintId + _nbTokens <= maxMintId, "AdvancedONFT721: max mint limit reached");
        require(_nbTokens * price <= msg.value, "AdvancedONFT721: Inconsistent amount sent!");

        //using a local variable, _mint and ++X pattern to save gas
        uint local_nextMintId = nextMintId;
        for (uint i; i < _nbTokens; i++) {
            _mint(msg.sender, ++local_nextMintId);
        }
        nextMintId = local_nextMintId;
    }

    /// @notice Mint your ONFTs, whitelisted addresses only
    function mint(uint _nbTokens, bytes32[] calldata _merkleProof) external payable {
        require(_saleStarted == true, "AdvancedONFT721: Sale has not started yet!");
        require(_nbTokens != 0, "AdvancedONFT721: Cannot mint 0 tokens!");
        require(_nbTokens <= maxTokensPerMint, "AdvancedONFT721: You cannot mint more than maxTokensPerMint tokens at once!");
        require(nextMintId + _nbTokens <= maxMintId, "AdvancedONFT721: max mint limit reached");
        require(_nbTokens * price <= msg.value, "AdvancedONFT721: Inconsistent amount sent!");
        require(_boughtCount[msg.sender] + _nbTokens <= maxTokensPerMint, "AdvancedONFT721: You exceeded your token limit.");

        bool isWL = MerkleProof.verify(_merkleProof, merkleRoot, keccak256(abi.encodePacked(_msgSender())));
        require(isWL == true, "AdvancedONFT721: Invalid Merkle Proof");

        _boughtCount[msg.sender] += _nbTokens;

        //using a local variable, _mint and ++X pattern to save gas
        uint local_nextMintId = nextMintId;
        for (uint i; i < _nbTokens; i++) {
            _mint(msg.sender, ++local_nextMintId);
        }
        nextMintId = local_nextMintId;
    }

    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        merkleRoot = _merkleRoot;
    }

    function setPrice(uint newPrice) external onlyOwner {
        price = newPrice;
    }

    function withdraw() public virtual onlyOwner {
        require(beneficiary != address(0), "AdvancedONFT721: Beneficiary not set!");
        uint _balance = address(this).balance;
        require(payable(beneficiary).send(_balance));
    }

    function royaltyInfo(uint, uint salePrice) external view returns (address receiver, uint royaltyAmount) {
        receiver = beneficiary;
        royaltyAmount = (salePrice * royaltyBasisPoints) / 10000;
    }

    function setContractURI(string memory _contractURI) public onlyOwner {
        contractURI = _contractURI;
    }

    function setBaseURI(string memory uri) public onlyOwner {
        baseURI = uri;
    }

    function setRoyaltyFee(uint _royaltyBasisPoints) external onlyOwner {
        royaltyBasisPoints = _royaltyBasisPoints;
    }

    function setBeneficiary(address payable _beneficiary) external onlyOwner {
        beneficiary = _beneficiary;
    }

    function setHiddenMetadataUri(string memory _hiddenMetadataUri) external onlyOwner {
        hiddenMetadataURI = _hiddenMetadataUri;
    }

    function flipRevealed() external onlyOwner {
        revealed = !revealed;
    }

    function flipSaleStarted() external onlyOwner {
        _saleStarted = !_saleStarted;
    }

    function flipPublicSaleStarted() external onlyOwner {
        _publicSaleStarted = !_publicSaleStarted;
    }

    // The following functions are overrides required by Solidity.
    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function tokenURI(uint tokenId) public view override(ERC721) returns (string memory) {
        require(_exists(tokenId), "ERC721Metadata: URI query for nonexistent token");
        if (!revealed) {
            return hiddenMetadataURI;
        }
        return string(abi.encodePacked(_baseURI(), tokenId.toString()));
    }
}
