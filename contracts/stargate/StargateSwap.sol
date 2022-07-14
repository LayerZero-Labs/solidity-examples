// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IStargateRouter.sol";
import "../interfaces/IStargateReceiver.sol";

contract StargateSwap is IStargateReceiver {
    address public stargateRouter;      // an IStargateRouter instance

    event ReceivedOnDestination(address token, uint qty);

    constructor(address _stargateRouter) {
        stargateRouter = _stargateRouter;
    }

    //-----------------------------------------------------------------------------------------------------------------------
    // swap tokens to another chain
    function swap(
        uint qty,
        address bridgeToken,                    // the address of the native ERC20 to swap() - *must* be the token for the poolId
        uint16 dstChainId,                      // Stargate/LayerZero chainId
        uint16 srcPoolId,                       // stargate poolId - *must* be the poolId for the qty asset
        uint16 dstPoolId,                       // stargate destination poolId
        address to,                             // the address to send the destination tokens to
        uint /*deadline*/,                          // overall deadline
        address destStargateComposed            // destination contract. it must implement sgReceive()
    ) external payable {
        require(msg.value > 0, "stargate requires a msg.value to pay crosschain message");
        require(qty > 0, 'error: swap() requires qty > 0');

        // encode payload data to send to destination contract, which it will handle with sgReceive()
        bytes memory data = abi.encode(to);

        // this contract calls stargate swap()
        IERC20(bridgeToken).transferFrom(msg.sender, address(this), qty);
        IERC20(bridgeToken).approve(address(stargateRouter), qty);

        // Stargate's Router.swap() function sends the tokens to the destination chain.
        IStargateRouter(stargateRouter).swap{value:msg.value}(
            dstChainId,                                     // the destination chain id
            srcPoolId,                                      // the source Stargate poolId
            dstPoolId,                                      // the destination Stargate poolId
            payable(msg.sender),                            // refund adddress. if msg.sender pays too much gas, return extra eth
            qty,                                            // total tokens to send to destination chain
            0,                                              // min amount allowed out
            IStargateRouter.lzTxObj(200000, 0, "0x"),       // default lzTxObj
            abi.encodePacked(destStargateComposed),         // destination address, the sgReceive() implementer
            data                                            // bytes payload
        );
    }

    //-----------------------------------------------------------------------------------------------------------------------
    // sgReceive() - the destination contract must implement this function to receive the tokens and payload
    function sgReceive(uint16 /*_chainId*/, bytes memory /*_srcAddress*/, uint /*_nonce*/, address _token, uint amountLD, bytes memory _payload) override external {
        require(msg.sender == address(stargateRouter), "only stargate router can call sgReceive!");
        (address _toAddr) = abi.decode(_payload, (address));
        // send transfer _token/amountLD to _toAddr
        IERC20(_token).transfer(_toAddr, amountLD);
        emit ReceivedOnDestination(_token, amountLD);
    }

}