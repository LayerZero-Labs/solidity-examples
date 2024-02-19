// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "../lzApp/NonblockingLzApp.sol";

///                        ┌─────────────┐               ┌──────────────────┐
///                        │             │               │                  │
///         L1             │  Contract   └───────────────►   AnyCallProxy   │
///                        │             ◄───────────────┐                  │
///                        └─────────────┘               └─────────┬───▲────┘
///                                                                │   │
///                                                                │   │
/// ───────────────────────────────────────────────────────────────┼───┼─────────────────────
///                                                                │   │
///                                                                │   │
///                        ┌─────────────┐                ┌────────▼───┴─────┐
///                        │             │                │                  │
///         L2             │  Contract   ◄────────────────┘   AnyCallProxy   │
///                        │             ┌────────────────►                  │
///                        └─────────────┘                └──────────────────┘

/// @title  AnyCallProxy
/// @notice A contract for sending and receiving message across chains using LayerZero's NonblockingLzApp.
contract AnyCallProxy is NonblockingLzApp {
    using BytesLib for bytes;

    event LogAnyCall(address indexed from, address indexed to, bytes data, uint16 indexed toChainID);
    event ReceiveFromChain(uint16 indexed _srcChainId, bytes _srcAddress, uint64 _nonce, address _contract, bytes _data);
    event Deposit(address indexed account, uint256 amount);
    event Withdrawl(address indexed account, uint256 amount);
    event SetBlacklist(address indexed account, bool flag);
    event SetWhitelist(address indexed from, address indexed to, uint16 indexed toChainID, bool flag);

    mapping(address => uint256) public executionBudget;
    mapping(address => bool) public blacklist;
    mapping(address => mapping(address => mapping(uint256 => bool))) public whitelist;

    constructor(address _endpoint) NonblockingLzApp(_endpoint) {
    }

    receive() external payable {}

    /**
    * @notice Submit a request for a cross chain interaction
    * @param _paymentAddress Payment address(if _paymentAddress ZERO address, payment current contract)
    * @param _to The target to interact with on `_toChainID`
    * @param _data The calldata supplied for the interaction with `_to`
    * @param _toChainID The target chain id to interact with
    */
    function anyCall(address _paymentAddress, address _to, bytes calldata _data, uint16 _toChainID, bytes calldata _adapterParams) external payable {
        require(!blacklist[msg.sender], "caller is blacklisted");
        require(whitelist[msg.sender][_to][_toChainID], "request denied");

        bytes memory payload = _encodePayload(_to, _data);
        uint _nativeFee = msg.value;
        address _refundAddress = _paymentAddress;
        if (_paymentAddress == address(0)) {
            (_nativeFee,) = lzEndpoint.estimateFees(_toChainID, address(this), payload, false, _adapterParams);
            require(address(this).balance >= _nativeFee, "Insufficient fee balance");
            _refundAddress = address(this);
        }

        _lzSend( // {value: messageFee} will be paid out of this contract!
            _toChainID, // destination chainId
            payload, // abi.encode()'ed bytes
            payable(_refundAddress), // (msg.sender will be this contract) refund address (LayerZero will refund any extra gas back to caller of send()
            address(0x0), // future param, unused for this example
            _adapterParams, // v1 adapterParams, specify custom destination gas qty
            _nativeFee
        );
        emit LogAnyCall(msg.sender, _to, _data, _toChainID);
    }

    /***
     * @notice gets a quote in source native gas, for the amount that send() requires to pay for message delivery
     * @param _to The target to interact with on `_toChainID`
     * @param _data The calldata supplied for the interaction with `_to`
     * @param _toChainID The target chain id to interact with
     * @param _adapterParam - parameters for the adapter service, e.g. send some dust native token to dstChain
     */
    function estimateFees(address _to, bytes calldata _data, uint16 _toChainID, bytes calldata _adapterParam) external view returns (uint nativeFee){
        bytes memory payload = _encodePayload(_to, _data);
        (nativeFee,) = lzEndpoint.estimateFees(_toChainID, address(this), payload, false, _adapterParam);
    }


    function _nonblockingLzReceive(uint16 _srcChainId, bytes memory _srcAddress, uint64 _nonce, bytes memory _payload) internal override {
        (address _contract, bytes memory _data) = _decodePayload(_payload);
        (bool ok,) = _contract.call(_data);
        require(ok, "call failed");
        emit ReceiveFromChain(_srcChainId, _srcAddress, _nonce, _contract, _data);
    }

    function _encodePayload(address _toAddress, bytes calldata _data) internal pure returns (bytes memory) {
        return abi.encodePacked(_toAddress, _data);
    }

    function _decodePayload(bytes memory _payload) internal pure returns (address to, bytes memory data) {
        to = _payload.toAddress(0);
        data = _payload.slice(20, _payload.length - 20);
    }

    /***
    * @notice Set the whitelist premitting an account to issue a cross chain request
    * @param _from The account which will submit cross chain interaction requests
    * @param _to The target of the cross chain interaction
    * @param _toChainID The target chain id
    */
    function setWhitelist(address _from, address _to, uint16 _toChainID, bool _flag) external onlyOwner {
        whitelist[_from][_to][_toChainID] = _flag;
        emit SetWhitelist(_from, _to, _toChainID, _flag);
    }

    /***
    * @notice Set an account's blacklist status
    * @dev A simpler way to deactive an account's permission to issue
    *     cross chain requests without updating the whitelist
    * @param _account The account to update blacklist status of
    * @param _flag The blacklist state to put `_account` in
     */
    function setBlacklist(address _account, bool _flag) external onlyOwner {
        blacklist[_account] = _flag;
        emit SetBlacklist(_account, _flag);
    }

    function withdraw(address toAddr) external onlyOwner {
        payable(toAddr).transfer(address(this).balance);
    }


}