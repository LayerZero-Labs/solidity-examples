// SPDX-License-Identifier: MIT

pragma solidity >=0.5.0;

import "./ICommonOFT.sol";

/**
 * @dev Interface of the BaseIOFT core standard
 */
interface IBaseOFTV2 is ICommonOFT {

    /**
     * @dev send `_amount` amount of token to (`_dstChainId`, `_toAddress`) from `_from`
     * @param _from The owner of token
     * @param _dstChainId The destination chain identifier
     * @param _toAddress The address of receiver. It can be any size depending on the `dstChainId`.
     * @param _amount The quantity of tokens in wei
     * @param _refundAddress The address LayerZero refunds if too much message fee is sent
     * @param _zroPaymentAddress The address for zro payment. Set to address(0x0) if not paying in ZRO (LayerZero Token)
     * @param _adapterParams Flexible bytes array to indicate messaging adapter services
     */
    function sendFrom(address _from, uint16 _dstChainId, bytes32 _toAddress, uint _amount, LzCallParams calldata _callParams) external payable;

    function sendAndCall(address _from, uint16 _dstChainId, bytes32 _toAddress, uint _amount, bytes calldata _payload, uint64 _dstGasForCall, LzCallParams calldata _callParams) external payable;
}
