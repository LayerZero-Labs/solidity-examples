const { expect } = require("chai")
const { ethers } = require("hardhat")

describe("ProxyOFT: ", function () {
    const chainId_A = 1
    const chainId_B = 2
    const chainId_C = 3
    const name = "OmnichainNonFungibleToken"
    const symbol = "ONFT"

    let owner, warlock, lzEndpointMockA, lzEndpointMockB, lzEndpointMockC
    let OFT_B, OFT_C, LZEndpointMock, OFT, ERC20, ERC20Src, ProxyOFT_A, ProxyOFT, LzLibFactory, lzLib

    before(async function () {
        owner = (await ethers.getSigners())[0]
        warlock = (await ethers.getSigners())[1]
        LzLibFactory = await ethers.getContractFactory("LzLib")
        lzLib = await LzLibFactory.deploy();
        LZEndpointMock = await ethers.getContractFactory("LZEndpointMock")
        OFT = await ethers.getContractFactory("OFT")
        ProxyOFT = await ethers.getContractFactory("ProxyOFT")
        ERC20 = await ethers.getContractFactory("ERC20Mock")
    })

    beforeEach(async function () {
        lzEndpointMockA = await LZEndpointMock.deploy(chainId_A)
        lzEndpointMockB = await LZEndpointMock.deploy(chainId_B)
        lzEndpointMockC = await LZEndpointMock.deploy(chainId_C)

        // make an ERC20 to mock a previous deploy
        ERC20Src = await ERC20.deploy("ERC20", "ERC20")
        // generate a proxy to allow it to go OFT
        ProxyOFT_A = await ProxyOFT.deploy(lzEndpointMockA.address, ERC20Src.address)

        // create OFT on dstChains
        OFT_B = await OFT.deploy(name, symbol, lzEndpointMockB.address)
        OFT_C = await OFT.deploy(name, symbol, lzEndpointMockC.address)

        // wire the lz endpoints to guide msgs back and forth
        lzEndpointMockA.setDestLzEndpoint(OFT_B.address, lzEndpointMockB.address)
        lzEndpointMockA.setDestLzEndpoint(OFT_C.address, lzEndpointMockC.address)
        lzEndpointMockB.setDestLzEndpoint(ProxyOFT_A.address, lzEndpointMockA.address)
        lzEndpointMockB.setDestLzEndpoint(OFT_C.address, lzEndpointMockC.address)
        lzEndpointMockC.setDestLzEndpoint(ProxyOFT_A.address, lzEndpointMockA.address)
        lzEndpointMockC.setDestLzEndpoint(OFT_B.address, lzEndpointMockB.address)

        // set each contracts source address so it can send to each other
        await ProxyOFT_A.setTrustedRemote(chainId_B, OFT_B.address)
        await ProxyOFT_A.setTrustedRemote(chainId_C, OFT_C.address)
        await OFT_B.setTrustedRemote(chainId_A, ProxyOFT_A.address)
        await OFT_B.setTrustedRemote(chainId_C, OFT_C.address)
        await OFT_C.setTrustedRemote(chainId_A, ProxyOFT_A.address)
        await OFT_C.setTrustedRemote(chainId_B, OFT_B.address)
    })

    it("sendFrom() - your own tokens", async function () {
        const tokenAmount = 1234567
        await ERC20Src.mint(owner.address, tokenAmount)

        // verify owner has tokens
        expect(await ERC20Src.balanceOf(owner.address)).to.be.equal(tokenAmount)

        // has no tokens on other chain
        expect(await OFT_B.balanceOf(owner.address)).to.be.equal(0)

        // can transfer tokens on srcChain as regular erC20
        await ERC20Src.transfer(warlock.address, tokenAmount)
        expect(await ERC20Src.balanceOf(warlock.address)).to.be.equal(tokenAmount)

        // approve the proxy to swap your tokens
        await ERC20Src.connect(warlock).approve(ProxyOFT_A.address, tokenAmount)

        // swaps token to other chain
        await ProxyOFT_A.connect(warlock).sendFrom(
            warlock.address,
            chainId_B,
            warlock.address,
            tokenAmount,
            warlock.address,
            ethers.constants.AddressZero,
            "0x"
        )

        // tokens are now owned by the proxy contract, because this is the original oft chain
        expect(await ERC20Src.balanceOf(warlock.address)).to.equal(0)

        // tokens received on the dst chain
        expect(await OFT_B.balanceOf(warlock.address)).to.be.equal(tokenAmount)

        // can send to other oft contract eg. not the original oft contract chain
        await OFT_B.connect(warlock).sendFrom(
            warlock.address,
            chainId_C,
            warlock.address,
            tokenAmount,
            warlock.address,
            ethers.constants.AddressZero,
            "0x"
        )

        // tokens are burned on the sending chain
        expect(await OFT_B.balanceOf(warlock.address)).to.be.equal(0)

        // tokens received on the dst chain
        expect(await OFT_C.balanceOf(warlock.address)).to.be.equal(tokenAmount)

        // send them back to the original chain
        await OFT_C.connect(warlock).sendFrom(
            warlock.address,
            chainId_A,
            warlock.address,
            tokenAmount,
            warlock.address,
            ethers.constants.AddressZero,
            "0x"
        )

        // tokens are burned on the sending chain
        expect(await OFT_C.balanceOf(warlock.address)).to.be.equal(0)

        // received on the original chain
        expect(await ERC20Src.balanceOf(warlock.address)).to.be.equal(tokenAmount)
    })

    it("sendFrom() - reverts if not approved on proxy", async function () {
        const tokenAmount = 123
        await ERC20Src.mint(owner.address, tokenAmount)
        await expect(
            ProxyOFT_A.sendFrom(owner.address, chainId_B, owner.address, tokenAmount, owner.address, ethers.constants.AddressZero, "0x")
        ).to.be.revertedWith("ERC20: insufficient allowance")
    })

    it("sendFrom() - reverts if from is not msgSender", async function () {
        const tokenAmount = 123
        await ERC20Src.mint(owner.address, tokenAmount)

        // approve the proxy to swap your tokens
        await ERC20Src.approve(ProxyOFT_A.address, tokenAmount)

        // swaps tokens to other chain
        await expect(
            ProxyOFT_A.connect(warlock).sendFrom(
                owner.address,
                chainId_B,
                owner.address,
                tokenAmount,
                owner.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ProxyOFT: owner is not send caller")
    })

    it("sendFrom() - reverts if no balance to swap", async function () {
        const tokenAmount = 123
        await ERC20Src.mint(owner.address, tokenAmount)

        // approve the proxy to swap your tokens
        await ERC20Src.approve(ProxyOFT_A.address, tokenAmount)

        // swaps tokens to other chain
        await ProxyOFT_A.sendFrom(owner.address, chainId_B, owner.address, tokenAmount, owner.address, ethers.constants.AddressZero, "0x")

        // tokens received on the dst chain
        expect(await OFT_B.balanceOf(owner.address)).to.be.equal(tokenAmount)

        // reverts because other address does not own tokens
        await expect(
            OFT_B.connect(warlock).sendFrom(
                warlock.address,
                chainId_C,
                warlock.address,
                tokenAmount,
                warlock.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ERC20: burn amount exceeds balance")
    })

    it("sendFrom() - on behalf of other user", async function () {
        const tokenAmount = 123
        await ERC20Src.mint(owner.address, tokenAmount)

        // approve the proxy to swap your tokens
        await ERC20Src.approve(ProxyOFT_A.address, tokenAmount)

        // swaps tokens to other chain
        await ProxyOFT_A.sendFrom(owner.address, chainId_B, owner.address, tokenAmount, owner.address, ethers.constants.AddressZero, "0x")

        // tokens received on the dst chain
        expect(await OFT_B.balanceOf(owner.address)).to.be.equal(tokenAmount)

        // approve the other user to send the tokens
        await OFT_B.approve(warlock.address, tokenAmount)

        // sends across
        await OFT_B.connect(warlock).sendFrom(
            owner.address,
            chainId_C,
            warlock.address,
            tokenAmount,
            warlock.address,
            ethers.constants.AddressZero,
            "0x"
        )

        // tokens received on the dst chain
        expect(await OFT_C.balanceOf(warlock.address)).to.be.equal(tokenAmount)
    })

    it("sendFrom() - reverts if contract is approved, but not the sending user", async function () {
        const tokenAmount = 123
        await ERC20Src.mint(owner.address, tokenAmount)

        // approve the proxy to swap your tokens
        await ERC20Src.approve(ProxyOFT_A.address, tokenAmount)

        // swaps tokens to other chain
        await ProxyOFT_A.sendFrom(owner.address, chainId_B, owner.address, tokenAmount, owner.address, ethers.constants.AddressZero, "0x")

        // tokens received on the dst chain
        expect(await OFT_B.balanceOf(owner.address)).to.be.equal(tokenAmount)

        // approve the contract to swap your tokens
        await OFT_B.approve(OFT_B.address, tokenAmount)

        // reverts because contract is approved, not the user
        await expect(
            OFT_B.connect(warlock).sendFrom(
                owner.address,
                chainId_C,
                warlock.address,
                tokenAmount,
                warlock.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ERC20: insufficient allowance")
    })

    it("sendFrom() - reverts if not approved on non proxy chain", async function () {
        const tokenAmount = 123
        await ERC20Src.mint(owner.address, tokenAmount)

        // approve the proxy to swap your tokens
        await ERC20Src.approve(ProxyOFT_A.address, tokenAmount)

        // swaps tokens to other chain
        await ProxyOFT_A.sendFrom(owner.address, chainId_B, owner.address, tokenAmount, owner.address, ethers.constants.AddressZero, "0x")

        // tokens received on the dst chain
        expect(await OFT_B.balanceOf(owner.address)).to.be.equal(tokenAmount)

        // reverts because user is not approved
        await expect(
            OFT_B.connect(warlock).sendFrom(
                owner.address,
                chainId_C,
                warlock.address,
                tokenAmount,
                warlock.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ERC20: insufficient allowance")
    })

    it("sendFrom() - reverts if someone else is approved, but not the sender", async function () {
        const tokenAmountA = 123
        const tokenAmountB = 456
        // mint to both owners
        await ERC20Src.mint(owner.address, tokenAmountA)
        await ERC20Src.mint(warlock.address, tokenAmountB)

        // approve owner.address to transfer, but not the other
        await ERC20Src.approve(ProxyOFT_A.address, tokenAmountA)

        await expect(
            ProxyOFT_A.connect(warlock).sendFrom(
                warlock.address,
                chainId_B,
                warlock.address,
                tokenAmountB,
                warlock.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ERC20: insufficient allowance")
        await expect(
            ProxyOFT_A.connect(warlock).sendFrom(
                warlock.address,
                chainId_B,
                owner.address,
                tokenAmountB,
                owner.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ERC20: insufficient allowance")
    })

    it("sendFrom() - reverts if sender does not own token", async function () {
        const tokenAmountA = 123
        const tokenAmountB = 456
        // mint to both owners
        await ERC20Src.mint(owner.address, tokenAmountA)
        await ERC20Src.mint(warlock.address, tokenAmountB)

        // approve owner.address to transfer, but not the other
        await ERC20Src.approve(ProxyOFT_A.address, tokenAmountA)

        await expect(
            ProxyOFT_A.connect(warlock).sendFrom(
                warlock.address,
                chainId_B,
                warlock.address,
                tokenAmountA,
                warlock.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ERC20: insufficient allowance")
        await expect(
            ProxyOFT_A.connect(warlock).sendFrom(
                warlock.address,
                chainId_B,
                owner.address,
                tokenAmountA,
                owner.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ERC20: insufficient allowance")
    })
})
