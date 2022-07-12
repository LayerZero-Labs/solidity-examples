// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library LzLib {
    function getGasLimit(bytes memory _adapterParams) internal pure returns (uint gasLimit) {
        assembly {
            gasLimit := mload(add(_adapterParams, 34))
        }
    }
}