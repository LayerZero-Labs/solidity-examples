const { expect } = require("chai")
const { ethers } = require("hardhat")

describe("PausableOFT20: ", function () {
    const chainIdSrc = 1
    const chainIdDst = 2
    const name = "OmnichainFungibleToken"
    const symbol = "OFT"
    const globalSupply = ethers.utils.parseUnits("1000000", 18)
    const adapterParam = ethers.utils.solidityPack(["uint16", "uint256"], [1, 225000])
    const sendQty = ethers.utils.parseUnits("1", 18) // amount to be sent across

    let owner, warlock, lzEndpointSrcMock, lzEndpointDstMock, OFTSrc, OFTDst, LZEndpointMock, BasedOFT, PausableOFT, LzLibFactory, lzLib

    before(async function () {
        owner = (await ethers.getSigners())[0]
        warlock = (await ethers.getSigners())[1]
        LZEndpointMock = await ethers.getContractFactory("LZEndpointMock")
        BasedOFT = await ethers.getContractFactory("ExampleBasedOFT20")
        PausableOFT = await ethers.getContractFactory("PausableOFT20")
    })

    beforeEach(async function () {
        lzEndpointSrcMock = await LZEndpointMock.deploy(chainIdSrc)
        lzEndpointDstMock = await LZEndpointMock.deploy(chainIdDst)

        // create two PausableOmnichainFungibleToken instances
        OFTSrc = await BasedOFT.deploy(lzEndpointSrcMock.address, globalSupply)
        OFTDst = await PausableOFT.deploy(name, symbol, lzEndpointDstMock.address)

        // internal bookkeeping for endpoints (not part of a real deploy, just for this test)
        lzEndpointSrcMock.setDestLzEndpoint(OFTDst.address, lzEndpointDstMock.address)
        lzEndpointDstMock.setDestLzEndpoint(OFTSrc.address, lzEndpointSrcMock.address)

        // set each contracts source address so it can send to each other
        await OFTSrc.setTrustedRemote(chainIdDst, OFTDst.address) // for A, set B
        await OFTDst.setTrustedRemote(chainIdSrc, OFTSrc.address) // for B, set A

        //set destination min gas
        await OFTSrc.setMinDstGasLookup(chainIdDst, parseInt(await OFTSrc.FUNCTION_TYPE_SEND()), 225000)
        await OFTDst.setMinDstGasLookup(chainIdSrc, parseInt(await OFTDst.FUNCTION_TYPE_SEND()), 225000)

        await OFTSrc.setUseCustomAdapterParams(true);
        await OFTDst.setUseCustomAdapterParams(true);
    })

    it("sendFrom()", async function () {
        // ensure they're both starting with correct amounts
        expect(await OFTSrc.balanceOf(owner.address)).to.be.equal(globalSupply)
        expect(await OFTDst.balanceOf(owner.address)).to.be.equal("0")

        // can transfer accross chain
        await OFTSrc.sendFrom(
            owner.address,
            chainIdDst,
            ethers.utils.solidityPack(["address"], [owner.address]),
            sendQty,
            owner.address,
            ethers.constants.AddressZero,
            adapterParam
        )

        // verify tokens burned on source chain and minted on destination chain
        expect(await OFTSrc.balanceOf(owner.address)).to.be.equal(globalSupply.sub(sendQty))
        expect(await OFTDst.balanceOf(owner.address)).to.be.equal(sendQty)
    })

    it("pauseSendTokens()", async function () {
        // pause the transfers
        await OFTDst.pauseSendTokens(true)

        // transfer to the paused chain are not paused. Only outbound
        await OFTSrc.sendFrom(
            owner.address,
            chainIdDst,
            ethers.utils.solidityPack(["address"], [owner.address]),
            sendQty,
            owner.address,
            ethers.constants.AddressZero,
            adapterParam
        )

        // verify tokens burned on source chain and minted on destination chain
        expect(await OFTSrc.balanceOf(owner.address)).to.be.equal(globalSupply.sub(sendQty))
        expect(await OFTDst.balanceOf(owner.address)).to.be.equal(sendQty)

        // cannot transfer back across chain due to pause
        await expect(
            OFTDst.sendFrom(
                owner.address,
                chainIdSrc,
                ethers.utils.solidityPack(["address"], [owner.address]),
                sendQty,
                owner.address,
                ethers.constants.AddressZero,
                adapterParam
            )
        ).to.be.revertedWith("Pausable: paused")

        // verify tokens were not modified
        expect(await OFTSrc.balanceOf(owner.address)).to.be.equal(globalSupply.sub(sendQty))
        expect(await OFTDst.balanceOf(owner.address)).to.be.equal(sendQty)

        // unpause the transfers
        await OFTDst.pauseSendTokens(false)

        // transfer succeeds
        await OFTDst.sendFrom(
            owner.address,
            chainIdSrc,
            ethers.utils.solidityPack(["address"], [owner.address]),
            sendQty,
            owner.address,
            ethers.constants.AddressZero,
            adapterParam
        )

        // verify tokens were sent back
        expect(await OFTSrc.balanceOf(owner.address)).to.be.equal(globalSupply)
        expect(await OFTDst.balanceOf(owner.address)).to.be.equal(0)
    })

    it("pauseSendTokens() - reverts if not owner", async function () {
        await expect(OFTDst.connect(warlock).pauseSendTokens(true)).to.be.revertedWith("Ownable: caller is not the owner'")
    })
})
