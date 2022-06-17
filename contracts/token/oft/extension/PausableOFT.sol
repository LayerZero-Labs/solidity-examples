// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../OFT.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

// allow OFT to pause all cross-chain transactions
contract PausableOFT is OFT, Pausable {
    constructor(string memory _name, string memory _symbol, address _lzEndpoint) OFT(_name, _symbol, _lzEndpoint) {}

    function _debitFrom(address _from, uint16 _dstChainId, bytes memory _toAddress, uint _amount) internal virtual override whenNotPaused returns(uint256) {
        return super._debitFrom(_from, _dstChainId, _toAddress, _amount);
    }

    function pauseSendTokens(bool pause) external onlyOwner {
        pause ? _pause() : _unpause();
    }
}
