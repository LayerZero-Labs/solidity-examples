// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8;

import "hardhat-deploy/solc_0.8/proxy/Proxied.sol";
import "../token/ONFT721/ONFT721Upgradeable.sol";

contract ExampleONFT721Upgradeable is Initializable, ONFT721Upgradeable, Proxied {

    function initialize(string memory _name, string memory _symbol, address _lzEndpoint) public initializer {
        __ONFT721UpgradeableMock_init(_name, _symbol, _lzEndpoint);
    }

    function __ONFT721UpgradeableMock_init(string memory _name, string memory _symbol, address _lzEndpoint) internal onlyInitializing {
        __Ownable_init();
        __ONFT721Upgradeable_init(_name, _symbol, _lzEndpoint);
    }

    function __ONFT721UpgradeableMock_init_unchained(string memory _name, string memory _symbol, address _lzEndpoint) internal onlyInitializing {
    }

    function mint(address _tokenOwner, uint _newId) external payable {
        _safeMint(_tokenOwner, _newId);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
