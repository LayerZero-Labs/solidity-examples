const { expect } = require("chai")
const { ethers } = require("hardhat")
const { MerkleTree } = require("merkletreejs")

describe("AdvancedONFT721: ", function () {
    const chainIdSrc = 1
    const chainIdDst = 2
    const name = "AdvancedONFT"
    const symbol = "AONFT"

    let owner, lzEndpointSrcMock, lzEndpointDstMock, ONFTSrc, ONFTDst, LZEndpointMock, ONFT, ONFTSrcIds, ONFTDstIds
    // AONFT specific variables
    let maxTokensPerMint, baseURI, hiddenURI
    let whitelisted, notWhitelisted, tree
    let merkleProof, merkleProofUser1, invalidMerkeProof

    before(async function () {
        const signers = await ethers.getSigners()
        owner = (await ethers.getSigners())[0]
        user1 = (await ethers.getSigners())[1]

        whitelisted = signers.slice(0, 5);
        notWhitelisted = signers.slice(5, 10);

        LZEndpointMock = await ethers.getContractFactory("LZEndpointMock")
        ONFT = await ethers.getContractFactory("AdvancedONFT721")
        ONFTSrcIds = [0, 2] // [startID, endID]... only allowed to mint two ONFTs
        ONFTDstIds = [2, 4] // [startID, endID]... only allowed to mint two ONFTs
        maxTokensPerMint = 2
        baseURI = ""
        hiddenURI = ""
    })

    beforeEach(async function () {
        lzEndpointSrcMock = await LZEndpointMock.deploy(chainIdSrc)
        lzEndpointDstMock = await LZEndpointMock.deploy(chainIdDst)

        // crea te two UniversalONFT instances
        ONFTSrc = await ONFT.deploy(name, symbol, lzEndpointSrcMock.address, ONFTSrcIds[0], ONFTSrcIds[1], maxTokensPerMint, baseURI, hiddenURI)
        ONFTDst = await ONFT.deploy(name, symbol, lzEndpointDstMock.address, ONFTDstIds[0], ONFTDstIds[1], maxTokensPerMint, baseURI, hiddenURI)

        lzEndpointSrcMock.setDestLzEndpoint(ONFTDst.address, lzEndpointDstMock.address)
        lzEndpointDstMock.setDestLzEndpoint(ONFTSrc.address, lzEndpointSrcMock.address)

        // set each contracts source address so it can send to each other
        await ONFTSrc.setTrustedRemote(chainIdDst, ONFTDst.address) // for A, set B
        await ONFTDst.setTrustedRemote(chainIdSrc, ONFTSrc.address) // for B, set A

        // Generate Merkle Root and setting up to contract
        const leaves = await Promise.all(
            whitelisted.map(async (account) => {
                const address = await account.getAddress();
                return ethers.utils.keccak256(address);
            })
        );
        tree = new MerkleTree(leaves, ethers.utils.keccak256, {
            sortPairs: true,
        });
        const merkleRoot = tree.getHexRoot();

        // Get Merkle Proof to mint in private sale
        merkleProof = tree.getHexProof(ethers.utils.keccak256(owner.address))
        merkleProofUser1 = tree.getHexProof(ethers.utils.keccak256(user1.address))
        invalidMerkeProof = tree.getHexProof(ethers.utils.keccak256(notWhitelisted[0].address))

        await ONFTSrc.setMerkleRoot(merkleRoot)
    })

    it("sendFrom() - mint on the source chain and send ONFT to the destination chain", async function () {
        //activate public sale
        await ONFTSrc.flipSaleStarted()
        await ONFTSrc.flipPublicSaleStarted()
        // mint ONFTs
        const newId = (await ONFTSrc.nextMintId()) + 1
        await ONFTSrc.publicMint(2)

        // verify the owner of the token is on the source chain
        expect(await ONFTSrc.ownerOf(newId)).to.be.equal(owner.address)

        // approve and send ONFT
        await ONFTSrc.approve(ONFTSrc.address, newId)
        // v1 adapterParams, encoded for version 1 style, and 250k gas quote
        const adapterParam = ethers.utils.solidityPack(["uint16", "uint256"], [1, 250000])

        await ONFTSrc.sendFrom(
            owner.address,
            chainIdDst,
            owner.address,
            newId,
            owner.address,
            "0x000000000000000000000000000000000000dEaD",
            adapterParam
        )

        // verify the owner of the token is no longer on the source chain
        await expect(ONFTSrc.ownerOf(newId)).to.revertedWith("ERC721: owner query for nonexistent token")

        // verify the owner of the token is on the destination chain
        expect(await ONFTDst.ownerOf(newId)).to.be.equal(owner.address)

        // hit the max mint on the source chain
        await expect(ONFTSrc.publicMint(1)).to.revertedWith("AdvancedONFT721: max mint limit reached")
    })

    it("does not mint if the private sale is open but the user is not whitelisted", async () => {
        //activate private sale
        await ONFTSrc.flipSaleStarted()
        //try to mint ONFTs
        await expect(ONFTSrc.mint(1, invalidMerkeProof)).to.revertedWith("AdvancedONFT721: Invalid Merkle Proof")
    })

    it("mints multiple tokens if the private sale is open and a user is whitelisted", async () => {
        //activate private sale
        await ONFTSrc.flipSaleStarted()
        //mint ONFTs
        await ONFTSrc.mint(2, merkleProof)
        //inspect the balance
        expect(await ONFTSrc.balanceOf(owner.address)).to.be.equal(2)
    })

    it("mints multiple tokens to multiple users if the public sale has started", async () => {
        //activate public sale
        await ONFTSrc.flipSaleStarted()
        await ONFTSrc.flipPublicSaleStarted()
        //mint ONFTs
        await ONFTSrc.publicMint(1)
        await ONFTSrc.connect(user1).publicMint(1)
        //inspect the balance
        expect(await ONFTSrc.balanceOf(owner.address)).to.be.equal(1)
        expect(await ONFTSrc.balanceOf(user1.address)).to.be.equal(1)
    })

    it("changes baseURI and contractURI after getting deployed", async () => {
        //reveal metadata
        await ONFTSrc.flipRevealed()
        //activate public sale and mint a ONFT
        await ONFTSrc.flipSaleStarted()
        await ONFTSrc.flipPublicSaleStarted()
        await ONFTSrc.publicMint(1)
        //change URIs
        await ONFTSrc.setBaseURI("newBaseURI")
        await ONFTSrc.setContractURI("newContractURI")
        //inspect the new URIS
        expect(await ONFTSrc.contractURI()).to.be.equal("newContractURI")
        expect(await ONFTSrc.tokenURI(1)).to.be.equal("newBaseURI1")
    })

    it("sets a new price and withdraws the balance to beneficiary after minting", async () => {
        //activate private sale
        await ONFTSrc.flipSaleStarted()
        //set a new price
        await ONFTSrc.setPrice(ethers.utils.parseEther("0.05"))
        //mint ONFTs
        await ONFTSrc.mint(2, merkleProof, { value: ethers.utils.parseEther("0.10") })
        //set a beneficiary
        await ONFTSrc.setBeneficiary((await ethers.getSigners())[2].address)
        //withdraw ETH from the private sale
        await ONFTSrc.withdraw()
        //expect beneficiary balance to increase properly
        expect(await (await ethers.getSigners())[2].getBalance()).to.be.equal(ethers.utils.parseEther("10000.10"))
    })

    it("on-chain royalties: properly returns the royalty amount and the beneficiary", async () => {
        //pass 1 ETH and 1 tokenID as a sample sale info
        const royalty = await ONFTSrc.royaltyInfo(1, ethers.utils.parseEther("1.0"))
        expect(royalty.receiver).to.be.equal(owner.address)
        //keep in mind that the default royalty rate is 500 basis points or 5%
        expect(royalty.royaltyAmount).to.be.equal(ethers.utils.parseEther("0.05"))
    })

    it("enumerable features: properly reads total supply, tokenOfOwnerByIndex and tokenByIndex", async () => {
        //activate private sale
        await ONFTSrc.flipSaleStarted()
        //mint ONFTs
        await ONFTSrc.mint(1, merkleProof)
        await ONFTSrc.connect(user1).mint(1, merkleProofUser1)
        //inspect the total supply
        expect(await ONFTSrc.totalSupply()).to.be.equal(2)
        //inspect tokenIds owned by the owner and user1 (alternative can call ownerOf and iterate through with a for loop)
        expect(await ONFTSrc.tokenOfOwnerByIndex(owner.address, 0)).to.be.equal(1)
        expect(await ONFTSrc.tokenOfOwnerByIndex(user1.address, 0)).to.be.equal(2)
        //inspect tokenIdsByIndex
        expect(await ONFTSrc.tokenByIndex(0)).to.be.equal(1)
        expect(await ONFTSrc.tokenByIndex(1)).to.be.equal(2)
    })
})
