// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IONFT721Enumerable.sol";
import "./ONFT721Core.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

// NOTE: this ONFT contract has no public minting logic.
// must implement your own minting logic in child classes
contract ONFT721Enumerable is ONFT721Core, ERC721Enumerable, IONFT721Enumerable {
    constructor(string memory _name, string memory _symbol, address _lzEndpoint) ERC721(_name, _symbol) ONFT721Core(_lzEndpoint) {}

    function supportsInterface(bytes4 interfaceId) public view virtual override(ONFT721Core, ERC721Enumerable, IERC165) returns (bool) {
        return interfaceId == type(IONFT721Enumerable).interfaceId || super.supportsInterface(interfaceId);
    }

    function _debitFrom(address _from, uint16, bytes memory, uint _tokenId) internal virtual override {
        require(_isApprovedOrOwner(_msgSender(), _tokenId), "ONFT721Enumerable: send caller is not owner nor approved");
        require(ERC721.ownerOf(_tokenId) == _from, "ONFT721Enumerable: send from incorrect owner");
        _burn(_tokenId);
    }

    function _creditTo(uint16, address _toAddress, uint _tokenId) internal virtual override {
        _safeMint(_toAddress, _tokenId);
    }
}
