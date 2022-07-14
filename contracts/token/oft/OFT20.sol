// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "./IOFT20.sol";
import "./OFT20Core.sol";

// override decimal() function is needed
contract OFT20 is OFT20Core, ERC20, IOFT20 {
    constructor(string memory _name, string memory _symbol, address _lzEndpoint) ERC20(_name, _symbol) OFT20Core(_lzEndpoint) {}

    function supportsInterface(bytes4 interfaceId) public view virtual override(OFT20Core, IERC165) returns (bool) {
        return interfaceId == type(IOFT20).interfaceId || interfaceId == type(IERC20).interfaceId || super.supportsInterface(interfaceId);
    }

    function circulatingSupply() public view virtual override returns (uint) {
        return totalSupply();
    }

    function _debitFrom(address _from, uint16, bytes memory, uint _amount) internal virtual override {
        address spender = _msgSender();
        if (_from != spender) _spendAllowance(_from, spender, _amount);
        _burn(_from, _amount);
    }

    function _creditTo(uint16, address _toAddress, uint _amount) internal virtual override {
        _mint(_toAddress, _amount);
    }
}
