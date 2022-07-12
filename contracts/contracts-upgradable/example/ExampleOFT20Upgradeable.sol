// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "hardhat-deploy/solc_0.8/proxy/Proxied.sol";
import "../token/OFT20/OFT20Upgradeable.sol";

contract ExampleOFT20Upgradeable is Initializable, OFT20Upgradeable, Proxied {

    function initialize(string memory _name, string memory _symbol, uint _initialSupply, address _lzEndpoint) public initializer {
        __ExampleOFT20Upgradeable_init(_name, _symbol, _initialSupply, _lzEndpoint);
    }

    function __ExampleOFT20Upgradeable_init(string memory _name, string memory _symbol, uint _initialSupply, address _lzEndpoint) internal onlyInitializing {
        __Ownable_init();
        __OFT20Upgradeable_init(_name, _symbol, _lzEndpoint);
        __ExampleOFT20Upgradeable_init_unchained(_name, _symbol, _initialSupply, _lzEndpoint);
    }

    function __ExampleOFT20Upgradeable_init_unchained(string memory, string memory, uint _initialSupply, address) internal onlyInitializing {
        _mint(_msgSender(), _initialSupply);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
