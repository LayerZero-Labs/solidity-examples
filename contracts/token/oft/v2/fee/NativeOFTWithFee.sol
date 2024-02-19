// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./OFTWithFee.sol";

contract NativeOFTWithFee is OFTWithFee, ReentrancyGuard {
    uint public outboundAmount;

    event Deposit(address indexed _dst, uint _amount);
    event Withdrawal(address indexed _src, uint _amount);

    constructor(string memory _name, string memory _symbol, uint8 _sharedDecimals, address _lzEndpoint) OFTWithFee(_name, _symbol, _sharedDecimals, _lzEndpoint) {}

    function deposit() public payable {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint _amount) external nonReentrant {
        require(balanceOf(msg.sender) >= _amount, "NativeOFTWithFee: Insufficient balance.");
        _burn(msg.sender, _amount);
        (bool success, ) = msg.sender.call{value: _amount}("");
        require(success, "NativeOFTWithFee: failed to unwrap");
        emit Withdrawal(msg.sender, _amount);
    }

    /************************************************************************
    * public functions
    ************************************************************************/
    function sendFrom(address _from, uint16 _dstChainId, bytes32 _toAddress, uint _amount, uint _minAmount, LzCallParams calldata _callParams) public payable virtual override {
        _amount = _send(_from, _dstChainId, _toAddress, _amount, _callParams.refundAddress, _callParams.zroPaymentAddress, _callParams.adapterParams);
        require(_amount >= _minAmount, "NativeOFTWithFee: amount is less than minAmount");
    }

    function sendAndCall(address _from, uint16 _dstChainId, bytes32 _toAddress, uint _amount, uint _minAmount, bytes calldata _payload, uint64 _dstGasForCall, LzCallParams calldata _callParams) public payable virtual override {
        _amount = _sendAndCall(_from, _dstChainId, _toAddress, _amount, _payload, _dstGasForCall, _callParams.refundAddress, _callParams.zroPaymentAddress, _callParams.adapterParams);
        require(_amount >= _minAmount, "NativeOFTWithFee: amount is less than minAmount");
    }

    function _send(address _from, uint16 _dstChainId, bytes32 _toAddress, uint _amount, address payable _refundAddress, address _zroPaymentAddress, bytes memory _adapterParams) internal virtual override returns (uint amount) {
        _checkGasLimit(_dstChainId, PT_SEND, _adapterParams, NO_EXTRA_GAS);

        uint messageFee;
        (messageFee, amount) = _debitFromNative(_from, _amount, _dstChainId);

        bytes memory lzPayload = _encodeSendPayload(_toAddress, _ld2sd(amount));
        _lzSend(_dstChainId, lzPayload, _refundAddress, _zroPaymentAddress, _adapterParams, messageFee);

        emit SendToChain(_dstChainId, _from, _toAddress, amount);
    }

    function _sendAndCall(address _from, uint16 _dstChainId, bytes32 _toAddress, uint _amount, bytes memory _payload, uint64 _dstGasForCall, address payable _refundAddress, address _zroPaymentAddress, bytes memory _adapterParams) internal virtual override returns (uint amount) {
        _checkGasLimit(_dstChainId, PT_SEND_AND_CALL, _adapterParams, _dstGasForCall);

        uint messageFee;
        (messageFee, amount) = _debitFromNative(_from, _amount, _dstChainId);

        // encode the msg.sender into the payload instead of _from
        bytes memory lzPayload = _encodeSendAndCallPayload(msg.sender, _toAddress, _ld2sd(amount), _payload, _dstGasForCall);
        _lzSend(_dstChainId, lzPayload, _refundAddress, _zroPaymentAddress, _adapterParams, messageFee);

        emit SendToChain(_dstChainId, _from, _toAddress, amount);
    }

    function _debitFromNative(address _from, uint _amount, uint16 _dstChainId) internal returns (uint messageFee, uint amount) {
        uint fee = quoteOFTFee(_dstChainId, _amount);
        uint newMsgValue = msg.value;

        if(fee > 0) {
            // subtract fee from _amount
            _amount -= fee;

            // pay fee and update newMsgValue
            if(balanceOf(_from) >= fee) {
                _transferFrom(_from, feeOwner, fee);
            } else {
                _mint(feeOwner, fee);
                newMsgValue -= fee;
            }
        }

        (amount,) = _removeDust(_amount);
        require(amount > 0, "NativeOFTWithFee: amount too small");
        outboundAmount += amount;
        messageFee = msg.sender == _from ? _debitMsgSender(amount, newMsgValue) : _debitMsgFrom(_from, amount, newMsgValue);
    }

    function _debitMsgSender(uint _amount, uint currentMsgValue) internal returns (uint messageFee) {
        uint msgSenderBalance = balanceOf(msg.sender);

        if (msgSenderBalance < _amount) {
            require(msgSenderBalance + currentMsgValue >= _amount, "NativeOFTWithFee: Insufficient msg.value");

            // user can cover difference with additional msg.value ie. wrapping
            uint mintAmount = _amount - msgSenderBalance;

            _mint(address(msg.sender), mintAmount);

            // update the messageFee to take out mintAmount
            messageFee = currentMsgValue - mintAmount;
        } else {
            messageFee = currentMsgValue;
        }

        _transfer(msg.sender, address(this), _amount);
        return messageFee;
    }

    function _debitMsgFrom(address _from, uint _amount, uint currentMsgValue) internal returns (uint messageFee) {
        uint msgFromBalance = balanceOf(_from);

        if (msgFromBalance < _amount) {
            require(msgFromBalance + currentMsgValue >= _amount, "NativeOFTWithFee: Insufficient msg.value");

            // user can cover difference with additional msg.value ie. wrapping
            uint mintAmount = _amount - msgFromBalance;
            _mint(address(msg.sender), mintAmount);

            // transfer the differential amount to the contract
            _transfer(msg.sender, address(this), mintAmount);

            // overwrite the _amount to take the rest of the balance from the _from address
            _amount = msgFromBalance;

            // update the messageFee to take out mintAmount
            messageFee = currentMsgValue - mintAmount;
        } else {
            messageFee = currentMsgValue;
        }

        _spendAllowance(_from, msg.sender, _amount);
        _transfer(_from, address(this), _amount);
        return messageFee;
    }

    function _creditTo(uint16, address _toAddress, uint _amount) internal override returns(uint) {
        outboundAmount -= _amount;
        _burn(address(this), _amount);
        (bool success, ) = _toAddress.call{value: _amount}("");
        require(success, "NativeOFTWithFee: failed to _creditTo");
        return _amount;
    }

    receive() external payable {
        deposit();
    }
}