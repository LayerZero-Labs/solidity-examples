// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../OFT20Core.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ProxyOFT20 is OFT20Core {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;

    constructor(address _lzEndpoint, address _proxyToken) OFT20Core(_lzEndpoint) {
        token = IERC20(_proxyToken);
    }

    function circulatingSupply() public view virtual override returns (uint) {
        unchecked {
            return token.totalSupply() - token.balanceOf(address(this));
        }
    }

    function _debitFrom(address _from, uint16, bytes memory, uint _amount) internal virtual override {
        require(_from == _msgSender(), "ProxyOFT: owner is not send caller");
        token.safeTransferFrom(_from, address(this), _amount);
    }

    function _creditTo(uint16, address _toAddress, uint _amount) internal virtual override {
        token.safeTransfer(_toAddress, _amount);
    }
}
