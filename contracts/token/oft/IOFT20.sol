// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IOFT20Core.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @dev Interface of the OFT standard
 */
interface IOFT20 is IOFT20Core, IERC20 {

}
