// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;
pragma abicoder v2;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
//import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "./interfaces/IStargateRouter.sol";
import "./interfaces/IStargateReceiver.sol";

contract StargateComposed is IStargateReceiver {
    using SafeMath for uint;
    address public stargateRouter;      // an IStargateRouter instance
    address public ammRouter;           // an IUniswapV2Router02 instance

    // special token value that indicates the sgReceive() should swap OUT native asset
    address public OUT_TO_NATIVE = 0x0000000000000000000000000000000000000000;
    event ReceivedOnDestination(address token, uint qty);

    constructor(address _stargateRouter, address _ammRouter) {
        stargateRouter = _stargateRouter;
        ammRouter = _ammRouter;
    }

    //-----------------------------------------------------------------------------------------------------------------------
    // 1. swap native on source chain to native on destination chain (!)
    function swapNativeForNative(
        uint16 dstChainId,                      // Stargate/LayerZero chainId
        address bridgeToken,                    // the address of the native ERC20 to swap() - *must* be the token for the poolId
        uint16 srcPoolId,                       // stargate poolId - *must* be the poolId for the bridgeToken asset
        uint16 dstPoolId,                       // stargate destination poolId
        uint nativeAmountIn,                    // exact amount of native token coming in on source
        address to,                             // the address to send the destination tokens to
        uint amountOutMin,                      // minimum amount of stargatePoolId token to get out of amm router
        uint amountOutMinSg,                    // minimum amount of stargatePoolId token to get out on destination chain
        uint amountOutMinDest,                  // minimum amount of native token to receive on destination
        uint deadline,                          // overall deadline
        address destStargateComposed            // destination contract. it must implement sgReceive()
    ) external payable {

        require(nativeAmountIn > 0, "nativeAmountIn must be greater than 0");
        require(msg.value.sub(nativeAmountIn) > 0, "stargate requires fee to pay crosschain message");

        uint bridgeAmount;
        // using the amm router, swap native into the Stargate pool token, sending the output token to this contract
        {
            // create path[] for amm swap
            address[] memory path = new address[](2);
            path[0] = IUniswapV2Router02(ammRouter).WETH();    // native IN requires that we specify the WETH in path[0]
            path[1] = bridgeToken;                             // the bridge token,

            uint[] memory amounts = IUniswapV2Router02(ammRouter).swapExactETHForTokens{value:nativeAmountIn}(
                amountOutMin,
                path,
                address(this),
                deadline
            );

            bridgeAmount = amounts[1];
            require(bridgeAmount > 0, 'error: ammRouter gave us 0 tokens to swap() with stargate');

            // this contract needs to approve the stargateRouter to spend its path[1] token!
            IERC20(bridgeToken).approve(address(stargateRouter), bridgeAmount);
        }

        // encode payload data to send to destination contract, which it will handle with sgReceive()
        bytes memory data;
        {
            data = abi.encode(OUT_TO_NATIVE, deadline, amountOutMinDest, to);
        }

        // Stargate's Router.swap() function sends the tokens to the destination chain.
        IStargateRouter(stargateRouter).swap{value:msg.value.sub(nativeAmountIn)}(
            dstChainId,                                     // the destination chain id
            srcPoolId,                                      // the source Stargate poolId
            dstPoolId,                                      // the destination Stargate poolId
            payable(msg.sender),                            // refund adddress. if msg.sender pays too much gas, return extra eth
            bridgeAmount,                                   // total tokens to send to destination chain
            amountOutMinSg,                                 // minimum
            IStargateRouter.lzTxObj(500000, 0, "0x"),       // 500,000 for the sgReceive()
            abi.encodePacked(destStargateComposed),         // destination address, the sgReceive() implementer
            data                                            // bytes payload
        );
    }

    //-----------------------------------------------------------------------------------------------------------------------
    // sgReceive() - the destination contract must implement this function to receive the tokens and payload
    function sgReceive(uint16 /*_chainId*/, bytes memory /*_srcAddress*/, uint /*_nonce*/, address _token, uint amountLD, bytes memory payload) override external {
        require(msg.sender == address(stargateRouter), "only stargate router can call sgReceive!");

        (address _tokenOut, uint _deadline, uint _amountOutMin, address _toAddr) = abi.decode(payload, (address, uint, uint, address));

        // so that router can swap our tokens
        IERC20(_token).approve(address(ammRouter), amountLD);

        uint _toBalancePreTransferOut = address(_toAddr).balance;

        if(_tokenOut == address(0x0)){
            // they want to get out native tokens
            address[] memory path = new address[](2);
            path[0] = _token;
            path[1] = IUniswapV2Router02(ammRouter).WETH();

            // use ammRouter to swap incoming bridge token into native tokens
            try IUniswapV2Router02(ammRouter).swapExactTokensForETH(
                amountLD,           // the stable received from stargate at the destination
                _amountOutMin,      // slippage param, min amount native token out
                path,               // path[0]: stabletoken address, path[1]: WETH from sushi router
                _toAddr,            // the address to send the *out* native to
                _deadline           // the unix timestamp deadline
            ) {
                // success, the ammRouter should have sent the eth to them
                emit ReceivedOnDestination(OUT_TO_NATIVE, address(_toAddr).balance.sub(_toBalancePreTransferOut));
            } catch {
                // send transfer _token/amountLD to msg.sender because the swap failed for some reason
                IERC20(_token).transfer(_toAddr, amountLD);
                emit ReceivedOnDestination(_token, amountLD);
            }

        } else { // they want to get out erc20 tokens
            uint _toAddrTokenBalancePre = IERC20(_tokenOut).balanceOf(_toAddr);
            address[] memory path = new address[](2);
            path[0] = _token;
            path[1] = _tokenOut;
            try IUniswapV2Router02(ammRouter).swapExactTokensForTokens(
                amountLD,           // the stable received from stargate at the destination
                _amountOutMin,      // slippage param, min amount native token out
                path,               // path[0]: stabletoken address, path[1]: WETH from sushi router
                _toAddr,            // the address to send the *out* tokens to
                _deadline           // the unix timestamp deadline
            ) {
                // success, the ammRouter should have sent the eth to them
                emit ReceivedOnDestination(_tokenOut, IERC20(_tokenOut).balanceOf(_toAddr).sub(_toAddrTokenBalancePre));
            } catch {
                // transfer _token/amountLD to msg.sender because the swap failed for some reason.
                // this is not the ideal scenario, but the contract needs to deliver them eth or USDC.
                IERC20(_token).transfer(_toAddr, amountLD);
                emit ReceivedOnDestination(_token, amountLD);
            }
        }
    }

}