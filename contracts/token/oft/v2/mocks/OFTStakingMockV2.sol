// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IBaseOFTV2.sol";
import "../interfaces/IOFTReceiverV2.sol";
import "../../../../libraries/BytesLib.sol";

// OFTStakingMock is an example to integrate with OFT. It shows how to send OFT cross chain with a custom payload and
// call a receiver contract on the destination chain when oft is received.
contract OFTStakingMockV2 is IOFTReceiverV2 {
    using SafeERC20 for IERC20;
    using BytesLib for bytes;

    uint64 public constant DST_GAS_FOR_CALL = 300000; // estimate gas usage of onOFTReceived()

    // packet type
    uint8 public constant PT_DEPOSIT_TO_REMOTE_CHAIN = 1;
    // ... other types

    // variables
    IBaseOFTV2 public oft;
    mapping(uint16 => bytes32) public remoteStakingContracts;
    mapping(address => uint) public balances;
    bool public paused; // for testing try/catch

    event Deposit(address from, uint amount);
    event Withdrawal(address to, uint amount);
    event DepositToDstChain(address from, uint16 dstChainId, bytes to, uint amountOut);

    // _oft can be any composable OFT contract, e.g. ComposableOFT, ComposableBasedOFT and ComposableProxyOFT.
    constructor(address _oft) {
        oft = IBaseOFTV2(_oft);
        IERC20(oft.token()).safeApprove(_oft, type(uint).max);
    }

    function setRemoteStakingContract(uint16 _chainId, bytes32 _stakingContract) external {
        remoteStakingContracts[_chainId] = _stakingContract;
    }

    function deposit(uint _amount) external payable {
        IERC20(oft.token()).safeTransferFrom(msg.sender, address(this), _amount);
        balances[msg.sender] += _amount;
        emit Deposit(msg.sender, _amount);
    }

    function withdraw(uint _amount) external {
        withdrawTo(_amount, msg.sender);
    }

    function withdrawTo(uint _amount, address _to) public {
        require(balances[msg.sender] >= _amount);
        balances[msg.sender] -= _amount;
        IERC20(oft.token()).safeTransfer(_to, _amount);
        emit Withdrawal(msg.sender, _amount);
    }

    function depositToDstChain(
        uint16 _dstChainId,
        bytes calldata _to, // address of the owner of token on the destination chain
        uint _amount, // amount of token to deposit
        bytes calldata _adapterParams
    ) external payable {
        bytes32 dstStakingContract = remoteStakingContracts[_dstChainId];
        require(dstStakingContract != bytes32(0), "invalid _dstChainId");

        // transfer token from sender to this contract
        // if the oft is not the proxy oft, dont need to transfer token to this contract
        // and call sendAndCall() with the msg.sender (_from) instead of address(this)
        // here we use a common pattern to be compatible with all kinds of composable OFT
        IERC20(oft.token()).safeTransferFrom(msg.sender, address(this), _amount);

        bytes memory payload = abi.encode(PT_DEPOSIT_TO_REMOTE_CHAIN, _to);
        ICommonOFT.LzCallParams memory callParams = ICommonOFT.LzCallParams(payable(msg.sender), address(0), _adapterParams);
        oft.sendAndCall{value: msg.value}(address(this), _dstChainId, dstStakingContract, _amount, payload, DST_GAS_FOR_CALL, callParams);

        emit DepositToDstChain(msg.sender, _dstChainId, _to, _amount);
    }

    function quoteForDeposit(
        uint16 _dstChainId,
        bytes calldata _to, // address of the owner of token on the destination chain
        uint _amount, // amount of token to deposit
        bytes calldata _adapterParams
    ) public view returns (uint nativeFee, uint zroFee) {
        bytes32 dstStakingContract = remoteStakingContracts[_dstChainId];
        require(dstStakingContract != bytes32(0), "invalid _dstChainId");

        bytes memory payload = abi.encode(PT_DEPOSIT_TO_REMOTE_CHAIN, _to);
        return oft.estimateSendAndCallFee(_dstChainId, dstStakingContract, _amount, payload, DST_GAS_FOR_CALL, false, _adapterParams);
    }

    //-----------------------------------------------------------------------------------------------------------------------
    function onOFTReceived(uint16 _srcChainId, bytes calldata, uint64, bytes32 _from, uint _amount, bytes memory _payload) external override {
        require(!paused, "paused"); // for testing safe call
        require(msg.sender == address(oft), "only oft can call onOFTReceived()");
        require(_from == remoteStakingContracts[_srcChainId], "invalid from");

        uint8 pkType;
        assembly {
            pkType := mload(add(_payload, 32))
        }

        if (pkType == PT_DEPOSIT_TO_REMOTE_CHAIN) {
            (, bytes memory toAddrBytes) = abi.decode(_payload, (uint8, bytes));

            address to = toAddrBytes.toAddress(0);
            balances[to] += _amount;
        } else {
            revert("invalid deposit type");
        }
    }

    function setPaused(bool _paused) external {
        paused = _paused;
    }
}
