// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../OFT20.sol";

contract BasedOFT20 is OFT20 {
    constructor(string memory _name, string memory _symbol, address _lzEndpoint) OFT20(_name, _symbol, _lzEndpoint) {}

    function circulatingSupply() public view virtual override returns (uint) {
        unchecked {
            return totalSupply() - balanceOf(address(this));
        }
    }

    function _debitFrom(address _from, uint16, bytes memory, uint _amount) internal virtual override {
        address spender = _msgSender();
        if (_from != spender) _spendAllowance(_from, spender, _amount);
        _transfer(_from, address(this), _amount);
    }

    function _creditTo(uint16, address _toAddress, uint _amount) internal virtual override {
        _transfer(address(this), _toAddress, _amount);
    }
}
