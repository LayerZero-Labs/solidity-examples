// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;
pragma abicoder v2;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IStargateRouter.sol";
import "../interfaces/IStargateRouterETH.sol";
import "../interfaces/IStargateFactory.sol";

contract WidgetSwap is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IStargateRouter public immutable stargateRouter;
    IStargateRouterETH public immutable stargateRouterETH;
    IStargateFactory public immutable stargateFactory;
    uint256 public constant TENTH_BPS_DENOMINATOR = 100000;

    struct FeeObj {
        uint256 tenthBps; // bps is to an extra decimal place
        address feeCollector;
    }

    event WidgetSwapped(bytes2 indexed partnerId, uint256 tenthBps, uint256 widgetFee);
    event PartnerSwap(bytes2 indexed partnerId);

    constructor(address _stargateRouter, address _stargateRouterETH, address _stargateFactory) {
        stargateRouter = IStargateRouter(_stargateRouter);
        stargateRouterETH = IStargateRouterETH(_stargateRouterETH);
        stargateFactory = IStargateFactory(_stargateFactory);
    }

    // allow anyone to emit this msg alongside their stargate tx so they can get credited for their referral
    // to get credit this event must be emitted in the same tx as a stargate swap event
    function partnerSwap(bytes2 _partnerId) external {
        emit PartnerSwap(_partnerId);
    }

    function swapTokens(
        uint16 _dstChainId,
        uint16 _srcPoolId,
        uint16 _dstPoolId,
        uint256 _amountLD,
        uint256 _minAmountLD,
        IStargateRouter.lzTxObj calldata _lzTxParams,
        bytes calldata _to,
        bytes2 _partnerId,
        FeeObj calldata _feeObj
    ) external nonReentrant payable {
        uint256 widgetFee = _getAndPayWidgetFee(_srcPoolId, _amountLD, _feeObj);

        stargateRouter.swap{value:msg.value}(
            _dstChainId,
            _srcPoolId,
            _dstPoolId,
            payable(msg.sender),
            _amountLD - widgetFee,
            _minAmountLD,
            _lzTxParams,
            _to,
            "0x"
        );

        emit WidgetSwapped(_partnerId, _feeObj.tenthBps, widgetFee);
    }

    function swapETH(
        uint16 _dstChainId,
        uint256 _amountLD,
        uint256 _minAmountLD,
        bytes calldata _to,
        bytes2 _partnerId,
        FeeObj calldata _feeObj
    ) external nonReentrant payable {
        // allows us to deploy same contract on non eth chains
        require(address(stargateRouterETH) != address(0x0), "WidgetSwap: func not available");

        uint256 widgetFee = _getAndPayWidgetFeeETH(_amountLD, _feeObj);

        // "value:" contains the amount of eth to swap and the stargate/layerZero fees, minus the widget fee
        stargateRouterETH.swapETH{value:msg.value - widgetFee}(
            _dstChainId,
            payable(msg.sender),
            _to,
            _amountLD - widgetFee,
            _minAmountLD
        );

        emit WidgetSwapped(_partnerId, _feeObj.tenthBps, widgetFee);
    }

    function _getAndPayWidgetFee(
        uint16 _srcPoolId,
        uint256 _amountLD,
        FeeObj calldata _feeObj
    ) internal returns (uint256 widgetFee) {
        // corresponding token to the poolId
        address token = stargateFactory.getPool(_srcPoolId).token();

        // move all the tokens to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), _amountLD);

        // calculate the widgetFee
        widgetFee = _amountLD * _feeObj.tenthBps / TENTH_BPS_DENOMINATOR;

        // pay the widget fee
        IERC20(token).safeTransfer(_feeObj.feeCollector, widgetFee);

        // allow stargateRouter to spend the tokens to be transferred
        IERC20(token).approve(address(stargateRouter), _amountLD - widgetFee);

        return widgetFee;
    }

    function _getAndPayWidgetFeeETH(
        uint256 _amountLD,
        FeeObj calldata _feeObj
    ) internal returns (uint256 widgetFee) {
        // calculate the widgetFee
        widgetFee = _amountLD * _feeObj.tenthBps / TENTH_BPS_DENOMINATOR;
        require(msg.value > widgetFee, "WidgetSwap: not enough eth for widgetFee");

        // verify theres enough eth to cover the amount to swap
        require(msg.value - widgetFee > _amountLD, "WidgetSwap: not enough eth for swap");

        // pay the widget fee
        (bool success, ) = _feeObj.feeCollector.call{value: widgetFee}("");
        require(success, "WidgetSwap: failed to transfer widgetFee");

        return widgetFee;
    }
}