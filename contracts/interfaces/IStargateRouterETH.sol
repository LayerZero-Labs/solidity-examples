// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;
pragma abicoder v2;

interface IStargateRouterETH {
    function addLiquidityETH() external payable;

    function swapETH(
        uint16 dstChainId,
        address payable refundAddress,
        bytes calldata to,
        uint256 amountLD,
        uint256 minAmountLD
    ) external payable;
}
