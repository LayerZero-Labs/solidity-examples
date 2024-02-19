// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ReceiveAnyCallMock {
    event ReceiveMsg(uint256 _idx, string _data);

    uint256 public idx;
    string public data = "Nothing received yet";


    address public callProxy;


    constructor(address _callProxy){
        callProxy = _callProxy;
    }


    function receiveMsg(uint256 _idx, string memory _data) external {
        require(msg.sender == callProxy, "No permission");
        idx = _idx;
        data = _data;
        emit ReceiveMsg(_idx, _data);
    }


}
