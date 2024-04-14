// SPDX-License-Identifier: MIT

pragma solidity >=0.5.0;

import "./IBaseOFTV2.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";

/**
 * @dev Interface of the IOFT core standard
 */
interface IOFTV2 is IBaseOFTV2, IERC20 {}
