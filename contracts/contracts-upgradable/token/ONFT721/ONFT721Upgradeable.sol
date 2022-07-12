// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol";
import "./ONFT721CoreUpgradeable.sol";
import "./IONFT721Upgradeable.sol";

// NOTE: this ONFT contract has no public minting logic.
// must implement your own minting logic in child classes
contract ONFT721Upgradeable is Initializable, ONFT721CoreUpgradeable, ERC721Upgradeable, IONFT721Upgradeable {

    function __ONFT721Upgradeable_init(string memory _name, string memory _symbol, address _lzEndpoint) internal onlyInitializing {
        __ERC721_init_unchained(_name, _symbol);
        __ONFT721CoreUpgradeable_init_unchained(_lzEndpoint);
    }

    function __ONFT721Upgradeable_init_unchained(string memory _name, string memory _symbol, address _lzEndpoint) internal onlyInitializing {
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ONFT721CoreUpgradeable, ERC721Upgradeable, IERC165Upgradeable) returns (bool) {
        return interfaceId == type(IONFT721Upgradeable).interfaceId || super.supportsInterface(interfaceId);
    }

    function _debitFrom(address _from, uint16, bytes memory, uint _tokenId) internal virtual override {
        require(_isApprovedOrOwner(_msgSender(), _tokenId), "ONFT721: send caller is not owner nor approved");
        require(ERC721Upgradeable.ownerOf(_tokenId) == _from, "ONFT721: send from incorrect owner");
        _burn(_tokenId);
    }

    function _creditTo(uint16, address _toAddress, uint _tokenId) internal virtual override {
        _safeMint(_toAddress, _tokenId);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
