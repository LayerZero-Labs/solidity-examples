const {expect} = require("chai")
const {ethers} = require("hardhat")

describe("AnyCallProxy Test ", function () {

    const LOCAL_CHAIN_ID = 1;
    const REMOTE_CHAIN_ID = 2;
    const _idx = 1;
    const _msg = "Hello world";

    let owner, alice, bob;
    let LZEndpointMock, AnyCallProxy, ERC20Mock, SendAnyCallMock, ReceiveAnyCallMock
    let l1_CallProxy, l2_CallProxy, l2_token, sendAnyCallMock, receiveAnyCallMock, localEndpoint, remoteEndpoint

    before(async function () {
        [owner, alice, bob] = await ethers.getSigners();
        LZEndpointMock = await ethers.getContractFactory("LZEndpointMock");
        AnyCallProxy = await ethers.getContractFactory("AnyCallProxy");
        ERC20Mock = await ethers.getContractFactory("ERC20Mock");
        SendAnyCallMock = await ethers.getContractFactory("SendAnyCallMock");
        ReceiveAnyCallMock = await ethers.getContractFactory("ReceiveAnyCallMock");
    })

    beforeEach(async function () {
        localEndpoint = await LZEndpointMock.deploy(LOCAL_CHAIN_ID);
        remoteEndpoint = await LZEndpointMock.deploy(REMOTE_CHAIN_ID);
        l2_token = await ERC20Mock.deploy("Test", "Test");
        l1_CallProxy = await AnyCallProxy.deploy(localEndpoint.address);
        l2_CallProxy = await AnyCallProxy.deploy(remoteEndpoint.address);

        sendAnyCallMock = await SendAnyCallMock.deploy(l1_CallProxy.address)
        receiveAnyCallMock = await ReceiveAnyCallMock.deploy(l2_CallProxy.address);

        await localEndpoint.setDestLzEndpoint(l2_CallProxy.address, remoteEndpoint.address);
        await remoteEndpoint.setDestLzEndpoint(l1_CallProxy.address, localEndpoint.address);

        const localPath = ethers.utils.solidityPack(["address", "address"], [l1_CallProxy.address, l2_CallProxy.address]);
        const remotePath = ethers.utils.solidityPack(["address", "address"], [l2_CallProxy.address, l1_CallProxy.address]);

        await l1_CallProxy.setTrustedRemote(REMOTE_CHAIN_ID, remotePath); // for A, set B
        await l2_CallProxy.setTrustedRemote(LOCAL_CHAIN_ID, localPath); // for B, set A


    })


    describe("Test Fee", async function () {
        it("should send msg no fee", async function () {
            expect(await receiveAnyCallMock.idx()).to.equal(0);
            expect(await receiveAnyCallMock.data()).to.equal("Nothing received yet");

            // 1. set White list
            await l1_CallProxy.setWhitelist(sendAnyCallMock.address, receiveAnyCallMock.address, REMOTE_CHAIN_ID, true);
            // 2. send ETH to cover tx fee
            await owner.sendTransaction({to: l1_CallProxy.address, value: ethers.utils.parseEther("2")});
            // 3. cross-chain
            await sendAnyCallMock.testMsgNoFee(receiveAnyCallMock.address, _idx, _msg, REMOTE_CHAIN_ID);

            expect(await receiveAnyCallMock.idx()).to.equal(_idx);
            expect(await receiveAnyCallMock.data()).to.equal(_msg);

        })

        it("revert send msg no fee", async function () {

            expect(await receiveAnyCallMock.idx()).to.equal(0);
            expect(await receiveAnyCallMock.data()).to.equal("Nothing received yet");

            // 1. set White list
            await l1_CallProxy.setWhitelist(sendAnyCallMock.address, receiveAnyCallMock.address, REMOTE_CHAIN_ID, true);
            // 2. cross-chain
            await expect(sendAnyCallMock.testMsgNoFee(receiveAnyCallMock.address, _idx, _msg, REMOTE_CHAIN_ID)).to.revertedWith("Insufficient fee balance");

        })

        it('test GasAmount', async function () {

            expect(await receiveAnyCallMock.idx()).to.equal(0);
            expect(await receiveAnyCallMock.data()).to.equal("Nothing received yet");

            // 1. set White list
            await l1_CallProxy.setWhitelist(sendAnyCallMock.address, receiveAnyCallMock.address, REMOTE_CHAIN_ID, true);

            // 2. cross-chain
            await sendAnyCallMock.connect(bob).testMsgDefautGasLimit(receiveAnyCallMock.address, _idx, _msg, REMOTE_CHAIN_ID, {value: ethers.utils.parseEther("10")});
            await sendAnyCallMock.connect(alice).testMsgMoreGasLimit(receiveAnyCallMock.address, _idx, _msg, REMOTE_CHAIN_ID, {value: ethers.utils.parseEther("10")});
        });
    })


    describe("Test Fee", async function () {
        it("should send msg no fee", async function () {

            expect(await receiveAnyCallMock.idx()).to.equal(0);
            expect(await receiveAnyCallMock.data()).to.equal("Nothing received yet");

            // 1. set White list
            await l1_CallProxy.setWhitelist(sendAnyCallMock.address, receiveAnyCallMock.address, REMOTE_CHAIN_ID, true);

            // 2. send ETH to cover tx fee
            await owner.sendTransaction({to: l1_CallProxy.address, value: ethers.utils.parseEther("2")});

            // 3. cross-chain
            await sendAnyCallMock.testMsgNoFee(receiveAnyCallMock.address, _idx, _msg, REMOTE_CHAIN_ID);

            expect(await receiveAnyCallMock.idx()).to.equal(_idx);
            expect(await receiveAnyCallMock.data()).to.equal(_msg);

        })

        it("revert send msg no fee", async function () {


            expect(await receiveAnyCallMock.idx()).to.equal(0);
            expect(await receiveAnyCallMock.data()).to.equal("Nothing received yet");

            // 1. set White list
            await l1_CallProxy.setWhitelist(sendAnyCallMock.address, receiveAnyCallMock.address, REMOTE_CHAIN_ID, true);
            // 2. cross-chain
            await expect(sendAnyCallMock.testMsgNoFee(receiveAnyCallMock.address, _idx, _msg, REMOTE_CHAIN_ID)).to.revertedWith("Insufficient fee balance");

        })

        it('test GasAmount', async function () {

            expect(await receiveAnyCallMock.idx()).to.equal(0);
            expect(await receiveAnyCallMock.data()).to.equal("Nothing received yet");

            // 1. set White list
            await l1_CallProxy.setWhitelist(sendAnyCallMock.address, receiveAnyCallMock.address, REMOTE_CHAIN_ID, true);

            // 2. cross-chain
            await sendAnyCallMock.connect(bob).testMsgDefautGasLimit(receiveAnyCallMock.address, _idx, _msg, REMOTE_CHAIN_ID, {value: ethers.utils.parseEther("10")});
            await sendAnyCallMock.connect(alice).testMsgMoreGasLimit(receiveAnyCallMock.address, _idx, _msg, REMOTE_CHAIN_ID, {value: ethers.utils.parseEther("10")});

            expect(await receiveAnyCallMock.idx()).to.equal(_idx);
            expect(await receiveAnyCallMock.data()).to.equal(_msg);
        });
    })


    describe("Test Any Call", async function () {
        it('should cross-chain calling function from L1 to L2 ', async function () {
            // send ETH to cover tx fee
            // await owner.sendTransaction({to: sendAnyCallMock.address, value: ethers.utils.parseEther("2")});
            const amount = 10;

            l2_token.mint(l2_CallProxy.address, amount);

            expect(await l2_token.balanceOf(bob.address)).to.equal(0);

            // 1. set white list
            await l1_CallProxy.setWhitelist(sendAnyCallMock.address, l2_token.address, REMOTE_CHAIN_ID, true);

            // 2. get native Fee
            let iface = new ethers.utils.Interface(["function transfer(address to, uint amount)"]);
            let _data = iface.encodeFunctionData("transfer", [bob.address, amount]);
            const _payload = ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [l2_token.address, _data])
            const {nativeFee} = await localEndpoint.estimateFees(REMOTE_CHAIN_ID, owner.address, _payload, false, ethers.utils.solidityPack(
                ['uint16', 'uint256'],
                [1, 3500000]
            ));

            // 3. cross-chain
            await sendAnyCallMock.testTransfer(l2_token.address, bob.address, amount, REMOTE_CHAIN_ID, {value: nativeFee});

            expect(await l2_token.balanceOf(bob.address)).to.equal(amount);
        });

        it('should cross-chain msg from L1 to L2', async function () {


            expect(await receiveAnyCallMock.idx()).to.equal(0);
            expect(await receiveAnyCallMock.data()).to.equal("Nothing received yet");

            // 1. set White list
            await l1_CallProxy.setWhitelist(sendAnyCallMock.address, receiveAnyCallMock.address, REMOTE_CHAIN_ID, true);

            // 2. get native Fee
            let iface = new ethers.utils.Interface(["function receiveMsg(uint256,string)"]);
            let _data = iface.encodeFunctionData("receiveMsg", [_idx, _msg]);
            const _payload = ethers.utils.solidityPack(["address", "bytes"], [receiveAnyCallMock.address, _data]);
            // const _payload = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes"], [receiveAnyCallMock.address, _data])


            const {nativeFee} = await localEndpoint.estimateFees(REMOTE_CHAIN_ID, owner.address, _payload, false, ethers.utils.solidityPack(
                ['uint16', 'uint256'],
                [1, 3500000]
            ));
            // address _to, bytes calldata _data, uint16 _toChainID, bytes calldata _adapterParam
            const nativeFee2 = await l1_CallProxy.estimateFees(receiveAnyCallMock.address, _data, REMOTE_CHAIN_ID, ethers.utils.solidityPack(
                ['uint16', 'uint256'],
                [1, 3500000])
            );
            expect(nativeFee).to.equal(nativeFee2);

            // 3. cross-chain
            await sendAnyCallMock.testMsg(receiveAnyCallMock.address, _idx, _msg, REMOTE_CHAIN_ID, {value: nativeFee});


            expect(await receiveAnyCallMock.idx()).to.equal(_idx);
            expect(await receiveAnyCallMock.data()).to.equal(_msg);
        });

        it('should get refund fee', async function () {
            const _idx = 1;
            const _msg = "Hello world";

            expect(await receiveAnyCallMock.idx()).to.equal(0);
            expect(await receiveAnyCallMock.data()).to.equal("Nothing received yet");

            // 1. set White list
            await l1_CallProxy.setWhitelist(sendAnyCallMock.address, receiveAnyCallMock.address, REMOTE_CHAIN_ID, true);

            // 2. get native Fee
            let iface = new ethers.utils.Interface(["function receiveMsg(uint256,string)"]);
            let _data = iface.encodeFunctionData("receiveMsg", [_idx, _msg]);
            const nativeFee = await l1_CallProxy.estimateFees(receiveAnyCallMock.address, _data, REMOTE_CHAIN_ID, "0x");

            // 3. cross-chain
            const beforeBalance = await ethers.provider.getBalance(owner.address);
            const moreFee = ethers.utils.parseEther("10");
            await sendAnyCallMock.testMsg(receiveAnyCallMock.address, _idx, _msg, REMOTE_CHAIN_ID, {value: moreFee});

            const afterBalance = await ethers.provider.getBalance(owner.address);
            expect(beforeBalance.sub(afterBalance)).to.lt(moreFee)

            expect(await receiveAnyCallMock.idx()).to.equal(_idx);
            expect(await receiveAnyCallMock.data()).to.equal(_msg);
        });

    })

})