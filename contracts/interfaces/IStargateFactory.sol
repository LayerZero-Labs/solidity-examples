// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.4;

import "./IStargatePool.sol";

interface IStargateFactory {
    function getPool(uint256 _srcPoolId) external returns (IStargatePool);
}
