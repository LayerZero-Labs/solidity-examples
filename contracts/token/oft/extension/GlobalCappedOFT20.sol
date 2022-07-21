// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./BasedOFT20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";

/**
 * @dev Extension of {OFT} that adds a global cap to the supply of tokens across all chains.
 */
contract GlobalCappedOFT20 is BasedOFT20, ERC20Capped {
    constructor(string memory _name, string memory _symbol, uint _cap, address _lzEndpoint) BasedOFT20(_name, _symbol, _lzEndpoint) ERC20Capped(_cap) {}

    function _mint(address account, uint amount) internal virtual override(ERC20, ERC20Capped) {
        ERC20Capped._mint(account, amount);
    }
}
