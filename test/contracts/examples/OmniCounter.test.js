const { expect } = require("chai")
const { ethers } = require("hardhat")

describe("OmniCounter", function () {
    beforeEach(async function () {
        // use this chainId
        this.chainId = 123

        // create a LayerZero Endpoint mock for testing
        const LayerZeroEndpointMock = await ethers.getContractFactory("LZEndpointMock")
        this.lzEndpointMock = await LayerZeroEndpointMock.deploy(this.chainId)

        // create two OmniCounter instances
        const OmniCounter = await ethers.getContractFactory("OmniCounter")
        this.omniCounterA = await OmniCounter.deploy(this.lzEndpointMock.address)
        this.omniCounterB = await OmniCounter.deploy(this.lzEndpointMock.address)

        this.lzEndpointMock.setDestLzEndpoint(this.omniCounterA.address, this.lzEndpointMock.address)
        this.lzEndpointMock.setDestLzEndpoint(this.omniCounterB.address, this.lzEndpointMock.address)

        // set each contracts source address so it can send to each other
        this.omniCounterA.setTrustedRemote(this.chainId, this.omniCounterB.address)
        this.omniCounterB.setTrustedRemote(this.chainId, this.omniCounterA.address)
    })

    it("increment the counter of the destination OmniCounter", async function () {
        // ensure theyre both starting from 0
        expect(await this.omniCounterA.counter()).to.be.equal(0) // initial value
        expect(await this.omniCounterB.counter()).to.be.equal(0) // initial value

        // instruct each OmniCounter to increment the other OmniCounter
        // counter A increments counter B
        await this.omniCounterA.incrementCounter(this.chainId)
        expect(await this.omniCounterA.counter()).to.be.equal(0) // still 0
        expect(await this.omniCounterB.counter()).to.be.equal(1) // now its 1

        // counter B increments counter A
        await this.omniCounterB.incrementCounter(this.chainId)
        expect(await this.omniCounterA.counter()).to.be.equal(1) // now its 1
        expect(await this.omniCounterB.counter()).to.be.equal(1) // still 1
    })
})
