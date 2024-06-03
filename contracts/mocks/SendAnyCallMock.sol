// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;


interface IAnyCallProxy {


    function estimateFees(address _to, bytes calldata _data, uint16 _toChainID, bytes calldata _adapterParam) external view returns (uint nativeFee);

    function anyCall(address _paymentAddress, address _to, bytes calldata _data, uint16 _toChainID, bytes calldata _adapterParams) external payable;

}


contract SendAnyCallMock {


    address public callProxy;

    uint16 version = 1;
    uint256 gasForDestinationLzReceive = 3500000;

    receive() external payable {}

    constructor(address _callProxy){
        callProxy = _callProxy;
    }

    function setGas(uint256 gas) external {
        gasForDestinationLzReceive = gas;
    }

    /***
     * @notice Test method call
     */
    function testTransfer(address _contract, address to, uint256 amount, uint16 _toChainID) external payable {
        bytes memory _data = abi.encodeWithSignature("transfer(address,uint256)", to, amount);
        IAnyCallProxy(callProxy).anyCall{value: msg.value}(msg.sender, _contract, _data, _toChainID, abi.encodePacked(version, gasForDestinationLzReceive));
    }

    /***
     * @notice Test message transfer
     */
    function testMsg(address _contract, uint256 _idx, string memory _msg, uint16 _toChainID) external payable {
        bytes memory _data = abi.encodeWithSignature("receiveMsg(uint256,string)", _idx, _msg);
        IAnyCallProxy(callProxy).anyCall{value: msg.value}(msg.sender, _contract, _data, _toChainID, abi.encodePacked(version, gasForDestinationLzReceive));
    }

    /***
     * @notice Test message transfer(No fee)
     */
    function testMsgNoFee(address _contract, uint256 _idx, string memory _msg, uint16 _toChainID) external {
        bytes memory _data = abi.encodeWithSignature("receiveMsg(uint256,string)", _idx, _msg);
        IAnyCallProxy(callProxy).anyCall(address(0), _contract, _data, _toChainID, abi.encodePacked(version, gasForDestinationLzReceive));
    }

    /***
     * @notice GasAmount 20000
     */
    function testMsgDefautGasLimit(address _contract, uint256 _idx, string memory _msg, uint16 _toChainID) external payable {
        bytes memory _data = abi.encodeWithSignature("receiveMsg(uint256,string)", _idx, _msg);
        IAnyCallProxy(callProxy).anyCall{value: msg.value}(msg.sender, _contract, _data, _toChainID, abi.encodePacked(version, gasForDestinationLzReceive));
    }

    /***
     * @notice GasAmount 200000000
     */
    function testMsgMoreGasLimit(address _contract, uint256 _idx, string memory _msg, uint16 _toChainID) external payable {
        bytes memory _data = abi.encodeWithSignature("receiveMsg(uint256,string)", _idx, _msg);
        uint16 version = 1;
        uint256 gasAmount = 20000000;
        bytes memory _adapterParams = abi.encodePacked(version, gasAmount);
        IAnyCallProxy(callProxy).anyCall{value: msg.value}(msg.sender, _contract, _data, _toChainID, _adapterParams);
    }


}
