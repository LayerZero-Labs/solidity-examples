const { expect } = require("chai")
const { ethers } = require("hardhat")

describe("ONFT721: ", function () {
    const chainId_A = 1
    const chainId_B = 2
    const name = "OmnichainNonFungibleToken"
    const symbol = "ONFT"

    let owner, warlock, lzEndpointMockA, lzEndpointMockB, LZEndpointMock, ONFT, ONFT_A, ONFT_B, LzLibFactory, lzLib

    before(async function () {
        owner = (await ethers.getSigners())[0]
        warlock = (await ethers.getSigners())[1]
        LzLibFactory = await ethers.getContractFactory("LzLib")
        lzLib = await LzLibFactory.deploy();
        LZEndpointMock = await ethers.getContractFactory("LZEndpointMock")
        ONFT = await ethers.getContractFactory("ONFT721Mock")
    })

    beforeEach(async function () {
        lzEndpointMockA = await LZEndpointMock.deploy(chainId_A)
        lzEndpointMockB = await LZEndpointMock.deploy(chainId_B)

        // generate a proxy to allow it to go ONFT
        ONFT_A = await ONFT.deploy(name, symbol, lzEndpointMockA.address)
        ONFT_B = await ONFT.deploy(name, symbol, lzEndpointMockB.address)

        // wire the lz endpoints to guide msgs back and forth
        lzEndpointMockA.setDestLzEndpoint(ONFT_B.address, lzEndpointMockB.address)
        lzEndpointMockB.setDestLzEndpoint(ONFT_A.address, lzEndpointMockA.address)

        // set each contracts source address so it can send to each other
        await ONFT_A.setTrustedRemote(chainId_B, ONFT_B.address)
        await ONFT_B.setTrustedRemote(chainId_A, ONFT_A.address)
    })

    it("sendFrom() - your own tokens", async function () {
        const tokenId = 123
        await ONFT_A.mint(owner.address, tokenId)

        // verify the owner of the token is on the source chain
        expect(await ONFT_A.ownerOf(tokenId)).to.be.equal(owner.address)

        // token doesn't exist on other chain
        await expect(ONFT_B.ownerOf(tokenId)).to.be.revertedWith("ERC721: owner query for nonexistent token")

        // can transfer token on srcChain as regular erC721
        await ONFT_A.transferFrom(owner.address, warlock.address, tokenId)
        expect(await ONFT_A.ownerOf(tokenId)).to.be.equal(warlock.address)

        // approve the proxy to swap your token
        await ONFT_A.connect(warlock).approve(ONFT_A.address, tokenId)

        // swaps token to other chain
        await ONFT_A.connect(warlock).sendFrom(
            warlock.address,
            chainId_B,
            warlock.address,
            tokenId,
            warlock.address,
            ethers.constants.AddressZero,
            "0x"
        )

        // token is burnt
        await expect(ONFT_A.ownerOf(tokenId)).to.be.revertedWith("ERC721: owner query for nonexistent token")

        // token received on the dst chain
        expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(warlock.address)

        // can send to other onft contract eg. not the original nft contract chain
        await ONFT_B.connect(warlock).sendFrom(
            warlock.address,
            chainId_A,
            warlock.address,
            tokenId,
            warlock.address,
            ethers.constants.AddressZero,
            "0x"
        )

        // token is burned on the sending chain
        await expect(ONFT_B.ownerOf(tokenId)).to.be.revertedWith("ERC721: owner query for nonexistent token")
    })

    it("sendFrom() - reverts if not owner on non proxy chain", async function () {
        const tokenId = 123
        await ONFT_A.mint(owner.address, tokenId)

        // approve the proxy to swap your token
        await ONFT_A.approve(ONFT_A.address, tokenId)

        // swaps token to other chain
        await ONFT_A.sendFrom(owner.address, chainId_B, owner.address, tokenId, owner.address, ethers.constants.AddressZero, "0x")

        // token received on the dst chain
        expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(owner.address)

        // reverts because other address does not own it
        await expect(
            ONFT_B.connect(warlock).sendFrom(
                warlock.address,
                chainId_A,
                warlock.address,
                tokenId,
                warlock.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ONFT721: send caller is not owner nor approved")
    })

    it("sendFrom() - on behalf of other user", async function () {
        const tokenId = 123
        await ONFT_A.mint(owner.address, tokenId)

        // approve the proxy to swap your token
        await ONFT_A.approve(ONFT_A.address, tokenId)

        // swaps token to other chain
        await ONFT_A.sendFrom(owner.address, chainId_B, owner.address, tokenId, owner.address, ethers.constants.AddressZero, "0x")

        // token received on the dst chain
        expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(owner.address)

        // approve the other user to send the token
        await ONFT_B.approve(warlock.address, tokenId)

        // sends across
        await ONFT_B.connect(warlock).sendFrom(
            owner.address,
            chainId_A,
            warlock.address,
            tokenId,
            warlock.address,
            ethers.constants.AddressZero,
            "0x"
        )

        // token received on the dst chain
        expect(await ONFT_A.ownerOf(tokenId)).to.be.equal(warlock.address)
    })

    it("sendFrom() - reverts if contract is approved, but not the sending user", async function () {
        const tokenId = 123
        await ONFT_A.mint(owner.address, tokenId)

        // approve the proxy to swap your token
        await ONFT_A.approve(ONFT_A.address, tokenId)

        // swaps token to other chain
        await ONFT_A.sendFrom(owner.address, chainId_B, owner.address, tokenId, owner.address, ethers.constants.AddressZero, "0x")

        // token received on the dst chain
        expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(owner.address)

        // approve the contract to swap your token
        await ONFT_B.approve(ONFT_B.address, tokenId)

        // reverts because contract is approved, not the user
        await expect(
            ONFT_B.connect(warlock).sendFrom(
                owner.address,
                chainId_A,
                warlock.address,
                tokenId,
                warlock.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ONFT721: send caller is not owner nor approved")
    })

    it("sendFrom() - reverts if not approved on non proxy chain", async function () {
        const tokenId = 123
        await ONFT_A.mint(owner.address, tokenId)

        // approve the proxy to swap your token
        await ONFT_A.approve(ONFT_A.address, tokenId)

        // swaps token to other chain
        await ONFT_A.sendFrom(owner.address, chainId_B, owner.address, tokenId, owner.address, ethers.constants.AddressZero, "0x")

        // token received on the dst chain
        expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(owner.address)

        // reverts because user is not approved
        await expect(
            ONFT_B.connect(warlock).sendFrom(
                owner.address,
                chainId_A,
                warlock.address,
                tokenId,
                warlock.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ONFT721: send caller is not owner nor approved")
    })

    it("sendFrom() - reverts if sender does not own token", async function () {
        const tokenIdA = 123
        const tokenIdB = 456
        // mint to both owners
        await ONFT_A.mint(owner.address, tokenIdA)
        await ONFT_A.mint(warlock.address, tokenIdB)

        // approve owner.address to transfer, but not the other
        await ONFT_A.setApprovalForAll(ONFT_A.address, true)

        await expect(
            ONFT_A.connect(warlock).sendFrom(
                warlock.address,
                chainId_B,
                warlock.address,
                tokenIdA,
                warlock.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ONFT721: send caller is not owner nor approved")
        await expect(
            ONFT_A.connect(warlock).sendFrom(
                warlock.address,
                chainId_B,
                owner.address,
                tokenIdA,
                owner.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ONFT721: send caller is not owner nor approved")
    })
})
