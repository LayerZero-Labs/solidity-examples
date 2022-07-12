const { expect } = require("chai")
const { ethers } = require("hardhat")

describe("OFT: ", function () {
    const chainIdSrc = 1
    const chainIdDst = 2
    const name = "OmnichainFungibleToken"
    const symbol = "OFT"
    const globalSupply = ethers.utils.parseUnits("1000000", 18)

    let owner, lzEndpointSrcMock, lzEndpointDstMock, OFTSrc, OFTDst, LZEndpointMock, BasedOFT, OFT, LzLibFactory, lzLib

    before(async function () {
        owner = (await ethers.getSigners())[0]
        LzLibFactory = await ethers.getContractFactory("LzLib")
        lzLib = await LzLibFactory.deploy();
        LZEndpointMock = await ethers.getContractFactory("LZEndpointMock")
        BasedOFT = await ethers.getContractFactory("ExampleBasedOFT")
        OFT = await ethers.getContractFactory("OFT")
    })

    beforeEach(async function () {
        lzEndpointSrcMock = await LZEndpointMock.deploy(chainIdSrc)
        lzEndpointDstMock = await LZEndpointMock.deploy(chainIdDst)

        // create two OmnichainFungibleToken instances
        OFTSrc = await BasedOFT.deploy(lzEndpointSrcMock.address, globalSupply)
        OFTDst = await OFT.deploy(name, symbol, lzEndpointDstMock.address)

        // internal bookkeeping for endpoints (not part of a real deploy, just for this test)
        lzEndpointSrcMock.setDestLzEndpoint(OFTDst.address, lzEndpointDstMock.address)
        lzEndpointDstMock.setDestLzEndpoint(OFTSrc.address, lzEndpointSrcMock.address)

        // set each contracts source address so it can send to each other
        await OFTSrc.setTrustedRemote(chainIdDst, OFTDst.address) // for A, set B
        await OFTDst.setTrustedRemote(chainIdSrc, OFTSrc.address) // for B, set A

        //set destination min gas
        await OFTSrc.setMinDstGasLookup(chainIdDst, parseInt(await OFTSrc.FUNCTION_TYPE_SEND()), 225000)
        await OFTSrc.setUseCustomAdapterParams(true);
    })

    describe("setting up stored payload", async function () {
        // v1 adapterParams, encoded for version 1 style, and 200k gas quote
        const adapterParam = ethers.utils.solidityPack(["uint16", "uint256"], [1, 225000])
        const sendQty = ethers.utils.parseUnits("1", 18) // amount to be sent across

        beforeEach(async function () {
            // ensure they're both starting with correct amounts
            expect(await OFTSrc.balanceOf(owner.address)).to.be.equal(globalSupply)
            expect(await OFTDst.balanceOf(owner.address)).to.be.equal("0")

            // block receiving msgs on the dst lzEndpoint to simulate ua reverts which stores a payload
            await lzEndpointDstMock.blockNextMsg()

            // stores a payload
            await expect(
                OFTSrc.sendFrom(
                    owner.address,
                    chainIdDst,
                    ethers.utils.solidityPack(["address"], [owner.address]),
                    sendQty,
                    owner.address,
                    ethers.constants.AddressZero,
                    adapterParam
                )
            ).to.emit(lzEndpointDstMock, "PayloadStored")

            // verify tokens burned on source chain and minted on destination chain
            expect(await OFTSrc.balanceOf(owner.address)).to.be.equal(globalSupply.sub(sendQty))
            expect(await OFTDst.balanceOf(owner.address)).to.be.equal(0)
        })

        it("hasStoredPayload() - stores the payload", async function () {
            expect(await lzEndpointDstMock.hasStoredPayload(chainIdSrc, OFTSrc.address)).to.equal(true)
        })

        it("getLengthOfQueue() - cant send another msg if payload is blocked", async function () {
            // queue is empty
            expect(await lzEndpointDstMock.getLengthOfQueue(chainIdSrc, OFTSrc.address)).to.equal(0)

            // now that a msg has been stored, subsequent ones will not revert, but will get added to the queue
            await expect(
                OFTSrc.sendFrom(
                    owner.address,
                    chainIdDst,
                    ethers.utils.solidityPack(["address"], [owner.address]),
                    sendQty,
                    owner.address,
                    ethers.constants.AddressZero,
                    adapterParam
                )
            ).to.not.reverted

            // queue has increased
            expect(await lzEndpointDstMock.getLengthOfQueue(chainIdSrc, OFTSrc.address)).to.equal(1)
        })

        it("retryPayload() - delivers a stuck msg", async function () {
            // balance before transfer is 0
            expect(await OFTDst.balanceOf(owner.address)).to.be.equal(0)

            const payload = ethers.utils.defaultAbiCoder.encode(["bytes", "uint256"], [owner.address, sendQty])
            await expect(lzEndpointDstMock.retryPayload(chainIdSrc, OFTSrc.address, payload)).to.emit(lzEndpointDstMock, "PayloadCleared")

            // balance after transfer is sendQty
            expect(await OFTDst.balanceOf(owner.address)).to.be.equal(sendQty)
        })

        it("forceResumeReceive() - removes msg", async function () {
            // balance before is 0
            expect(await OFTDst.balanceOf(owner.address)).to.be.equal(0)

            // forceResumeReceive deletes the stuck msg
            await expect(OFTDst.forceResumeReceive(chainIdSrc, OFTSrc.address)).to.emit(lzEndpointDstMock, "UaForceResumeReceive")

            // stored payload gone
            expect(await lzEndpointDstMock.hasStoredPayload(chainIdSrc, OFTSrc.address)).to.equal(false)

            // balance after transfer is 0
            expect(await OFTDst.balanceOf(owner.address)).to.be.equal(0)
        })

        it("forceResumeReceive() - removes msg, delivers all msgs in the queue", async function () {
            const msgsInQueue = 3

            for (let i = 0; i < msgsInQueue; i++) {
                // first iteration stores a payload, the following get added to queue
                await OFTSrc.sendFrom(
                    owner.address,
                    chainIdDst,
                    ethers.utils.solidityPack(["address"], [owner.address]),
                    sendQty,
                    owner.address,
                    ethers.constants.AddressZero,
                    adapterParam
                )
            }

            // msg queue is full
            expect(await lzEndpointDstMock.getLengthOfQueue(chainIdSrc, OFTSrc.address)).to.equal(msgsInQueue)

            // balance before is 0
            expect(await OFTDst.balanceOf(owner.address)).to.be.equal(0)

            // forceResumeReceive deletes the stuck msg
            await expect(OFTDst.forceResumeReceive(chainIdSrc, OFTSrc.address)).to.emit(lzEndpointDstMock, "UaForceResumeReceive")

            // balance after transfer is 0
            expect(await OFTDst.balanceOf(owner.address)).to.be.equal(sendQty.mul(msgsInQueue))

            // msg queue is empty
            expect(await lzEndpointDstMock.getLengthOfQueue(chainIdSrc, OFTSrc.address)).to.equal(0)
        })

        it("forceResumeReceive() - emptied queue is actually emptied and doesnt get double counted", async function () {
            const msgsInQueue = 3

            for (let i = 0; i < msgsInQueue; i++) {
                // first iteration stores a payload, the following gets added to queue
                await OFTSrc.sendFrom(
                    owner.address,
                    chainIdDst,
                    ethers.utils.solidityPack(["address"], [owner.address]),
                    sendQty,
                    owner.address,
                    ethers.constants.AddressZero,
                    adapterParam
                )
            }

            // msg queue is full
            expect(await lzEndpointDstMock.getLengthOfQueue(chainIdSrc, OFTSrc.address)).to.equal(msgsInQueue)

            // balance before is 0
            expect(await OFTDst.balanceOf(owner.address)).to.be.equal(0)

            // forceResumeReceive deletes the stuck msg
            await expect(OFTDst.forceResumeReceive(chainIdSrc, OFTSrc.address)).to.emit(lzEndpointDstMock, "UaForceResumeReceive")

            // balance after transfer
            expect(await OFTDst.balanceOf(owner.address)).to.be.equal(sendQty.mul(msgsInQueue))

            // store a new payload
            await lzEndpointDstMock.blockNextMsg()
            await OFTSrc.sendFrom(
                owner.address,
                chainIdDst,
                ethers.utils.solidityPack(["address"], [owner.address]),
                sendQty,
                owner.address,
                ethers.constants.AddressZero,
                adapterParam
            )

            // forceResumeReceive deletes msgs but since there's nothing in the queue, balance shouldn't increase
            await expect(OFTDst.forceResumeReceive(chainIdSrc, OFTSrc.address)).to.emit(lzEndpointDstMock, "UaForceResumeReceive")

            // balance after transfer remains the same
            expect(await OFTDst.balanceOf(owner.address)).to.be.equal(sendQty.mul(msgsInQueue))
        })
    })
})
