// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;
pragma abicoder v2;

import "../interfaces/ILayerZeroReceiver.sol";
import "../interfaces/ILayerZeroEndpoint.sol";
import "../libs/LzLib.sol";

/*
like a real LayerZero endpoint but can be mocked, which handle message transmission, verification, and receipt.
- blocking: LayerZero provides ordered delivery of messages from a given sender to a destination chain.
- non-reentrancy: endpoint has a non-reentrancy guard for both the send() and receive(), respectively.
- adapter parameters: allows UAs to add arbitrary transaction params in the send() function, like airdrop on destination chain.
unlike a real LayerZero endpoint, it is
- no messaging library versioning
- send() will short circuit to lzReceive()
- no user application configuration
*/
contract LZEndpointMock is ILayerZeroEndpoint {
    uint8 internal constant _NOT_ENTERED = 1;
    uint8 internal constant _ENTERED = 2;

    mapping(address => address) public lzEndpointLookup;

    uint16 public mockChainId;
    bool public nextMsgBlocked;

    // fee config
    RelayerFeeConfig public relayerFeeConfig;
    ProtocolFeeConfig public protocolFeeConfig;
    uint public oracleFee;
    bytes public defaultAdapterParams;

    // path = remote address + local address
    // inboundNonce = [srcChainId][path].
    mapping(uint16 => mapping(bytes => uint64)) public inboundNonce;
    //todo: this is a hack
    // outboundNonce = [dstChainId][srcAddress]
    mapping(uint16 => mapping(address => uint64)) public outboundNonce;
    //    // outboundNonce = [dstChainId][path].
    //    mapping(uint16 => mapping(bytes => uint64)) public outboundNonce;
    // storedPayload = [srcChainId][path]
    mapping(uint16 => mapping(bytes => StoredPayload)) public storedPayload;
    // msgToDeliver = [srcChainId][path]
    mapping(uint16 => mapping(bytes => QueuedPayload[])) public msgsToDeliver;

    // reentrancy guard
    uint8 internal _send_entered_state = 1;
    uint8 internal _receive_entered_state = 1;

    struct ProtocolFeeConfig {
        uint zroFee;
        uint nativeBP;
    }

    struct RelayerFeeConfig {
        uint128 dstPriceRatio; // 10^10
        uint128 dstGasPriceInWei;
        uint128 dstNativeAmtCap;
        uint64 baseGas;
        uint64 gasPerByte;
    }

    struct StoredPayload {
        uint64 payloadLength;
        address dstAddress;
        bytes32 payloadHash;
    }

    struct QueuedPayload {
        address dstAddress;
        uint64 nonce;
        bytes payload;
    }

    modifier sendNonReentrant() {
        require(_send_entered_state == _NOT_ENTERED, "LayerZeroMock: no send reentrancy");
        _send_entered_state = _ENTERED;
        _;
        _send_entered_state = _NOT_ENTERED;
    }

    modifier receiveNonReentrant() {
        require(_receive_entered_state == _NOT_ENTERED, "LayerZeroMock: no receive reentrancy");
        _receive_entered_state = _ENTERED;
        _;
        _receive_entered_state = _NOT_ENTERED;
    }

    event UaForceResumeReceive(uint16 chainId, bytes srcAddress);
    event PayloadCleared(uint16 srcChainId, bytes srcAddress, uint64 nonce, address dstAddress);
    event PayloadStored(uint16 srcChainId, bytes srcAddress, address dstAddress, uint64 nonce, bytes payload, bytes reason);
    event ValueTransferFailed(address indexed to, uint indexed quantity);

    constructor(uint16 _chainId) {
        mockChainId = _chainId;

        // init config
        relayerFeeConfig = RelayerFeeConfig({
            dstPriceRatio: 1e10, // 1:1, same chain, same native coin
            dstGasPriceInWei: 1e10,
            dstNativeAmtCap: 1e19,
            baseGas: 100,
            gasPerByte: 1
        });
        protocolFeeConfig = ProtocolFeeConfig({zroFee: 1e18, nativeBP: 1000}); // BP 0.1
        oracleFee = 1e16;
        defaultAdapterParams = LzLib.buildDefaultAdapterParams(200000);
    }

    // ------------------------------ ILayerZeroEndpoint Functions ------------------------------
    function send(
        uint16 _chainId,
        bytes memory _path,
        bytes calldata _payload,
        address payable _refundAddress,
        address _zroPaymentAddress,
        bytes memory _adapterParams
    ) external payable override sendNonReentrant {
        require(_path.length == 40, "LayerZeroMock: incorrect remote address size"); // only support evm chains

        address dstAddr;
        assembly {
            dstAddr := mload(add(_path, 20))
        }

        address lzEndpoint = lzEndpointLookup[dstAddr];
        require(lzEndpoint != address(0), "LayerZeroMock: destination LayerZero Endpoint not found");

        // not handle zro token
        bytes memory adapterParams = _adapterParams.length > 0 ? _adapterParams : defaultAdapterParams;
        (uint nativeFee, ) = estimateFees(_chainId, msg.sender, _payload, _zroPaymentAddress != address(0x0), adapterParams);
        require(msg.value >= nativeFee, "LayerZeroMock: not enough native for fees");

        uint64 nonce = ++outboundNonce[_chainId][msg.sender];

        // refund if they send too much
        uint amount = msg.value - nativeFee;
        if (amount > 0) {
            (bool success, ) = _refundAddress.call{value: amount}("");
            require(success, "LayerZeroMock: failed to refund");
        }

        // Mock the process of receiving msg on dst chain
        // Mock the relayer paying the dstNativeAddr the amount of extra native token
        (, uint extraGas, uint dstNativeAmt, address payable dstNativeAddr) = LzLib.decodeAdapterParams(adapterParams);
        if (dstNativeAmt > 0) {
            (bool success, ) = dstNativeAddr.call{value: dstNativeAmt}("");
            if (!success) {
                emit ValueTransferFailed(dstNativeAddr, dstNativeAmt);
            }
        }

        bytes memory srcUaAddress = abi.encodePacked(msg.sender, dstAddr); // cast this address to bytes
        bytes memory payload = _payload;
        LZEndpointMock(lzEndpoint).receivePayload(mockChainId, srcUaAddress, dstAddr, nonce, extraGas, payload);
    }

    function receivePayload(
        uint16 _srcChainId,
        bytes calldata _path,
        address _dstAddress,
        uint64 _nonce,
        uint _gasLimit,
        bytes calldata _payload
    ) external override receiveNonReentrant {
        StoredPayload storage sp = storedPayload[_srcChainId][_path];

        // assert and increment the nonce. no message shuffling
        require(_nonce == ++inboundNonce[_srcChainId][_path], "LayerZeroMock: wrong nonce");

        // queue the following msgs inside of a stack to simulate a successful send on src, but not fully delivered on dst
        if (sp.payloadHash != bytes32(0)) {
            QueuedPayload[] storage msgs = msgsToDeliver[_srcChainId][_path];
            QueuedPayload memory newMsg = QueuedPayload(_dstAddress, _nonce, _payload);

            // warning, might run into gas issues trying to forward through a bunch of queued msgs
            // shift all the msgs over so we can treat this like a fifo via array.pop()
            if (msgs.length > 0) {
                // extend the array
                msgs.push(newMsg);

                // shift all the indexes up for pop()
                for (uint i = 0; i < msgs.length - 1; i++) {
                    msgs[i + 1] = msgs[i];
                }

                // put the newMsg at the bottom of the stack
                msgs[0] = newMsg;
            } else {
                msgs.push(newMsg);
            }
        } else if (nextMsgBlocked) {
            storedPayload[_srcChainId][_path] = StoredPayload(uint64(_payload.length), _dstAddress, keccak256(_payload));
            emit PayloadStored(_srcChainId, _path, _dstAddress, _nonce, _payload, bytes(""));
            // ensure the next msgs that go through are no longer blocked
            nextMsgBlocked = false;
        } else {
            try ILayerZeroReceiver(_dstAddress).lzReceive{gas: _gasLimit}(_srcChainId, _path, _nonce, _payload) {} catch (bytes memory reason) {
                storedPayload[_srcChainId][_path] = StoredPayload(uint64(_payload.length), _dstAddress, keccak256(_payload));
                emit PayloadStored(_srcChainId, _path, _dstAddress, _nonce, _payload, reason);
                // ensure the next msgs that go through are no longer blocked
                nextMsgBlocked = false;
            }
        }
    }

    function getInboundNonce(uint16 _chainID, bytes calldata _path) external view override returns (uint64) {
        return inboundNonce[_chainID][_path];
    }

    function getOutboundNonce(uint16 _chainID, address _srcAddress) external view override returns (uint64) {
        return outboundNonce[_chainID][_srcAddress];
    }

    function estimateFees(
        uint16 _dstChainId,
        address _userApplication,
        bytes memory _payload,
        bool _payInZRO,
        bytes memory _adapterParams
    ) public view override returns (uint nativeFee, uint zroFee) {
        bytes memory adapterParams = _adapterParams.length > 0 ? _adapterParams : defaultAdapterParams;

        // Relayer Fee
        uint relayerFee = _getRelayerFee(_dstChainId, 1, _userApplication, _payload.length, adapterParams);

        // LayerZero Fee
        uint protocolFee = _getProtocolFees(_payInZRO, relayerFee, oracleFee);
        _payInZRO ? zroFee = protocolFee : nativeFee = protocolFee;

        // return the sum of fees
        nativeFee = nativeFee + relayerFee + oracleFee;
    }

    function getChainId() external view override returns (uint16) {
        return mockChainId;
    }

    function retryPayload(
        uint16 _srcChainId,
        bytes calldata _path,
        bytes calldata _payload
    ) external override {
        StoredPayload storage sp = storedPayload[_srcChainId][_path];
        require(sp.payloadHash != bytes32(0), "LayerZeroMock: no stored payload");
        require(_payload.length == sp.payloadLength && keccak256(_payload) == sp.payloadHash, "LayerZeroMock: invalid payload");

        address dstAddress = sp.dstAddress;
        // empty the storedPayload
        sp.payloadLength = 0;
        sp.dstAddress = address(0);
        sp.payloadHash = bytes32(0);

        uint64 nonce = inboundNonce[_srcChainId][_path];

        ILayerZeroReceiver(dstAddress).lzReceive(_srcChainId, _path, nonce, _payload);
        emit PayloadCleared(_srcChainId, _path, nonce, dstAddress);
    }

    function hasStoredPayload(uint16 _srcChainId, bytes calldata _path) external view override returns (bool) {
        StoredPayload storage sp = storedPayload[_srcChainId][_path];
        return sp.payloadHash != bytes32(0);
    }

    function getSendLibraryAddress(address) external view override returns (address) {
        return address(this);
    }

    function getReceiveLibraryAddress(address) external view override returns (address) {
        return address(this);
    }

    function isSendingPayload() external view override returns (bool) {
        return _send_entered_state == _ENTERED;
    }

    function isReceivingPayload() external view override returns (bool) {
        return _receive_entered_state == _ENTERED;
    }

    function getConfig(
        uint16, /*_version*/
        uint16, /*_chainId*/
        address, /*_ua*/
        uint /*_configType*/
    ) external pure override returns (bytes memory) {
        return "";
    }

    function getSendVersion(
        address /*_userApplication*/
    ) external pure override returns (uint16) {
        return 1;
    }

    function getReceiveVersion(
        address /*_userApplication*/
    ) external pure override returns (uint16) {
        return 1;
    }

    function setConfig(
        uint16, /*_version*/
        uint16, /*_chainId*/
        uint, /*_configType*/
        bytes memory /*_config*/
    ) external override {}

    function setSendVersion(
        uint16 /*version*/
    ) external override {}

    function setReceiveVersion(
        uint16 /*version*/
    ) external override {}

    function forceResumeReceive(uint16 _srcChainId, bytes calldata _path) external override {
        StoredPayload storage sp = storedPayload[_srcChainId][_path];
        // revert if no messages are cached. safeguard malicious UA behaviour
        require(sp.payloadHash != bytes32(0), "LayerZeroMock: no stored payload");
        require(sp.dstAddress == msg.sender, "LayerZeroMock: invalid caller");

        // empty the storedPayload
        sp.payloadLength = 0;
        sp.dstAddress = address(0);
        sp.payloadHash = bytes32(0);

        emit UaForceResumeReceive(_srcChainId, _path);

        // resume the receiving of msgs after we force clear the "stuck" msg
        _clearMsgQue(_srcChainId, _path);
    }

    // ------------------------------ Other Public/External Functions --------------------------------------------------

    function getLengthOfQueue(uint16 _srcChainId, bytes calldata _srcAddress) external view returns (uint) {
        return msgsToDeliver[_srcChainId][_srcAddress].length;
    }

    // used to simulate messages received get stored as a payload
    function blockNextMsg() external {
        nextMsgBlocked = true;
    }

    function setDestLzEndpoint(address destAddr, address lzEndpointAddr) external {
        lzEndpointLookup[destAddr] = lzEndpointAddr;
    }

    function setRelayerPrice(
        uint128 _dstPriceRatio,
        uint128 _dstGasPriceInWei,
        uint128 _dstNativeAmtCap,
        uint64 _baseGas,
        uint64 _gasPerByte
    ) external {
        relayerFeeConfig.dstPriceRatio = _dstPriceRatio;
        relayerFeeConfig.dstGasPriceInWei = _dstGasPriceInWei;
        relayerFeeConfig.dstNativeAmtCap = _dstNativeAmtCap;
        relayerFeeConfig.baseGas = _baseGas;
        relayerFeeConfig.gasPerByte = _gasPerByte;
    }

    function setProtocolFee(uint _zroFee, uint _nativeBP) external {
        protocolFeeConfig.zroFee = _zroFee;
        protocolFeeConfig.nativeBP = _nativeBP;
    }

    function setOracleFee(uint _oracleFee) external {
        oracleFee = _oracleFee;
    }

    function setDefaultAdapterParams(bytes memory _adapterParams) external {
        defaultAdapterParams = _adapterParams;
    }

    // --------------------- Internal Functions ---------------------
    // simulates the relayer pushing through the rest of the msgs that got delayed due to the stored payload
    function _clearMsgQue(uint16 _srcChainId, bytes calldata _path) internal {
        QueuedPayload[] storage msgs = msgsToDeliver[_srcChainId][_path];

        // warning, might run into gas issues trying to forward through a bunch of queued msgs
        while (msgs.length > 0) {
            QueuedPayload memory payload = msgs[msgs.length - 1];
            ILayerZeroReceiver(payload.dstAddress).lzReceive(_srcChainId, _path, payload.nonce, payload.payload);
            msgs.pop();
        }
    }

    function _getProtocolFees(
        bool _payInZro,
        uint _relayerFee,
        uint _oracleFee
    ) internal view returns (uint) {
        if (_payInZro) {
            return protocolFeeConfig.zroFee;
        } else {
            return ((_relayerFee + _oracleFee) * protocolFeeConfig.nativeBP) / 10000;
        }
    }

    function _getRelayerFee(
        uint16, /* _dstChainId */
        uint16, /* _outboundProofType */
        address, /* _userApplication */
        uint _payloadSize,
        bytes memory _adapterParams
    ) internal view returns (uint) {
        (uint16 txType, uint extraGas, uint dstNativeAmt, ) = LzLib.decodeAdapterParams(_adapterParams);
        uint totalRemoteToken; // = baseGas + extraGas + requiredNativeAmount
        if (txType == 2) {
            require(relayerFeeConfig.dstNativeAmtCap >= dstNativeAmt, "LayerZeroMock: dstNativeAmt too large ");
            totalRemoteToken += dstNativeAmt;
        }
        // remoteGasTotal = dstGasPriceInWei * (baseGas + extraGas)
        uint remoteGasTotal = relayerFeeConfig.dstGasPriceInWei * (relayerFeeConfig.baseGas + extraGas);
        totalRemoteToken += remoteGasTotal;

        // tokenConversionRate = dstPrice / localPrice
        // basePrice = totalRemoteToken * tokenConversionRate
        uint basePrice = (totalRemoteToken * relayerFeeConfig.dstPriceRatio) / 10**10;

        // pricePerByte = (dstGasPriceInWei * gasPerBytes) * tokenConversionRate
        uint pricePerByte = (relayerFeeConfig.dstGasPriceInWei * relayerFeeConfig.gasPerByte * relayerFeeConfig.dstPriceRatio) / 10**10;

        return basePrice + _payloadSize * pricePerByte;
    }
}
