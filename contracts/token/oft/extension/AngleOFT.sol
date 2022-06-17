// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../OFT.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../../interfaces/IAngleToken.sol";

contract AngleOFT is OFT, Pausable {
    using SafeERC20 for IERC20;

    address public underlyingToken;

    constructor(string memory _name, string memory _symbol, address _lzEndpoint, address _underlyingToken) OFT(_name, _symbol, _lzEndpoint) {
        underlyingToken = _underlyingToken;
    }

    function setupAllowance() external onlyOwner {
        _approve(address(this),address(underlyingToken), type(uint256).max);
    }

    function pauseSendTokens(bool pause) external onlyOwner {
        pause ? _pause() : _unpause();
    }

    function _debitFrom(address _from, uint16, bytes memory, uint _amount) internal override whenNotPaused returns(uint256) {
        address spender = _msgSender();
        // Otherwise a simple allowance for the canonical token to this address could be exploited
        if (_from != spender) _spendAllowance(_from, spender, _amount);
        address _underlyingToken = underlyingToken;
        IERC20(_underlyingToken).safeTransferFrom(_from, address(this), _amount);
        uint256 amountSwapped = IAngleToken(address(_underlyingToken)).swapOut(address(this), _amount, address(this));
        _burn(address(this), amountSwapped);
        return amountSwapped;
    }

    function _creditTo(uint16, address _toAddress, uint _amount) internal override whenNotPaused returns(uint256) {
        _mint(address(this), _amount);
        uint256 amountMinted = IAngleToken(underlyingToken).swapIn(address(this), _amount, _toAddress);
        return amountMinted;
    }
}
