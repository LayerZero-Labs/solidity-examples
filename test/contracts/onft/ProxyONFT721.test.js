const { expect } = require("chai")
const { ethers } = require("hardhat")

describe("ProxyONFT721: ", function () {
    const chainId_A = 1
    const chainId_B = 2
    const chainId_C = 3
    const name = "OmnichainNonFungibleToken"
    const symbol = "ONFT"

    let owner, warlock, lzEndpointMockA, lzEndpointMockB, lzEndpointMockC
    let ONFT_B, ONFT_C, LZEndpointMock, ONFT, ERC721, ERC721Src, ProxyONFT_A, ProxyONFT, LzLibFactory, lzLib

    before(async function () {
        owner = (await ethers.getSigners())[0]
        warlock = (await ethers.getSigners())[1]
        LZEndpointMock = await ethers.getContractFactory("LZEndpointMock")
        ONFT = await ethers.getContractFactory("ONFT721")
        ProxyONFT = await ethers.getContractFactory("ProxyONFT721")
        ERC721 = await ethers.getContractFactory("ERC721Mock")
    })

    beforeEach(async function () {
        lzEndpointMockA = await LZEndpointMock.deploy(chainId_A)
        lzEndpointMockB = await LZEndpointMock.deploy(chainId_B)
        lzEndpointMockC = await LZEndpointMock.deploy(chainId_C)

        // make an ERC721 to mock a previous deploy
        ERC721Src = await ERC721.deploy("ERC721", "ERC721")
        // generate a proxy to allow it to go ONFT
        ProxyONFT_A = await ProxyONFT.deploy(lzEndpointMockA.address, ERC721Src.address)

        // create ONFT on dstChains
        ONFT_B = await ONFT.deploy(name, symbol, lzEndpointMockB.address)
        ONFT_C = await ONFT.deploy(name, symbol, lzEndpointMockC.address)

        // wire the lz endpoints to guide msgs back and forth
        lzEndpointMockA.setDestLzEndpoint(ONFT_B.address, lzEndpointMockB.address)
        lzEndpointMockA.setDestLzEndpoint(ONFT_C.address, lzEndpointMockC.address)
        lzEndpointMockB.setDestLzEndpoint(ProxyONFT_A.address, lzEndpointMockA.address)
        lzEndpointMockB.setDestLzEndpoint(ONFT_C.address, lzEndpointMockC.address)
        lzEndpointMockC.setDestLzEndpoint(ProxyONFT_A.address, lzEndpointMockA.address)
        lzEndpointMockC.setDestLzEndpoint(ONFT_B.address, lzEndpointMockB.address)

        // set each contracts source address so it can send to each other
        await ProxyONFT_A.setTrustedRemote(chainId_B, ONFT_B.address)
        await ProxyONFT_A.setTrustedRemote(chainId_C, ONFT_C.address)
        await ONFT_B.setTrustedRemote(chainId_A, ProxyONFT_A.address)
        await ONFT_B.setTrustedRemote(chainId_C, ONFT_C.address)
        await ONFT_C.setTrustedRemote(chainId_A, ProxyONFT_A.address)
        await ONFT_C.setTrustedRemote(chainId_B, ONFT_B.address)
    })

    it("sendFrom() - your own tokens", async function () {
        const tokenId = 123
        await ERC721Src.mint(owner.address, tokenId)

        // verify the owner of the token is on the source chain
        expect(await ERC721Src.ownerOf(tokenId)).to.be.equal(owner.address)

        // token doesn't exist on other chain
        await expect(ONFT_B.ownerOf(tokenId)).to.be.revertedWith("ERC721: owner query for nonexistent token")

        // can transfer token on srcChain as regular erC721
        await ERC721Src.transfer(warlock.address, tokenId)
        expect(await ERC721Src.ownerOf(tokenId)).to.be.equal(warlock.address)

        // approve the proxy to swap your token
        await ERC721Src.connect(warlock).approve(ProxyONFT_A.address, tokenId)

        // swaps token to other chain
        await ProxyONFT_A.connect(warlock).sendFrom(
            warlock.address,
            chainId_B,
            warlock.address,
            tokenId,
            warlock.address,
            ethers.constants.AddressZero,
            "0x"
        )

        // token is now owned by the proxy contract, because this is the original nft chain
        expect(await ERC721Src.ownerOf(tokenId)).to.equal(ProxyONFT_A.address)

        // token received on the dst chain
        expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(warlock.address)

        // can send to other onft contract eg. not the original nft contract chain
        await ONFT_B.connect(warlock).sendFrom(
            warlock.address,
            chainId_C,
            warlock.address,
            tokenId,
            warlock.address,
            ethers.constants.AddressZero,
            "0x"
        )

        // token is burned on the sending chain
        expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(ONFT_B.address)

        // token received on the dst chain
        expect(await ONFT_C.ownerOf(tokenId)).to.be.equal(warlock.address)

        // send it back to the original chain
        await ONFT_C.connect(warlock).sendFrom(
            warlock.address,
            chainId_A,
            warlock.address,
            tokenId,
            warlock.address,
            ethers.constants.AddressZero,
            "0x"
        )

        // token is burned on the sending chain
        expect(await ONFT_C.ownerOf(tokenId)).to.be.equal(ONFT_C.address)

        // is received on the original chain
        expect(await ERC721Src.ownerOf(tokenId)).to.be.equal(warlock.address)
    })

    it("sendFrom() - reverts if not approved on proxy", async function () {
        const tokenId = 123
        await ERC721Src.mint(owner.address, tokenId)
        await expect(
            ProxyONFT_A.sendFrom(owner.address, chainId_B, owner.address, tokenId, owner.address, ethers.constants.AddressZero, "0x")
        ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved")
    })

    it("sendFrom() - reverts if from is not msgSender", async function () {
        const tokenId = 123
        await ERC721Src.mint(owner.address, tokenId)

        // approve the proxy to swap your token
        await ERC721Src.approve(ProxyONFT_A.address, tokenId)

        // swaps token to other chain
        await expect(
            ProxyONFT_A.connect(warlock).sendFrom(
                owner.address,
                chainId_B,
                owner.address,
                tokenId,
                owner.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ProxyONFT721: owner is not send caller")
    })

    it("sendFrom() - reverts if not owner on non proxy chain", async function () {
        const tokenId = 123
        await ERC721Src.mint(owner.address, tokenId)

        // approve the proxy to swap your token
        await ERC721Src.approve(ProxyONFT_A.address, tokenId)

        // swaps token to other chain
        await ProxyONFT_A.sendFrom(owner.address, chainId_B, owner.address, tokenId, owner.address, ethers.constants.AddressZero, "0x")

        // token received on the dst chain
        expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(owner.address)

        // reverts because other address does not own it
        await expect(
            ONFT_B.connect(warlock).sendFrom(
                warlock.address,
                chainId_C,
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
        await ERC721Src.mint(owner.address, tokenId)

        // approve the proxy to swap your token
        await ERC721Src.approve(ProxyONFT_A.address, tokenId)

        // swaps token to other chain
        await ProxyONFT_A.sendFrom(owner.address, chainId_B, owner.address, tokenId, owner.address, ethers.constants.AddressZero, "0x")

        // token received on the dst chain
        expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(owner.address)

        // approve the other user to send the token
        await ONFT_B.approve(warlock.address, tokenId)

        // sends across
        await ONFT_B.connect(warlock).sendFrom(
            owner.address,
            chainId_C,
            warlock.address,
            tokenId,
            warlock.address,
            ethers.constants.AddressZero,
            "0x"
        )

        // token received on the dst chain
        expect(await ONFT_C.ownerOf(tokenId)).to.be.equal(warlock.address)
    })

    it("sendFrom() - reverts if contract is approved, but not the sending user", async function () {
        const tokenId = 123
        await ERC721Src.mint(owner.address, tokenId)

        // approve the proxy to swap your token
        await ERC721Src.approve(ProxyONFT_A.address, tokenId)

        // swaps token to other chain
        await ProxyONFT_A.sendFrom(owner.address, chainId_B, owner.address, tokenId, owner.address, ethers.constants.AddressZero, "0x")

        // token received on the dst chain
        expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(owner.address)

        // approve the contract to swap your token
        await ONFT_B.approve(ONFT_B.address, tokenId)

        // reverts because contract is approved, not the user
        await expect(
            ONFT_B.connect(warlock).sendFrom(
                owner.address,
                chainId_C,
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
        await ERC721Src.mint(owner.address, tokenId)

        // approve the proxy to swap your token
        await ERC721Src.approve(ProxyONFT_A.address, tokenId)

        // swaps token to other chain
        await ProxyONFT_A.sendFrom(owner.address, chainId_B, owner.address, tokenId, owner.address, ethers.constants.AddressZero, "0x")

        // token received on the dst chain
        expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(owner.address)

        // reverts because user is not approved
        await expect(
            ONFT_B.connect(warlock).sendFrom(
                owner.address,
                chainId_C,
                warlock.address,
                tokenId,
                warlock.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ONFT721: send caller is not owner nor approved")
    })

    it("sendFrom() - reverts if someone else is approved, but not the sender", async function () {
        const tokenIdA = 123
        const tokenIdB = 456
        // mint to both owners
        await ERC721Src.mint(owner.address, tokenIdA)
        await ERC721Src.mint(warlock.address, tokenIdB)

        // approve owner.address to transfer, but not the other
        await ERC721Src.setApprovalForAll(ProxyONFT_A.address, true)

        await expect(
            ProxyONFT_A.connect(warlock).sendFrom(
                warlock.address,
                chainId_B,
                warlock.address,
                tokenIdB,
                warlock.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved")
        await expect(
            ProxyONFT_A.connect(warlock).sendFrom(
                warlock.address,
                chainId_B,
                owner.address,
                tokenIdB,
                owner.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved")
    })

    it("sendFrom() - reverts if sender does not own token", async function () {
        const tokenIdA = 123
        const tokenIdB = 456
        // mint to both owners
        await ERC721Src.mint(owner.address, tokenIdA)
        await ERC721Src.mint(warlock.address, tokenIdB)

        // approve owner.address to transfer, but not the other
        await ERC721Src.setApprovalForAll(ProxyONFT_A.address, true)

        await expect(
            ProxyONFT_A.connect(warlock).sendFrom(
                warlock.address,
                chainId_B,
                warlock.address,
                tokenIdA,
                warlock.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ERC721: transfer from incorrect owner")
        await expect(
            ProxyONFT_A.connect(warlock).sendFrom(
                warlock.address,
                chainId_B,
                owner.address,
                tokenIdA,
                owner.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ERC721: transfer from incorrect owner")
    })
})
