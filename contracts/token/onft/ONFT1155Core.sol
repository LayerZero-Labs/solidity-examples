// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IONFT1155Core.sol";
import "../../lzApp/NonblockingLzApp.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

abstract contract ONFT1155Core is NonblockingLzApp, ERC165, IONFT1155Core {

    uint public constant NO_EXTRA_GAS = 0;
    uint public constant FUNCTION_TYPE_SEND = 1;
    uint public constant FUNCTION_TYPE_SEND_BATCH = 2;
    bool public useCustomAdapterParams;

    constructor(address _lzEndpoint) NonblockingLzApp(_lzEndpoint) {}

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IONFT1155Core).interfaceId || super.supportsInterface(interfaceId);
    }

    function estimateSendFee(uint16 _dstChainId, bytes memory _toAddress, uint _tokenId, uint _amount, bool _useZro, bytes memory _adapterParams) public view virtual override returns (uint nativeFee, uint zroFee) {
        return estimateSendBatchFee(_dstChainId, _toAddress, _toSingletonArray(_tokenId), _toSingletonArray(_amount), _useZro, _adapterParams);
    }

    function estimateSendBatchFee(uint16 _dstChainId, bytes memory _toAddress, uint[] memory _tokenIds, uint[] memory _amounts, bool _useZro, bytes memory _adapterParams) public view virtual override returns (uint nativeFee, uint zroFee) {
        bytes memory payload = abi.encode(_toAddress, _tokenIds, _amounts);
        return lzEndpoint.estimateFees(_dstChainId, address(this), payload, _useZro, _adapterParams);
    }

    function sendFrom(address _from, uint16 _dstChainId, bytes memory _toAddress, uint _tokenId, uint _amount, address payable _refundAddress, address _zroPaymentAddress, bytes memory _adapterParams) public payable virtual override {
        _sendBatch(_from, _dstChainId, _toAddress, _toSingletonArray(_tokenId), _toSingletonArray(_amount), _refundAddress, _zroPaymentAddress, _adapterParams);
    }

    function sendBatchFrom(address _from, uint16 _dstChainId, bytes memory _toAddress, uint[] memory _tokenIds, uint[] memory _amounts, address payable _refundAddress, address _zroPaymentAddress, bytes memory _adapterParams) public payable virtual override {
        _sendBatch(_from, _dstChainId, _toAddress, _tokenIds, _amounts, _refundAddress, _zroPaymentAddress, _adapterParams);
    }

    function _sendBatch(address _from, uint16 _dstChainId, bytes memory _toAddress, uint[] memory _tokenIds, uint[] memory _amounts, address payable _refundAddress, address _zroPaymentAddress, bytes memory _adapterParams) internal virtual {
        _debitFrom(_from, _dstChainId, _toAddress, _tokenIds, _amounts);
        bytes memory payload = abi.encode(_toAddress, _tokenIds, _amounts);
        if (_tokenIds.length == 1) {
            if(useCustomAdapterParams) {
                _checkGasLimit(_dstChainId, FUNCTION_TYPE_SEND, _adapterParams, NO_EXTRA_GAS);
            } else {
                require(_adapterParams.length == 0, "LzApp: _adapterParams must be empty.");
            }
            _lzSend(_dstChainId, payload, _refundAddress, _zroPaymentAddress, _adapterParams);
            emit SendToChain(_dstChainId, _from, _toAddress, _tokenIds[0], _amounts[0]);
        } else if (_tokenIds.length > 1) {
            if(useCustomAdapterParams) {
                _checkGasLimit(_dstChainId, FUNCTION_TYPE_SEND_BATCH, _adapterParams, NO_EXTRA_GAS);
            } else {
                require(_adapterParams.length == 0, "LzApp: _adapterParams must be empty.");
            }
            _lzSend(_dstChainId, payload, _refundAddress, _zroPaymentAddress, _adapterParams);
            emit SendBatchToChain(_dstChainId, _from, _toAddress, _tokenIds, _amounts);
        }
    }

    function _nonblockingLzReceive(uint16 _srcChainId, bytes memory _srcAddress, uint64 /*_nonce*/, bytes memory _payload) internal virtual override {
        // decode and load the toAddress
        (bytes memory toAddressBytes, uint[] memory tokenIds, uint[] memory amounts) = abi.decode(_payload, (bytes, uint[], uint[]));
        address toAddress;
        assembly {
            toAddress := mload(add(toAddressBytes, 20))
        }

        _creditTo(_srcChainId, toAddress, tokenIds, amounts);

        if (tokenIds.length == 1) {
            emit ReceiveFromChain(_srcChainId, _srcAddress, toAddress, tokenIds[0], amounts[0]);
        } else if (tokenIds.length > 1) {
            emit ReceiveBatchFromChain(_srcChainId, _srcAddress, toAddress, tokenIds, amounts);
        }
    }

    function setUseCustomAdapterParams(bool _useCustomAdapterParams) external onlyOwner {
        useCustomAdapterParams = _useCustomAdapterParams;
    }

    function _debitFrom(address _from, uint16 _dstChainId, bytes memory _toAddress, uint[] memory _tokenIds, uint[] memory _amounts) internal virtual;

    function _creditTo(uint16 _srcChainId, address _toAddress, uint[] memory _tokenIds, uint[] memory _amounts) internal virtual;

    function _toSingletonArray(uint element) internal pure returns (uint[] memory) {
        uint[] memory array = new uint[](1);
        array[0] = element;
        return array;
    }
}
