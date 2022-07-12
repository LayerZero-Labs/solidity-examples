// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IOFT20CoreUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "../../lzApp/NonblockingLzAppUpgradeable.sol";

abstract contract OFT20CoreUpgradeable is Initializable, NonblockingLzAppUpgradeable, ERC165Upgradeable, IOFT20CoreUpgradeable {

    uint public constant NO_EXTRA_GAS = 0;
    uint public constant FUNCTION_TYPE_SEND = 1;
    bool public useCustomAdapterParams;

    function __OFT20CoreUpgradeable_init(address _endpoint) internal onlyInitializing {
        __OFT20CoreUpgradeable_init_unchained(_endpoint);
    }

    function __OFT20CoreUpgradeable_init_unchained(address _endpoint) internal onlyInitializing {
        __NonblockingLzAppUpgradeable_init_unchained(_endpoint);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165Upgradeable, IERC165Upgradeable) returns (bool) {
        return interfaceId == type(IOFT20CoreUpgradeable).interfaceId || super.supportsInterface(interfaceId);
    }

    function estimateSendFee(uint16 _dstChainId, bytes memory _toAddress, uint _amount, bool _useZro, bytes memory _adapterParams) public view virtual override returns (uint nativeFee, uint zroFee) {
        // mock the payload for send()
        bytes memory payload = abi.encode(_toAddress, _amount);
        return lzEndpoint.estimateFees(_dstChainId, address(this), payload, _useZro, _adapterParams);
    }

    function sendFrom(address _from, uint16 _dstChainId, bytes memory _toAddress, uint _amount, address payable _refundAddress, address _zroPaymentAddress, bytes memory _adapterParams) public payable virtual override {
        _send(_from, _dstChainId, _toAddress, _amount, _refundAddress, _zroPaymentAddress, _adapterParams);
    }

    function _nonblockingLzReceive(uint16 _srcChainId, bytes memory _srcAddress, uint64 _nonce, bytes memory _payload) internal virtual override {
        // decode and load the toAddress
        (bytes memory toAddressBytes, uint amount) = abi.decode(_payload, (bytes, uint));
        address toAddress;
        assembly {
            toAddress := mload(add(toAddressBytes, 20))
        }

        _creditTo(_srcChainId, toAddress, amount);

        emit ReceiveFromChain(_srcChainId, _srcAddress, toAddress, amount, _nonce);
    }

    function _send(address _from, uint16 _dstChainId, bytes memory _toAddress, uint _amount, address payable _refundAddress, address _zroPaymentAddress, bytes memory _adapterParams) internal virtual {
        _debitFrom(_from, _dstChainId, _toAddress, _amount);

        bytes memory payload = abi.encode(_toAddress, _amount);
        if(useCustomAdapterParams) {
            _checkGasLimit(_dstChainId, FUNCTION_TYPE_SEND, _adapterParams, NO_EXTRA_GAS);
        } else {
            require(_adapterParams.length == 0, "LzApp: _adapterParams must be empty.");
        }
        _lzSend(_dstChainId, payload, _refundAddress, _zroPaymentAddress, _adapterParams);

        uint64 nonce = lzEndpoint.getOutboundNonce(_dstChainId, address(this));
        emit SendToChain(_from, _dstChainId, _toAddress, _amount, nonce);
    }

    function setUseCustomAdapterParams(bool _useCustomAdapterParams) external onlyOwner {
        useCustomAdapterParams = _useCustomAdapterParams;
    }

    function _debitFrom(address _from, uint16 _dstChainId, bytes memory _toAddress, uint _amount) internal virtual;

    function _creditTo(uint16 _srcChainId, address _toAddress, uint _amount) internal virtual;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
