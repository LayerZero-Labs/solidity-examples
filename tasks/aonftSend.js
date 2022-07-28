const CHAIN_ID = require("../constants/chainIds.json")

module.exports = async function (taskArgs, hre) {
    const signers = await ethers.getSigners()
    const owner = signers[0]
    const dstChainId = CHAIN_ID[taskArgs.targetNetwork]
    const tokenId = taskArgs.tokenId
    const advancedONFT = await ethers.getContract("AdvancedONFT721")
    console.log(`[source] AdvancedONFT721.address: ${advancedONFT.address}`)

    let adapterParams = ethers.utils.solidityPack(["uint16", "uint256"], [1, 200000]) // default adapterParams example

    try {
        let tx = await (
            await advancedONFT.sendFrom(
                owner.address,
                dstChainId,
                owner.address,
                tokenId,
                owner.address,
                ethers.constants.AddressZero,
                adapterParams,
                {
                    value: ethers.utils.parseEther("1"),
                }
            )
        ).wait()
        console.log(`✅ [${hre.network.name}] send(${dstChainId}, ${tokenId})`)
        console.log(` tx: ${tx.transactionHash}`)
    } catch (e) {
        if (e.message.includes("Message sender must own the OmnichainNFT.")) {
            console.log("*Message sender must own the OmnichainNFT.*")
        } else if (e.message.includes("This chain is not a trusted source source.")) {
            console.log("*This chain is not a trusted source source.*")
        } else {
            console.log(e)
        }
    }
}
